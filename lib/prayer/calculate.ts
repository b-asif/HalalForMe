import {
  CalculationMethod,
  CalculationParameters,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PrayerTimes,
} from 'adhan';
import { DateTime } from 'luxon';

export type CalculationMethodKey =
  | 'MuslimWorldLeague'
  | 'Egyptian'
  | 'Karachi'
  | 'UmmAlQura'
  | 'Dubai'
  | 'MoonsightingCommittee'
  | 'NorthAmerica' // ISNA
  | 'Kuwait'
  | 'Qatar'
  | 'Singapore'
  | 'Tehran'
  | 'Turkey'
  | 'Other';

export type MadhabKey = 'shafi' | 'hanafi';

export type PrayerName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export type PrayerTimesResult = Record<PrayerName, Date>;

export interface CalculatePrayerTimesParams {
  latitude: number;
  longitude: number;
  /** IANA time zone of the location being calculated for, e.g. "America/New_York". */
  timeZone: string;
  /** Calendar date to calculate for, interpreted in `timeZone`. Defaults to "now" in that zone. */
  date?: Date;
  method: CalculationMethodKey;
  madhab: MadhabKey;
  /** Manual per-prayer offsets in minutes, e.g. { fajr: 2 } to match a local mosque's cautious adjustment. */
  manualAdjustmentsMinutes?: Partial<Record<PrayerName, number>>;
}

/**
 * adhan-js reads the calendar day off the Date object using LOCAL getters
 * (getFullYear/getMonth/getDate), which resolve against the JS runtime's
 * system time zone — not necessarily `timeZone`. Passing a naive `Date`
 * straight through can silently calculate for the wrong calendar day near
 * midnight when the device's system zone differs from the location being
 * calculated for (e.g. checking prayer times for a trip, or a device with
 * manual/incorrect system time zone). We work around this by resolving the
 * target Y/M/D in `timeZone` via Luxon, then constructing a Date at local
 * noon from those components — noon avoids any DST-boundary ambiguity, and
 * because the same runtime that builds the Date is the one adhan-js reads
 * it back with, the round-trip correctly reproduces the target calendar day
 * regardless of the device's actual system time zone.
 */
function calendarDateForRuntime(date: Date | undefined, timeZone: string): Date {
  const base = date ? DateTime.fromJSDate(date) : DateTime.now();
  const target = base.setZone(timeZone);
  return new Date(target.year, target.month - 1, target.day, 12, 0, 0);
}

export function calculatePrayerTimes(params: CalculatePrayerTimesParams): PrayerTimesResult {
  const { latitude, longitude, timeZone, date, method, madhab, manualAdjustmentsMinutes } = params;

  const coordinates = new Coordinates(latitude, longitude);
  const calcParams: CalculationParameters = CalculationMethod[method]();

  calcParams.madhab = madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  calcParams.highLatitudeRule = HighLatitudeRule.recommended(coordinates);

  if (manualAdjustmentsMinutes) {
    for (const [prayer, minutes] of Object.entries(manualAdjustmentsMinutes)) {
      if (typeof minutes === 'number') {
        calcParams.adjustments[prayer as PrayerName] = minutes;
      }
    }
  }

  const dateForAdhan = calendarDateForRuntime(date, timeZone);
  const times = new PrayerTimes(coordinates, dateForAdhan, calcParams);

  return {
    fajr: times.fajr,
    sunrise: times.sunrise,
    dhuhr: times.dhuhr,
    asr: times.asr,
    maghrib: times.maghrib,
    isha: times.isha,
  };
}

/** Formats a prayer time as a local clock string in the given time zone, e.g. "5:42 AM". */
export function formatPrayerTime(time: Date, timeZone: string): string {
  return DateTime.fromJSDate(time).setZone(timeZone).toFormat('h:mm a');
}
