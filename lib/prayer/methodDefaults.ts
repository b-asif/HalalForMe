import { CalculationMethodKey, MadhabKey } from './calculate';

export interface MethodDefault {
  method: CalculationMethodKey;
  madhab: MadhabKey;
}

/**
 * ISO 3166-1 alpha-2 country code -> recommended starting point.
 *
 * This is a suggestion, never an enforced choice — every value here is
 * changeable in Settings, and nothing in this module implies one convention
 * is more "correct" than another (see the calculation module's own docs).
 *
 * `adhan` does not ship a method for every country's own published
 * convention (there is no JAKIM/MUIS/Kemenag/Diyanet-equivalent for several
 * countries below beyond what's listed). Where that's the case, we pick the
 * closest available built-in method rather than leaving it unset — noted
 * inline. Madhab defaults are a rough regional-majority estimate, most
 * relevant for Asr; they matter far less than getting the method right and
 * are just as easy to change.
 */
const COUNTRY_DEFAULTS: Record<string, MethodDefault> = {
  // North America — ISNA is the long-standing common default; Moonsighting
  // Committee is an increasingly common alternative for the same region and
  // should be offered with equal visibility in the UI, not hidden behind this.
  US: { method: 'NorthAmerica', madhab: 'shafi' },
  CA: { method: 'NorthAmerica', madhab: 'shafi' },

  // UK / Western Europe
  GB: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  IE: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  FR: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  DE: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  NL: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  BE: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  ES: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  IT: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  SE: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  NO: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  DK: { method: 'MuslimWorldLeague', madhab: 'shafi' },

  // Gulf
  SA: { method: 'UmmAlQura', madhab: 'shafi' },
  AE: { method: 'Dubai', madhab: 'shafi' },
  QA: { method: 'Qatar', madhab: 'shafi' },
  KW: { method: 'Kuwait', madhab: 'shafi' },
  // No dedicated Bahrain/Oman method — Dubai is the closest regional match.
  BH: { method: 'Dubai', madhab: 'shafi' },
  OM: { method: 'Dubai', madhab: 'shafi' },

  // North Africa / Levant
  EG: { method: 'Egyptian', madhab: 'shafi' },
  // No dedicated method for these — Egyptian is geographically/climatically closest.
  LY: { method: 'Egyptian', madhab: 'shafi' },
  SD: { method: 'Egyptian', madhab: 'shafi' },
  JO: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  LB: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  SY: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  IQ: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  MA: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  DZ: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  TN: { method: 'MuslimWorldLeague', madhab: 'shafi' },

  // South Asia — Hanafi-majority
  PK: { method: 'Karachi', madhab: 'hanafi' },
  IN: { method: 'Karachi', madhab: 'hanafi' },
  BD: { method: 'Karachi', madhab: 'hanafi' },
  AF: { method: 'Karachi', madhab: 'hanafi' },

  // Turkey / Central Asia — Hanafi-majority
  TR: { method: 'Turkey', madhab: 'hanafi' },
  // No dedicated method for these — Turkey's is the closest regional match.
  AZ: { method: 'Turkey', madhab: 'hanafi' },
  KZ: { method: 'Turkey', madhab: 'hanafi' },
  UZ: { method: 'Turkey', madhab: 'hanafi' },

  // Iran — distinct convention (Tehran method)
  IR: { method: 'Tehran', madhab: 'shafi' },

  // Southeast Asia — no JAKIM/MUIS/Kemenag-specific method available;
  // Singapore's method is the closest built-in match for this region.
  MY: { method: 'Singapore', madhab: 'shafi' },
  SG: { method: 'Singapore', madhab: 'shafi' },
  ID: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  BN: { method: 'Singapore', madhab: 'shafi' },

  // Sub-Saharan / East Africa
  NG: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  KE: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  ZA: { method: 'MuslimWorldLeague', madhab: 'shafi' },

  // Oceania
  AU: { method: 'MuslimWorldLeague', madhab: 'shafi' },
  NZ: { method: 'MuslimWorldLeague', madhab: 'shafi' },
};

/** Global default when a country isn't in the table above, or is unknown. */
const GLOBAL_FALLBACK: MethodDefault = { method: 'MuslimWorldLeague', madhab: 'shafi' };

/**
 * Recommends a starting calculation method + madhab for an ISO 3166-1
 * alpha-2 country code. Always a suggestion — the caller should present this
 * as editable, never as the only option.
 */
export function recommendedMethodFor(isoCountryCode: string | null | undefined): MethodDefault {
  if (!isoCountryCode) return GLOBAL_FALLBACK;
  return COUNTRY_DEFAULTS[isoCountryCode.toUpperCase()] ?? GLOBAL_FALLBACK;
}
