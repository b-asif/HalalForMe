import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalculationMethodKey, MadhabKey, PrayerName } from './calculate';
import { DEFAULT_PRECAUTION_BUFFER_MINUTES } from './precautionDefaults';
import { recommendedMethodFor } from './methodDefaults';
import { ManualCity } from './coordinates';

const STORAGE_KEY = 'prayer_settings_v1';

export type LocationMode = 'gps' | 'manual';

export interface PrayerSettings {
  locationMode: LocationMode;
  /** Set when locationMode is 'manual'; ignored (but not cleared) otherwise,
   *  so switching back to manual later doesn't lose the last-picked city. */
  manualCity: ManualCity | null;
  method: CalculationMethodKey;
  madhab: MadhabKey;
  /** Per-prayer minute offsets, editable by the user. Initialized from
   *  DEFAULT_PRECAUTION_BUFFER_MINUTES for a new install — never re-applied
   *  after that, so a user who sets it to 0 stays at 0. */
  manualAdjustmentsMinutes: Partial<Record<PrayerName, number>>;
  /** ISO 3166-1 alpha-2 country code the method/madhab were last aligned to.
   *  Lets callers detect when the resolved location has moved to a new
   *  country (see resolveCountryCode in coordinates.ts) so the method default
   *  can be re-suggested — without ever touching a method the user picked
   *  manually while staying in the same country. */
  lastCountryCode: string | null;
  /** mosques.id (UUID) of the mosque a user follows for Iqama times, shown
   *  supplementary to (never instead of) the computed Adhan countdown/
   *  notifications above — a mosque's posted times can go stale in a way
   *  the astronomical calculation never can, so this only ever annotates,
   *  never replaces. Null when not following any mosque. */
  followedMosqueId: string | null;
}

function defaultSettings(isoCountryCode?: string | null): PrayerSettings {
  const { method, madhab } = recommendedMethodFor(isoCountryCode);
  return {
    locationMode: 'gps',
    manualCity: null,
    method,
    madhab,
    manualAdjustmentsMinutes: { ...DEFAULT_PRECAUTION_BUFFER_MINUTES },
    lastCountryCode: isoCountryCode ?? null,
    followedMosqueId: null,
  };
}

/**
 * Loads persisted prayer settings, or builds sensible defaults for a new
 * install. `isoCountryCodeForDefaults` should be provided on first run
 * (e.g. from a reverse-geocode of the initial GPS fix, or the device
 * locale's region as a fallback) — it's ignored once real settings exist.
 */
export async function loadPrayerSettings(isoCountryCodeForDefaults?: string | null): Promise<PrayerSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings(isoCountryCodeForDefaults);

    const parsed = JSON.parse(raw);
    // Merge over defaults, not just `parsed` directly, so a future field
    // added to PrayerSettings doesn't come back `undefined` for existing
    // users who saved settings before that field existed.
    return { ...defaultSettings(isoCountryCodeForDefaults), ...parsed };
  } catch {
    return defaultSettings(isoCountryCodeForDefaults);
  }
}

export async function savePrayerSettings(settings: PrayerSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
}

/** Loads current settings, applies a partial update, persists, and returns the result. */
export async function updatePrayerSettings(
  patch: Partial<PrayerSettings>,
  isoCountryCodeForDefaults?: string | null,
): Promise<PrayerSettings> {
  const current = await loadPrayerSettings(isoCountryCodeForDefaults);
  const next = { ...current, ...patch };
  await savePrayerSettings(next);
  return next;
}
