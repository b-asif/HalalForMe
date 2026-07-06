import { PrayerName } from './calculate';

/**
 * Default precaution margin applied to Maghrib only, on top of the raw
 * calculated time. This is not a scholarly method choice — most calculation
 * methods (10 of the 12 in `adhan`) build in no Maghrib margin at all, unlike
 * Dhuhr, where several methods already publish their own small adjustment to
 * avoid the exact instant of solar transit. We deliberately don't add our own
 * layer on top of a method's Dhuhr adjustment — that's the method's own
 * published decision, not a gap for us to fill.
 *
 * Maghrib is different: the gap is observational/atmospheric uncertainty in
 * exactly when the sun is fully below the horizon, not a scholarly angle
 * dispute, which is why real mosques commonly pad it a couple of minutes
 * even when using a method that doesn't. This value is a modest starting
 * point in that range, not a claim that it is the "correct" margin.
 *
 * This is only ever a *default* fed into the same manual adjustment
 * mechanism every user can already edit — never applied silently. Settings
 * should initialize a new user's Maghrib adjustment from this constant, and
 * let them change it to anything, including 0, at any time.
 */
export const DEFAULT_PRECAUTION_BUFFER_MINUTES: Partial<Record<PrayerName, number>> = {
  maghrib: 2,
};
