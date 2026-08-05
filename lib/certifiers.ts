// Single source of truth for halal certifier constants.
// Import from here rather than defining locally in each screen.

export const CERTIFIERS = [
  'ISNA', 'IFANCA', 'HMA', 'HFA', 'HFSAA', 'HMS', 'MUI',
  'self_certified', 'uncertified', 'unknown',
] as const;

export type Certifier = typeof CERTIFIERS[number];

export const THIRD_PARTY_CERTS: readonly string[] = [
  'ISNA', 'IFANCA', 'HMA', 'HFA', 'HFSAA', 'HMS', 'MUI',
];

/**
 * Returns true if the restaurant holds HFSAA certification, which inherently
 * means all meat is hand-slaughtered (zabihah). Checks both primary_certifier
 * and the full certifiers array.
 */
export function isHFSAACertified(
  primaryCertifier: string,
  certifiers?: string | string[] | null,
): boolean {
  if (primaryCertifier === 'HFSAA') return true;
  if (!certifiers) return false;
  const arr = Array.isArray(certifiers) ? certifiers : [certifiers];
  return arr.includes('HFSAA');
}
