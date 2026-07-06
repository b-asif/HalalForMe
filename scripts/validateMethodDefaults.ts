// Regression check for lib/prayer/methodDefaults.ts — not part of the app bundle.
// Run with: npm run validate:methodDefaults
//
// This only checks that lookups resolve to what we intended and that the
// fallback behaves correctly — it can't validate that any of these are the
// "right" recommendation, since there isn't one. Every value here is a
// suggestion, not a claim of correctness.

import { recommendedMethodFor } from '../lib/prayer/methodDefaults';

const cases: { country: string | null | undefined; expectedMethod: string; expectedMadhab: string; note: string }[] = [
  { country: 'US', expectedMethod: 'NorthAmerica', expectedMadhab: 'shafi', note: 'North America default' },
  { country: 'us', expectedMethod: 'NorthAmerica', expectedMadhab: 'shafi', note: 'lowercase input normalizes' },
  { country: 'SA', expectedMethod: 'UmmAlQura', expectedMadhab: 'shafi', note: 'Saudi Arabia' },
  { country: 'PK', expectedMethod: 'Karachi', expectedMadhab: 'hanafi', note: 'Pakistan — Hanafi-majority' },
  { country: 'IR', expectedMethod: 'Tehran', expectedMadhab: 'shafi', note: 'Iran — distinct method' },
  { country: 'TR', expectedMethod: 'Turkey', expectedMadhab: 'hanafi', note: 'Turkey — Hanafi-majority' },
  { country: 'ZZ', expectedMethod: 'MuslimWorldLeague', expectedMadhab: 'shafi', note: 'unknown code falls back to global default' },
  { country: null, expectedMethod: 'MuslimWorldLeague', expectedMadhab: 'shafi', note: 'null falls back to global default' },
  { country: undefined, expectedMethod: 'MuslimWorldLeague', expectedMadhab: 'shafi', note: 'undefined falls back to global default' },
];

let failures = 0;

for (const c of cases) {
  const result = recommendedMethodFor(c.country);
  const pass = result.method === c.expectedMethod && result.madhab === c.expectedMadhab;
  if (!pass) failures++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${String(c.country).padEnd(10)} -> method=${result.method}, madhab=${result.madhab}  (${c.note})`,
  );
}

console.log(failures === 0 ? '\nAll cases passed.' : `\n${failures} case(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
