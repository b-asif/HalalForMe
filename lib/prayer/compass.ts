// Native-calling module — imports expo-location, so this cannot run under
// plain Node (same reason as coordinates.ts). Needs on-device verification.

import * as Location from 'expo-location';

export interface HeadingReading {
  /** Declination-corrected true-north heading, 0-360°. Provided by the OS
   *  (iOS/Android geomagnetic model), not computed by us — no manual
   *  magnetic-declination correction needed. */
  trueHeading: number;
  /** 0 = no calibration, 1-3 = low/medium/high accuracy. On iOS: 3 means
   *  under ~20° uncertainty, 0 means over ~50° — worth surfacing a
   *  "calibrate your compass" prompt below a threshold like 2. */
  accuracy: number;
}

/**
 * Compass heading needs live location permission regardless of how the
 * prayer-time location was resolved — a user in "manual city" mode for
 * prayer times may never have granted GPS/location permission at all, since
 * geocoding a typed city name doesn't require it. This is a distinct
 * concern (which way is the phone facing right now) from where prayer
 * times are calculated for, and needs its own explicit permission request.
 */
export async function ensureLocationPermissionForHeading(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export type HeadingResult =
  | { status: 'success'; reading: HeadingReading }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string };

/** One-shot heading read. Distinguishes permission-denied from an actual
 *  thrown error — deliberately not collapsed into a single null/failure
 *  case, so a real bug doesn't get silently misreported as "check your
 *  permissions" the way an earlier version of this function did. */
export async function getCurrentHeading(): Promise<HeadingResult> {
  const granted = await ensureLocationPermissionForHeading();
  if (!granted) return { status: 'permission-denied' };

  try {
    const heading = await Location.getHeadingAsync();
    if (heading.trueHeading < 0) return { status: 'permission-denied' };
    return { status: 'success', reading: { trueHeading: heading.trueHeading, accuracy: heading.accuracy } };
  } catch (err: any) {
    console.error('[compass] getHeadingAsync threw:', err);
    return { status: 'error', message: err?.message ?? String(err) };
  }
}

/** Live-updating heading subscription for a compass UI. Returns a
 *  subscription object with .remove() to unsubscribe — always clean this up
 *  on unmount, the OS keeps sampling the compass sensor until you do. */
export async function watchHeading(
  onUpdate: (heading: HeadingReading) => void,
): Promise<{ remove: () => void }> {
  return Location.watchHeadingAsync(heading => {
    if (heading.trueHeading < 0) return; // invalid reading, skip rather than report garbage
    onUpdate({ trueHeading: heading.trueHeading, accuracy: heading.accuracy });
  });
}
