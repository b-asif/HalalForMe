// Regression check for lib/prayer/hijri.ts — not part of the app bundle.
// Run with: npm run validate:hijri
//
// The tabular (civil/Kuwaiti-algorithm) Islamic calendar is a fixed 30-year
// leap-year cycle, not actual moon sighting, so these reference points are
// cross-checked against widely-published Islamic New Year dates rather than
// derived from the code itself — a real local mosque's announced date can
// still differ by a day depending on regional moon-sighting practice.

import { formatHijriDate, toHijriDate } from '../lib/prayer/hijri';

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

const cases: { label: string; date: Date; expectedYear: number; expectedMonth: number; expectedDay: number }[] = [
  // 1 Muharram 1447 = June 26, 2025 — widely published Islamic New Year date.
  { label: '1 Muharram 1447 <- 2025-06-26', date: new Date(2025, 5, 26), expectedYear: 1447, expectedMonth: 1, expectedDay: 1 },
  // 1 Muharram 1448 = June 16, 2026 — independently published Islamic New Year date.
  { label: '1 Muharram 1448 <- 2026-06-16', date: new Date(2026, 5, 16), expectedYear: 1448, expectedMonth: 1, expectedDay: 1 },
];

for (const c of cases) {
  const result = toHijriDate(c.date);
  const pass = result.year === c.expectedYear && result.month === c.expectedMonth && result.day === c.expectedDay;
  check(c.label, pass, `got ${formatHijriDate(c.date)}`);
}

check(
  'day-to-day roll-forward stays monotonic (no skipped/repeated days across a month boundary)',
  (() => {
    let prev = toHijriDate(new Date(2025, 5, 20));
    for (let i = 21; i <= 30; i++) {
      const cur = toHijriDate(new Date(2025, 5, i));
      const advanced =
        (cur.year === prev.year && cur.month === prev.month && cur.day === prev.day + 1) ||
        (cur.month === prev.month + 1 && cur.day === 1) ||
        (cur.year === prev.year + 1 && cur.month === 1 && cur.day === 1);
      if (!advanced) return false;
      prev = cur;
    }
    return true;
  })(),
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
