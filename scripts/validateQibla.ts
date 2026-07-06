// Regression check for lib/prayer/qibla.ts — not part of the app bundle.
// Run with: npm run validate:qibla
//
// qiblaBearing() reuses adhan's own Qibla() calculation directly, so this
// isn't re-verifying the astronomy — it's locking in known-good bearings
// (cross-checked against commonly-cited real-world values for these exact
// cities) as a regression guard, and separately verifying the
// rotate-clockwise-or-counterclockwise sign convention in
// relativeQiblaAngle(), which is logic we actually wrote ourselves.

import { qiblaBearing, relativeQiblaAngle } from '../lib/prayer/qibla';

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

// ── qiblaBearing: regression-lock against commonly-cited real-world values ──

const bearingCases: { label: string; lat: number; lng: number; expectedDeg: number; toleranceDeg: number }[] = [
  { label: 'New York (commonly cited ~58°)', lat: 40.7128, lng: -74.006, expectedDeg: 58.5, toleranceDeg: 1 },
  { label: 'London (commonly cited ~119°)', lat: 51.5072, lng: -0.1276, expectedDeg: 119, toleranceDeg: 1 },
  { label: 'San Jose (great-circle-over-the-pole route, ~19°)', lat: 37.37707183790829, lng: -121.95905954658049, expectedDeg: 19.4, toleranceDeg: 1 },
];

for (const c of bearingCases) {
  const bearing = qiblaBearing(c.lat, c.lng);
  const diff = Math.abs(bearing - c.expectedDeg);
  check(c.label, diff <= c.toleranceDeg, `got ${bearing.toFixed(2)}°, expected ~${c.expectedDeg}°`);
}

check('bearing is always in [0, 360)', bearingCases.every(c => {
  const b = qiblaBearing(c.lat, c.lng);
  return b >= 0 && b < 360;
}));

// ── relativeQiblaAngle: sign convention (+ = clockwise/right, - = counterclockwise/left) ──

check('heading 350, qibla 10 -> +20 (short way is clockwise)', relativeQiblaAngle(350, 10) === 20);
check('heading 10, qibla 350 -> -20 (short way is counterclockwise)', relativeQiblaAngle(10, 350) === -20);
check('heading 0, qibla 90 -> +90 (turn right)', relativeQiblaAngle(0, 90) === 90);
check('heading 90, qibla 0 -> -90 (turn left)', relativeQiblaAngle(90, 0) === -90);
check('heading equals qibla -> 0', relativeQiblaAngle(45, 45) === 0);
check('exactly opposite (180° either way) -> 180', Math.abs(relativeQiblaAngle(0, 180)) === 180);
check('result is always within (-180, 180]', [
  [0, 359], [359, 0], [180, 179], [270, 90], [10, 200],
].every(([h, q]) => {
  const r = relativeQiblaAngle(h, q);
  return r > -180 && r <= 180;
}));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
