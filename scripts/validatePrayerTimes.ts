// Regression check for lib/prayer/calculate.ts — not part of the app bundle.
// Run with: npx tsx scripts/validatePrayerTimes.ts
//
// Fixture expected values were established as follows:
//  - New York, Mecca, and Karachi were cross-checked live against the
//    independent Aladhan prayer-times API (api.aladhan.com) and matched to
//    within 1 minute on every prayer.
//  - San Jose (see the precaution-buffer section below) was independently
//    confirmed both against Aladhan AND against a real, currently-operating
//    mosque's (MCA Bay Area) published schedule — see precautionDefaults.ts
//    for the full story of that cross-check.
//  - London's Dhuhr/Asr/Maghrib are independently confirmed via Aladhan.
//    Its Fajr/Isha are a deliberate regression lock, NOT a mismatch — see
//    the note on that fixture for the diagnosed high-latitude-rule reason.
//  - Jakarta is a regression lock whose purpose is proving the
//    runtime-timezone fix in calculate.ts is necessary — this sandbox's
//    system time zone is America/Los_Angeles, where the UTC instant used
//    for that fixture falls on July 1 evening, one calendar day off from
//    the correct July 2 in Jakarta.
//
// A future change to lib/prayer/calculate.ts that shifts any of these by
// more than the tolerance will fail this script — that's the point.

import { DateTime } from 'luxon';
import { calculatePrayerTimes, CalculationMethodKey, MadhabKey, PrayerName } from '../lib/prayer/calculate';
import { DEFAULT_PRECAUTION_BUFFER_MINUTES } from '../lib/prayer/precautionDefaults';

interface Fixture {
  label: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  method: CalculationMethodKey;
  madhab: MadhabKey;
  date: Date;
  /** Expected local time "HH:mm" (24h) in `timeZone`. */
  expected: Record<PrayerName, string>;
  toleranceMinutes: number;
  verifiedAgainst: string;
}

const fixtures: Fixture[] = [
  {
    label: 'New York, NY — ISNA, Shafi — 2026-07-02',
    latitude: 40.7128,
    longitude: -74.006,
    timeZone: 'America/New_York',
    method: 'NorthAmerica',
    madhab: 'shafi',
    date: new Date(Date.UTC(2026, 6, 2, 12)),
    expected: { fajr: '03:50', sunrise: '05:29', dhuhr: '13:00', asr: '17:00', maghrib: '20:31', isha: '22:09' },
    toleranceMinutes: 1,
    verifiedAgainst: 'api.aladhan.com (live, independent)',
  },
  {
    label: 'New York, NY — ISNA, Hanafi — same day',
    latitude: 40.7128,
    longitude: -74.006,
    timeZone: 'America/New_York',
    method: 'NorthAmerica',
    madhab: 'hanafi',
    date: new Date(Date.UTC(2026, 6, 2, 12)),
    expected: { fajr: '03:50', sunrise: '05:29', dhuhr: '13:01', asr: '18:13', maghrib: '20:31', isha: '22:10' },
    toleranceMinutes: 1,
    verifiedAgainst: 'regression lock (this script)',
  },
  {
    label: 'Mecca — Umm al-Qura, Shafi — 2026-07-02',
    latitude: 21.4225,
    longitude: 39.8262,
    timeZone: 'Asia/Riyadh',
    method: 'UmmAlQura',
    madhab: 'shafi',
    date: new Date(Date.UTC(2026, 6, 2, 12)),
    expected: { fajr: '04:15', sunrise: '05:42', dhuhr: '12:25', asr: '15:44', maghrib: '19:07', isha: '20:37' },
    toleranceMinutes: 1,
    verifiedAgainst: 'api.aladhan.com (live, independent) — matched within 1 min on every prayer',
  },
  {
    label: 'Karachi — Karachi method, Hanafi — 2026-07-02',
    latitude: 24.8607,
    longitude: 67.0011,
    timeZone: 'Asia/Karachi',
    method: 'Karachi',
    madhab: 'hanafi',
    date: new Date(Date.UTC(2026, 6, 2, 12)),
    expected: { fajr: '04:18', sunrise: '05:46', dhuhr: '12:37', asr: '17:19', maghrib: '19:26', isha: '20:54' },
    toleranceMinutes: 1,
    verifiedAgainst: 'api.aladhan.com (live, independent) — matched within 1 min on every prayer',
  },
  {
    // NOTE on Fajr/Isha: this fixture intentionally does NOT match Aladhan's
    // default output for the same coordinates/method. Aladhan applies no
    // high-latitude correction by default and returns the raw twilight-angle
    // result (Fajr 02:34, Isha 23:27 for this date). We apply
    // HighLatitudeRule.recommended() (resolves to SeventhOfTheNight here),
    // producing the more moderate 03:44/22:25 below. Verified this is the
    // correct explanation, not a bug, by forcing HighLatitudeRule.TwilightAngle
    // in isolation and confirming it reproduces Aladhan's number almost
    // exactly — so the underlying astronomical math matches; only the
    // high-latitude convention choice differs, and that's a disclosed,
    // deliberate default (see the "why times differ" design discussion),
    // not something to silently change.
    label: 'London — Muslim World League, Shafi — 2026-07-02',
    latitude: 51.5072,
    longitude: -0.1276,
    timeZone: 'Europe/London',
    method: 'MuslimWorldLeague',
    madhab: 'shafi',
    date: new Date(Date.UTC(2026, 6, 2, 12)),
    expected: { fajr: '03:44', sunrise: '04:48', dhuhr: '13:06', asr: '17:26', maghrib: '21:21', isha: '22:25' },
    toleranceMinutes: 1,
    verifiedAgainst: 'regression lock — see high-latitude-rule note above; Dhuhr/Asr/Maghrib independently confirmed via api.aladhan.com, Fajr/Isha diverge by design (HighLatitudeRule.recommended vs Aladhan default of none)',
  },
  {
    label: 'Jakarta — Singapore method, Shafi — 2026-07-02 (proves the runtime-timezone fix)',
    latitude: -6.2088,
    longitude: 106.8456,
    timeZone: 'Asia/Jakarta',
    method: 'Singapore',
    madhab: 'shafi',
    date: new Date(Date.UTC(2026, 6, 2, 0, 30)), // 00:30 UTC = 07:30 Jakarta, but 17:30 the PREVIOUS
                                                   // day in this sandbox's America/Los_Angeles system
                                                   // zone — a naive implementation would calculate for
                                                   // the wrong calendar day here.
    expected: { fajr: '04:41', sunrise: '06:04', dhuhr: '11:58', asr: '15:19', maghrib: '17:50', isha: '19:05' },
    toleranceMinutes: 1,
    verifiedAgainst: 'regression lock (this script)',
  },
];

let failures = 0;

for (const f of fixtures) {
  const times = calculatePrayerTimes({
    latitude: f.latitude,
    longitude: f.longitude,
    timeZone: f.timeZone,
    date: f.date,
    method: f.method,
    madhab: f.madhab,
  });

  console.log(`\n${f.label}  [${f.verifiedAgainst}]`);

  for (const prayer of Object.keys(f.expected) as PrayerName[]) {
    const actual = DateTime.fromJSDate(times[prayer]).setZone(f.timeZone);
    const actualMinutes = actual.hour * 60 + actual.minute;

    const [eh, em] = f.expected[prayer].split(':').map(Number);
    const expectedMinutes = eh * 60 + em;

    const diff = Math.abs(actualMinutes - expectedMinutes);
    const pass = diff <= f.toleranceMinutes;
    if (!pass) failures++;

    console.log(
      `  ${pass ? 'PASS' : 'FAIL'}  ${prayer.padEnd(8)} actual=${actual.toFormat('HH:mm')}  expected=${f.expected[prayer]}  diff=${diff}min`,
    );
  }
}

// ─── Precaution buffer: prove it composes correctly and touches only Maghrib ──
//
// San Jose / MCA coordinates from the real-world cross-check earlier — with
// no buffer, this should reproduce the exact unbuffered calculation (8:32 PM
// Maghrib) we already confirmed against MCA's published schedule.

const sanJose = { latitude: 37.37707183790829, longitude: -121.95905954658049, timeZone: 'America/Los_Angeles' };
const sanJoseDate = new Date(Date.UTC(2026, 6, 2, 12));

const unbuffered = calculatePrayerTimes({ ...sanJose, date: sanJoseDate, method: 'NorthAmerica', madhab: 'hanafi' });
const buffered = calculatePrayerTimes({
  ...sanJose, date: sanJoseDate, method: 'NorthAmerica', madhab: 'hanafi',
  manualAdjustmentsMinutes: DEFAULT_PRECAUTION_BUFFER_MINUTES,
});

console.log('\nPrecaution buffer — San Jose, ISNA, Hanafi, 2026-07-02');

for (const prayer of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as PrayerName[]) {
  const before = DateTime.fromJSDate(unbuffered[prayer]).setZone(sanJose.timeZone);
  const after = DateTime.fromJSDate(buffered[prayer]).setZone(sanJose.timeZone);
  const diffMinutes = after.diff(before, 'minutes').minutes;
  const expectedDiff = DEFAULT_PRECAUTION_BUFFER_MINUTES[prayer] ?? 0;
  const pass = diffMinutes === expectedDiff;
  if (!pass) failures++;

  console.log(
    `  ${pass ? 'PASS' : 'FAIL'}  ${prayer.padEnd(8)} unbuffered=${before.toFormat('HH:mm')}  buffered=${after.toFormat('HH:mm')}  shift=${diffMinutes}min  expectedShift=${expectedDiff}min`,
  );
}

// Composition check: a method that already carries its own Maghrib
// adjustment (Dubai: +3 min built in) should end up with OUR +2 min added
// on top, not overwritten — proves no double-counting or silent override
// of the method's own published margin.

const dubaiUnbuffered = calculatePrayerTimes({ ...sanJose, date: sanJoseDate, method: 'Dubai', madhab: 'hanafi' });
const dubaiBuffered = calculatePrayerTimes({
  ...sanJose, date: sanJoseDate, method: 'Dubai', madhab: 'hanafi',
  manualAdjustmentsMinutes: DEFAULT_PRECAUTION_BUFFER_MINUTES,
});
const dubaiShift = DateTime.fromJSDate(dubaiBuffered.maghrib)
  .diff(DateTime.fromJSDate(dubaiUnbuffered.maghrib), 'minutes').minutes;
const dubaiPass = dubaiShift === 2;
if (!dubaiPass) failures++;
console.log(
  `  ${dubaiPass ? 'PASS' : 'FAIL'}  Dubai method (own +3min built in) + our +2min buffer composes additively: shift=${dubaiShift}min`,
);

console.log(failures === 0 ? '\nAll fixtures passed.' : `\n${failures} fixture(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
