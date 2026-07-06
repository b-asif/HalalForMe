// Regression check for the pure logic in lib/prayer/notificationPlan.ts and
// lib/prayer/notificationScheduleState.ts — not part of the app bundle.
// Run with: npm run validate:notificationPlan
//
// Deliberately imports from notificationPlan.ts, NOT notifications.ts —
// the latter imports expo-notifications, which pulls in native/RN-only
// side effects that throw under plain Node. This script (and the
// import-type usage below) is exactly what keeps that boundary honest.
//
// This only covers computeNotificationPlan() and needsReschedule(). The
// actual scheduling calls (rescheduleAllPrayerNotifications, permission
// requests, Android channel setup) call real expo-notifications native
// APIs and cannot run under Node — those need on-device verification,
// same as coordinates.ts and settingsStore.ts did in Phase 1/2.

import { computeNotificationPlan, NOTIFIABLE_PRAYERS } from '../lib/prayer/notificationPlan';
import { needsReschedule } from '../lib/prayer/notificationScheduleState';
import type { PrayerSettings } from '../lib/prayer/settingsStore';
import type { ResolvedCoordinates } from '../lib/prayer/coordinates';

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

// San Jose / MCA settings, reused from Phase 0's real-world-verified fixture.
const coords: ResolvedCoordinates = {
  latitude: 37.37707183790829, longitude: -121.95905954658049, timeZone: 'America/Los_Angeles',
};
const settings: PrayerSettings = {
  locationMode: 'gps', manualCity: null,
  method: 'NorthAmerica', madhab: 'hanafi',
  manualAdjustmentsMinutes: { maghrib: 2 },
  lastCountryCode: 'US',
};

// ── computeNotificationPlan ─────────────────────────────────────────────────

// Case 1: "now" well before Fajr on day 0 — expect all 5 prayers x 7 days = 35 entries.
{
  const now = new Date(Date.UTC(2026, 6, 2, 7)); // 07:00 UTC = 00:00 PDT, before every prayer that day
  const plan = computeNotificationPlan(coords, settings, now, 7);
  check('full 7-day window when starting before Fajr', plan.length === 35, `got ${plan.length}`);
  check('every notifiable prayer type appears exactly 7 times', NOTIFIABLE_PRAYERS.every(
    p => plan.filter(item => item.prayer === p).length === 7,
  ));
  check('plan is sorted by fire date', plan.every((item, i) => i === 0 || item.fireDate >= plan[i - 1].fireDate));
  check('identifiers are unique', new Set(plan.map(p => p.identifier)).size === plan.length);
}

// Case 2: "now" is mid-afternoon on day 0 — Fajr/sunrise/Dhuhr for today should
// already be in the past and excluded; today should only contribute Asr/Maghrib/Isha.
{
  const now = new Date(Date.UTC(2026, 6, 2, 22)); // 22:00 UTC = 15:00 PDT — after Dhuhr, before Asr
  const plan = computeNotificationPlan(coords, settings, now, 7);
  const todayKey = '2026-07-02';
  const todaysEntries = plan.filter(item => item.identifier.endsWith(todayKey));
  check(
    'past prayers today are excluded, future ones kept',
    todaysEntries.length === 3 && todaysEntries.every(e => ['asr', 'maghrib', 'isha'].includes(e.prayer)),
    `today's entries: ${todaysEntries.map(e => e.prayer).join(', ')}`,
  );
  check('total is 35 - 2 (excluded fajr+dhuhr today)', plan.length === 33, `got ${plan.length}`);
}

// Case 3: sunrise never appears, even though calculatePrayerTimes computes it.
{
  const now = new Date(Date.UTC(2026, 6, 2, 7));
  const plan = computeNotificationPlan(coords, settings, now, 1);
  check('sunrise is never scheduled', plan.every(item => (item.prayer as string) !== 'sunrise'));
}

// ── needsReschedule ──────────────────────────────────────────────────────────

check('no prior state -> needs reschedule', needsReschedule(null, coords.timeZone, new Date()));

{
  const now = new Date();
  const recent = { lastScheduledAtIso: now.toISOString(), lastScheduledOffsetMinutes: -420 }; // PDT = UTC-7 = -420min
  check('recent schedule, same offset -> no reschedule needed', !needsReschedule(recent, coords.timeZone, now));
}

{
  const now = new Date();
  const wrongOffset = { lastScheduledAtIso: now.toISOString(), lastScheduledOffsetMinutes: -480 }; // PST = UTC-8, simulates a DST flip
  check('offset changed since last schedule -> reschedule needed (DST/travel)', needsReschedule(wrongOffset, coords.timeZone, now));
}

{
  const oldNow = new Date();
  const old = { lastScheduledAtIso: new Date(oldNow.getTime() - 25 * 60 * 60 * 1000).toISOString(), lastScheduledOffsetMinutes: -420 };
  check('25 hours since last schedule -> routine refresh needed', needsReschedule(old, coords.timeZone, oldNow));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
