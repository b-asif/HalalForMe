import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from '../supabase';
import { haversineMi } from '../geo';
import { fetchNearestMosques, searchOsmMosquesByName, Mosque } from './overpass';

const MANUAL_CACHE_TTL_MS = 15 * 60 * 1000;
const MANUAL_STORAGE_PREFIX = 'manual_mosque_cache_v2:';
const IQAMA_STORAGE_PREFIX = 'iqama_mosque_cache_v1:';

interface ManualCacheEntry { timestamp: number; mosques: Mosque[] }

const manualMemoryCache = new Map<string, ManualCacheEntry>();

function manualCacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

async function readManualCache(prefix: string, key: string): Promise<ManualCacheEntry | null> {
  const mem = manualMemoryCache.get(prefix + key);
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(prefix + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManualCacheEntry;
    manualMemoryCache.set(prefix + key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function writeManualCache(prefix: string, key: string, entry: ManualCacheEntry): Promise<void> {
  manualMemoryCache.set(prefix + key, entry);
  await AsyncStorage.setItem(prefix + key, JSON.stringify(entry)).catch(() => {});
}

// 32 chars (no 0/O/1/I — easier to read aloud) divides 256 evenly, so
// byte % 32 is uniform with no modulo bias to worry about.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateInviteCode(length = 8): string {
  // Crypto.getRandomBytes (not Math.random) — this code grants mosque
  // ownership, so it needs to be unguessable, not just "random enough."
  const bytes = Crypto.getRandomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return out;
}

// Manually-added mosques (not in OpenStreetMap) get a synthetic id in the
// same osm_id column, shaped like OSM's own "node/<id>" / "way/<id>" — so
// every existing lookup (`.eq('osm_id', ...)`, the URL-encoding gotcha, the
// invite-code flow) works unchanged without a second code path.
export function generateManualOsmId(): string {
  return `manual/${Crypto.randomUUID()}`;
}

// iqama_times/jummah_sessions store times as free-text strings (e.g.
// "1:15 PM") since mosques sometimes phrase these loosely — parsed into a
// Date for picker editing/sorting, formatted back to the same style string
// on save. Shared by the manage screen's time pickers and anything that
// needs to sort/display these times (e.g. Home's upcoming-Jummah widget).
export function parseTimeOfDay(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function formatTimeOfDay(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

interface ManualMosqueRow {
  osm_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export async function fetchManualMosques(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): Promise<Mosque[]> {
  const key = manualCacheKey(latitude, longitude);
  const cached = await readManualCache(MANUAL_STORAGE_PREFIX, key);
  const isFresh = !!cached && (Date.now() - cached.timestamp) < MANUAL_CACHE_TTL_MS;

  let allMosques: Mosque[];
  if (isFresh) {
    allMosques = cached!.mosques;
  } else {
    // Fetch ALL onboarded mosques in the area (not just manual/ ones) so that
    // any mosque with a Supabase entry and correct lat/lng is always in the
    // candidate pool — regardless of whether its osm_id was set from OSM or
    // generated manually. Duplicates with Overpass results are handled by
    // dedupeByNameAndLocation in fetchNearestMosquesIncludingManual.
    const { data, error } = await supabase
      .from('mosques')
      .select('osm_id, name, address, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', latitude - 0.5)
      .lte('lat', latitude + 0.5)
      .gte('lng', longitude - 0.5)
      .lte('lng', longitude + 0.5)
      .limit(200);

    if (error || !data) return [];

    allMosques = (data as ManualMosqueRow[]).map((m): Mosque => ({
      id: m.osm_id,
      name: m.name,
      address: m.address,
      lat: m.lat!,
      lng: m.lng!,
      distanceMi: haversineMi(latitude, longitude, m.lat!, m.lng!),
    }));

    await writeManualCache(MANUAL_STORAGE_PREFIX, key, { timestamp: Date.now(), mosques: allMosques });
  }

  const radiusMi = radiusMeters / 1609.34;
  return allMosques.filter(m => m.distanceMi <= radiusMi);
}

// Deduplicate mosques that share the same name and are within 0.15 miles of
// each other — catches both OSM node+way duplicates for the same building and
// stale-cache manual entries that duplicate an OSM result.
function dedupeByNameAndLocation(mosques: Mosque[]): Mosque[] {
  const out: Mosque[] = [];
  for (const m of mosques) {
    const isDupe = out.some(
      existing =>
        existing.name.toLowerCase() === m.name.toLowerCase() &&
        haversineMi(existing.lat, existing.lng, m.lat, m.lng) < 0.15,
    );
    if (!isDupe) out.push(m);
  }
  return out;
}

/**
 * Nearby mosques from OpenStreetMap plus any manually-added mosques (not in
 * OSM) — merged and sorted together so a manually-added mosque behaves
 * identically to an OSM one in every "nearby mosques" surface, not just one.
 */
export async function fetchNearestMosquesIncludingManual(
  latitude: number,
  longitude: number,
  radiusMeters = 8000,
  limit = 5,
): Promise<Mosque[]> {
  const [osmMosques, manualMosques] = await Promise.all([
    fetchNearestMosques(latitude, longitude, radiusMeters, limit).catch(() => []),
    fetchManualMosques(latitude, longitude, radiusMeters),
  ]);

  return dedupeByNameAndLocation(
    [...osmMosques, ...manualMosques].sort((a, b) => a.distanceMi - b.distanceMi),
  ).slice(0, limit);
}

/**
 * Name search against this app's own mosques table — no geo constraint
 * (small table, and these are exactly the mosques with a real page, the
 * most valuable results to surface). `latitude`/`longitude` are only used
 * to populate `distanceMi` for display/sorting, not to filter results.
 */
export async function searchMosquesByName(
  query: string,
  latitude: number,
  longitude: number,
  limit = 20,
): Promise<Mosque[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from('mosques')
    .select('osm_id, name, address, lat, lng')
    .ilike('name', `%${trimmed}%`)
    .limit(limit);

  if (error || !data) return [];

  // No lat/lng requirement here (unlike fetchManualMosques) — this is a name
  // lookup, not a proximity one, and excluding rows without coordinates
  // silently hid real matches (e.g. the detail screen's "may already have a
  // page" fallback missing a row that had null lat/lng for any reason).
  // distanceMi is meaningless for such a row; callers that only care about
  // whether a name matches (not how far away it is) can ignore it.
  return (data as ManualMosqueRow[]).map((m): Mosque => ({
    id: m.osm_id,
    name: m.name,
    address: m.address,
    lat: m.lat ?? 0,
    lng: m.lng ?? 0,
    distanceMi: m.lat != null && m.lng != null ? haversineMi(latitude, longitude, m.lat, m.lng) : 0,
  }));
}

/**
 * All mosques in this app's table that have iqama_times entered, sorted by
 * distance from the given coordinates. When lat/lng/radiusM are provided, a
 * ±0.5-degree bbox pre-filter is applied at the DB level to reduce payload.
 */
export async function fetchMosquesWithIqamaTimes(
  latitude: number,
  longitude: number,
  radiusM?: number,
): Promise<Mosque[]> {
  const key = manualCacheKey(latitude, longitude);
  const cached = await readManualCache(IQAMA_STORAGE_PREFIX, key);
  const isFresh = !!cached && (Date.now() - cached.timestamp) < MANUAL_CACHE_TTL_MS;

  let mosques: Mosque[];
  if (isFresh) {
    mosques = cached!.mosques;
  } else {
    let query = supabase
      .from('mosques')
      .select('osm_id, name, address, lat, lng')
      .not('iqama_times', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null);

    if (radiusM !== undefined) {
      query = query
        .gte('lat', latitude - 0.5)
        .lte('lat', latitude + 0.5)
        .gte('lng', longitude - 0.5)
        .lte('lng', longitude + 0.5);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    mosques = (data as ManualMosqueRow[])
      .map((m): Mosque => ({
        id: m.osm_id,
        name: m.name,
        address: m.address,
        lat: m.lat!,
        lng: m.lng!,
        distanceMi: haversineMi(latitude, longitude, m.lat!, m.lng!),
      }))
      .sort((a, b) => a.distanceMi - b.distanceMi);

    await writeManualCache(IQAMA_STORAGE_PREFIX, key, { timestamp: Date.now(), mosques });
  }

  return mosques;
}

/**
 * Combined mosque name search: OpenStreetMap (any mosque, claimed or not)
 * plus this app's own mosques table (claimed/manually-added), deduped by
 * osm_id so a claimed mosque appears once, not twice, when it matches both.
 */
export async function searchMosques(
  query: string,
  latitude: number,
  longitude: number,
): Promise<Mosque[]> {
  const [osmResults, ownResults] = await Promise.all([
    searchOsmMosquesByName(query, latitude, longitude).catch(() => []),
    searchMosquesByName(query, latitude, longitude),
  ]);

  const seen = new Set<string>();
  const merged: Mosque[] = [];
  // Own-table results first so a claimed mosque's page-backed entry wins
  // the dedupe over its raw OSM counterpart.
  for (const m of [...ownResults, ...osmResults]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    merged.push(m);
  }

  return merged.sort((a, b) => a.distanceMi - b.distanceMi);
}
