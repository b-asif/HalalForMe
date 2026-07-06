// Pure logic only — deliberately no `expo-notifications` import here.
// Importing that module (even indirectly, via a non-type import of
// notifications.ts) pulls in native/RN-only side effects that throw under
// plain Node, which would make this unable to run in scripts/tests. Anything
// that needs to run under Node (regression scripts, future unit tests)
// should depend on THIS file, not notifications.ts.
//
// Cross-module references use `import type` on purpose — TypeScript erases
// these at compile time, so referencing types from coordinates.ts or
// settingsStore.ts here can never pull in expo-location's or
// AsyncStorage's runtime code, even if those modules later add something
// else that isn't Node-safe.

import { DateTime } from 'luxon';
import { calculatePrayerTimes, PrayerName } from './calculate';
import type { PrayerSettings } from './settingsStore';
import type { ResolvedCoordinates } from './coordinates';

/** Sunrise isn't a prayer — never schedule a notification for it. */
export const NOTIFIABLE_PRAYERS: Exclude<PrayerName, 'sunrise'>[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const PRAYER_TITLES: Record<(typeof NOTIFIABLE_PRAYERS)[number], string> = {
  fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};

export const SCHEDULE_DAYS_AHEAD = 7;

export interface PlannedNotification {
  identifier: string;
  prayer: (typeof NOTIFIABLE_PRAYERS)[number];
  fireDate: Date;
  title: string;
  body: string;
}

/**
 * Pure computation of what should be scheduled — no native calls. Given
 * coordinates/settings/now, returns the plan for the next `daysAhead` days,
 * skipping any prayer whose time has already passed (relevant for "today"
 * only) so nothing fires immediately or in the past.
 */
export function computeNotificationPlan(
  coords: ResolvedCoordinates,
  settings: PrayerSettings,
  now: Date,
  daysAhead: number = SCHEDULE_DAYS_AHEAD,
): PlannedNotification[] {
  const plan: PlannedNotification[] = [];
  const startOfToday = DateTime.fromJSDate(now).setZone(coords.timeZone).startOf('day');

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const targetDate = startOfToday.plus({ days: dayOffset }).toJSDate();
    const times = calculatePrayerTimes({
      latitude: coords.latitude,
      longitude: coords.longitude,
      timeZone: coords.timeZone,
      date: targetDate,
      method: settings.method,
      madhab: settings.madhab,
      manualAdjustmentsMinutes: settings.manualAdjustmentsMinutes,
    });

    const dateKey = DateTime.fromJSDate(targetDate).setZone(coords.timeZone).toFormat('yyyy-LL-dd');

    for (const prayer of NOTIFIABLE_PRAYERS) {
      const fireDate = times[prayer];
      if (fireDate <= now) continue; // never schedule for a time already past

      plan.push({
        identifier: `prayer:${prayer}:${dateKey}`,
        prayer,
        fireDate,
        title: PRAYER_TITLES[prayer],
        body: `It's time for ${PRAYER_TITLES[prayer]}.`,
      });
    }
  }

  return plan;
}
