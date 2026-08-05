export interface HijriDate {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

export const HIJRI_MONTH_NAMES = [
  'Muharram', 'Safar', "Rabi' al-awwal", "Rabi' al-thani",
  'Jumada al-awwal', 'Jumada al-thani', 'Rajab', "Sha'ban",
  'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
];

function gregorianToJulianDay(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4)
    - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

/**
 * Converts a Julian Day Number to the tabular Islamic calendar (civil/Kuwaiti
 * algorithm — a fixed 30-year leap-year cycle, not actual moon sighting).
 * This is the same algorithmic approach used by most software Hijri
 * converters and matches the widely-published Islamic New Year dates (e.g.
 * 1 Muharram 1447 = June 26, 2025), but a given local mosque's announced
 * date can differ by a day depending on regional moon-sighting practice.
 */
function julianDayToHijri(jd: number): HijriDate {
  let jjd = jd - 1948439 + 10632;
  const n = Math.floor((jjd - 1) / 10631);
  jjd = jjd - 10631 * n + 354;
  const j = Math.floor((10985 - jjd) / 5316) * Math.floor((50 * jjd) / 17719)
    + Math.floor(jjd / 5670) * Math.floor((43 * jjd) / 15238);
  jjd = jjd - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * jjd) / 709);
  const day = jjd - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

/** Pure, on-device Gregorian → Hijri conversion — no network call, no ICU/Intl
 *  dependency (which varies across JS engines/RN's Hermes), so behavior is
 *  identical on every platform and testable under plain Node via tsx. */
export function toHijriDate(date: Date): HijriDate {
  const jd = gregorianToJulianDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return julianDayToHijri(jd);
}

export function formatHijriDate(date: Date): string {
  const { year, month, day } = toHijriDate(date);
  return `${day} ${HIJRI_MONTH_NAMES[month - 1]} ${year} AH`;
}
