import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from '../errors';
import { haversineMi } from '../geo';

export interface Mosque {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distanceMi: number;
}

// Multiple public Overpass mirrors — the primary instance's rate limiting is
// aggressive enough that a handful of dev-time reloads alone can trip a 429
// that then stays tripped for several minutes. Falling through to another
// public mirror is more useful than just erroring out.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Always fetch this wide a radius and cache the result, regardless of what a
// caller asks for — the home-screen widget + the full Mosques list screen
// were each independently hitting the network for the same location on
// every mount. Fetching the widest radius any caller needs once, then
// slicing it client-side per caller, collapses that to one real network
// call per area instead of one per screen.
// 42 km covers the 25-mile max radius the Mosques UI exposes (25 mi ≈ 40.2 km).
const FETCH_RADIUS_METERS = 42_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const STORAGE_PREFIX = 'mosque_cache_v2:';

interface CacheEntry { timestamp: number; mosques: Mosque[] }

// In-memory first (fast, same session), backed by AsyncStorage so the cache
// survives a dev reload or app restart — an in-memory-only cache resets on
// every Fast Refresh, which meant every reload re-hit Overpass regardless of
// how recently it had already been called for the same spot.
const memoryCache = new Map<string, CacheEntry>();

// ~1.1km grid — coordinates within the same cell share a cache entry, so
// minor GPS jitter between calls doesn't defeat the cache.
function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

async function readCache(key: string): Promise<CacheEntry | null> {
  const mem = memoryCache.get(key);
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(key: string, entry: CacheEntry): Promise<void> {
  memoryCache.set(key, entry);
  await AsyncStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry)).catch(() => {});
}

function addressFromTags(tags: Record<string, string>): string | null {
  const parts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
  const line = parts.join(' ');
  return line || tags['addr:full'] || null;
}

// Shared element→Mosque mapping, reused by both the nearby-radius query and
// the name-search query below — the only difference between them is the
// Overpass QL filter itself, not how a response gets turned into Mosque[].
function parseElements(elements: any[], latitude: number, longitude: number): Mosque[] {
  return elements
    .map((el): Mosque | null => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) return null;
      const tags = el.tags ?? {};
      // Small musallahs/prayer rooms are tagged with the same base
      // amenity+religion pair as full mosques but are far less likely to
      // have a `name` tag set — falling back to "Mosque" for those would
      // mislabel them, so `place_of_worship=musalla` (the OSM subtype tag
      // for exactly this case) gets a more accurate generic label instead.
      const name = tags.name || tags['name:en']
        || (tags.place_of_worship === 'musalla' ? 'Musalla / Prayer Room' : 'Mosque');
      return {
        id: `${el.type}/${el.id}`,
        name,
        address: addressFromTags(tags),
        lat,
        lng,
        distanceMi: haversineMi(latitude, longitude, lat, lng),
      };
    })
    .filter((m): m is Mosque => m !== null)
    .sort((a, b) => a.distanceMi - b.distanceMi);
}

// Cut way down from the old 15s: this is the ceiling any *one* mirror gets
// before it's considered unresponsive, not the total worst case (that's
// bounded by the hedging schedule below instead).
const MIRROR_TIMEOUT_MS = 6_000;
// Delay before hedging to the next mirror if the current one hasn't
// answered yet — short enough to keep worst-case latency low, long enough
// that a normally-responsive primary mirror never triggers a second request.
const HEDGE_DELAY_MS = 2_500;

async function runOverpassQuery(url: string, query: string, latitude: number, longitude: number): Promise<Mosque[]> {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    },
    MIRROR_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Overpass request failed (${res.status})`);

  const json = await res.json();
  return parseElements(json.elements ?? [], latitude, longitude);
}

// Hedged fallback across the public mirrors: only the first mirror is tried
// immediately. If it hasn't answered within HEDGE_DELAY_MS, the *next*
// mirror is fired in addition (not instead) — so a slow/dead primary
// doesn't block for a full sequential timeout, but the common case (primary
// responds fine) still only ever sends one request, which matters given
// these are public, shared, rate-limited instances (see OVERPASS_URLS
// comment above — full parallel racing on every call would triple load
// against infrastructure that already 429s under light use). An outright
// failure (not just slowness) moves to the next mirror immediately rather
// than waiting out the rest of its hedge delay. Whichever mirror answers
// first wins; the rest are left to resolve/reject unused.
function raceOverpassMirrors<T>(attempt: (url: string) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let nextIndex = 0;
    let pending = 0;
    let lastErr: unknown;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const startNext = () => {
      if (settled || nextIndex >= OVERPASS_URLS.length) return;
      const url = OVERPASS_URLS[nextIndex++];
      pending += 1;
      attempt(url).then(
        result => {
          if (settled) return;
          settled = true;
          timers.forEach(clearTimeout);
          resolve(result);
        },
        err => {
          lastErr = err;
          pending -= 1;
          if (settled) return;
          if (nextIndex < OVERPASS_URLS.length) startNext();
          else if (pending === 0) reject(lastErr);
        },
      );
    };

    startNext();
    for (let i = 1; i < OVERPASS_URLS.length; i++) {
      timers.push(setTimeout(startNext, i * HEDGE_DELAY_MS));
    }
  });
}

async function fetchFromOverpass(latitude: number, longitude: number): Promise<Mosque[]> {
  const query = `[out:json][timeout:15];(node["amenity"="place_of_worship"]["religion"="muslim"](around:${FETCH_RADIUS_METERS},${latitude},${longitude});way["amenity"="place_of_worship"]["religion"="muslim"](around:${FETCH_RADIUS_METERS},${latitude},${longitude}););out center;`;
  return raceOverpassMirrors(url => runOverpassQuery(url, query, latitude, longitude));
}

// User input goes into an Overpass QL regex tag filter — escape regex
// metacharacters so a query like "Al-Noor (Fremont)" can't break the query
// syntax or behave as an unintended pattern.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Name search against OpenStreetMap, anchored to a location with a wide
 * radius rather than global — Overpass QL needs a bounded area for a public
 * mirror to answer promptly, and "search for a mosque by name" realistically
 * means "one roughly in my region," not literally anywhere on Earth.
 */
export async function searchOsmMosquesByName(
  query: string,
  latitude: number,
  longitude: number,
  radiusMeters = 100_000,
): Promise<Mosque[]> {
  const safe = escapeRegExp(query.trim());
  if (!safe) return [];
  const overpassQuery = `[out:json][timeout:15];(node["amenity"="place_of_worship"]["religion"="muslim"]["name"~"${safe}",i](around:${radiusMeters},${latitude},${longitude});way["amenity"="place_of_worship"]["religion"="muslim"]["name"~"${safe}",i](around:${radiusMeters},${latitude},${longitude}););out center;`;
  return raceOverpassMirrors(url => runOverpassQuery(url, overpassQuery, latitude, longitude));
}

/**
 * Finds nearby mosques via OpenStreetMap's Overpass API — there is no
 * dedicated, publicly-available mosque API (Mawaqit, the closest thing to an
 * industry standard, keeps its API private and requires a direct partnership
 * request). OSM's `amenity=place_of_worship` + `religion=muslim` tagging is
 * community-maintained but dense and free, so it's used for location only;
 * this does not return prayer/iqama schedules.
 */
export async function fetchNearestMosques(
  latitude: number,
  longitude: number,
  radiusMeters = 8000,
  limit = 5,
): Promise<Mosque[]> {
  const key = cacheKey(latitude, longitude);
  const cached = await readCache(key);
  const isFresh = !!cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS;

  let mosques: Mosque[];
  if (isFresh) {
    mosques = cached!.mosques;
  } else {
    try {
      mosques = await fetchFromOverpass(latitude, longitude);
      await writeCache(key, { timestamp: Date.now(), mosques });
    } catch (err) {
      // All mirrors rate-limited/failed — mosque locations are effectively
      // static, so serving a stale cached result (if one exists) is strictly
      // better than surfacing an error over data that hasn't actually changed.
      if (cached) mosques = cached.mosques;
      else throw err;
    }
  }

  const radiusMi = radiusMeters / 1609.34;
  return mosques.filter(m => m.distanceMi <= radiusMi).slice(0, limit);
}
