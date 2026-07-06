import * as Location from 'expo-location';
import tzlookup from 'tz-lookup';

export interface ResolvedCoordinates {
  latitude: number;
  longitude: number;
  /** IANA time zone, resolved on-device from coordinates — no network call. */
  timeZone: string;
}

export interface ManualCity extends ResolvedCoordinates {
  /** What the user typed or selected — shown back to them, not used for lookup. */
  label: string;
}

/**
 * Resolves an IANA time zone from coordinates entirely on-device (via
 * `tz-lookup`'s bundled timezone-boundary data — no network call, no
 * dependency on the OS geocoder's timezone field, which expo-location only
 * populates on iOS).
 */
export function toResolvedCoordinates(latitude: number, longitude: number): ResolvedCoordinates | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  try {
    return { latitude, longitude, timeZone: tzlookup(latitude, longitude) };
  } catch {
    // tz-lookup throws on out-of-bounds input; should never happen with real
    // GPS/geocoder output, but a lookup failure should never crash the caller.
    return null;
  }
}

/**
 * Resolves the device's current GPS location. Returns null if permission is
 * denied or location is unavailable — callers should fall back to manual
 * city selection in that case, never treat this as a fatal error.
 */
export async function resolveGpsCoordinates(): Promise<ResolvedCoordinates | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return toResolvedCoordinates(pos.coords.latitude, pos.coords.longitude);
  } catch {
    return null;
  }
}

/**
 * Reverse-geocodes coordinates to an ISO 3166-1 alpha-2 country code, via the
 * same on-device OS geocoder as resolveManualCity — no network call to our
 * own backend or a third party. Used to detect when the user's location has
 * moved to a different country, so the prayer calculation method default can
 * follow (see recommendedMethodFor in methodDefaults.ts).
 */
export async function resolveCountryCode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    return results[0]?.isoCountryCode ?? null;
  } catch {
    return null;
  }
}

/**
 * Geocodes a free-text city/zip query into coordinates + time zone via the
 * OS-level geocoder (Apple/Google on-device) — this never calls our own
 * backend or a third-party geocoding service. Returns null if nothing is
 * found for the query.
 */
export async function resolveManualCity(query: string): Promise<ManualCity | null> {
  const label = query.trim();
  if (!label) return null;

  const results = await Location.geocodeAsync(label);
  if (results.length === 0) return null;

  const resolved = toResolvedCoordinates(results[0].latitude, results[0].longitude);
  if (!resolved) return null;

  return { label, ...resolved };
}
