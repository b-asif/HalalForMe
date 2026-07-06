// Pure logic only — deliberately no expo-location import here (see
// notificationPlan.ts for why that split matters: expo-location has side
// effects that throw under plain Node). Live compass heading lives in
// compass.ts instead.

import { Coordinates, Qibla } from 'adhan';

/**
 * True-north bearing (0-360°, clockwise) from the given coordinates to the
 * Kaaba. Reuses adhan's own Qibla calculation rather than a hand-rolled
 * great-circle formula — it's part of the same library whose prayer-time
 * math we've already extensively verified, and its bearings for known
 * locations (~58° for New York, ~119° for London) match commonly-cited
 * real-world values.
 */
export function qiblaBearing(latitude: number, longitude: number): number {
  return Qibla(new Coordinates(latitude, longitude));
}

/**
 * Signed angle to rotate from the current heading to face the Qibla, in the
 * range (-180, 180]. Positive = rotate clockwise (right), negative =
 * rotate counterclockwise (left) — the value a compass UI needs to decide
 * which way to turn, not just how far off you are.
 */
export function relativeQiblaAngle(currentHeadingDegrees: number, qiblaBearingDegrees: number): number {
  const diff = (qiblaBearingDegrees - currentHeadingDegrees) % 360;
  return diff > 180 ? diff - 360 : diff <= -180 ? diff + 360 : diff;
}
