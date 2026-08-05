// ─── HalalForMe Design Tokens ────────────────────────────────────────────────
// Single source of truth for colors, spacing, typography, shadows, and radii.
// Import from here rather than defining constants locally in each screen.

// ── Colors ────────────────────────────────────────────────────────────────────

export const Colors = {
  green:   '#245737',  // primary brand / halal
  red:     '#e53e3e',  // haram / danger
  amber:   '#d97706',  // unclear / warning
  redDark: '#c0392b',  // error text / banners

  // Neutrals
  text:        '#111',   // primary text
  textSub:     '#555',   // secondary text
  textMuted:   '#888',   // muted / descriptions
  textFaint:   '#aaa',   // faint / subtitles
  textGhost:   '#ccc',   // placeholders / dividers
  border:      '#ebebeb',// standard border
  borderFaint: '#f0f0f0',// dividers
  bg:          '#f5f5f5',// screen background
  bgAlt:       '#f7f7f7',// alternate background
  bgInput:     '#fafafa',// input background
  white:       '#fff',

  // Semantic tints
  greenTint: '#e6f9f2',
  greenBg:   '#f0faf6',
  redTint:   '#fff5f5',
  amberTint: '#fffbeb',
};

// ── Typography ────────────────────────────────────────────────────────────────

export const Type = {
  screenTitle:  { fontSize: 22, fontWeight: '800' as const },
  sheetTitle:   { fontSize: 20, fontWeight: '800' as const },
  cardTitle:    { fontSize: 16, fontWeight: '700' as const },
  sectionLabel: { fontSize: 13, fontWeight: '700' as const, letterSpacing: 0.4 },
  label:        { fontSize: 13, fontWeight: '600' as const },
  body:         { fontSize: 15 },
  bodySmall:    { fontSize: 14 },
  caption:      { fontSize: 12 },
  tiny:         { fontSize: 11 },
};

// ── Spacing ───────────────────────────────────────────────────────────────────

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// ── Border Radii ──────────────────────────────────────────────────────────────

export const Radius = {
  input:  14,  // text inputs, primary buttons
  card:   16,  // cards, list items
  chip:   20,  // filter chips, badges
  sheet:  28,  // bottom sheet top corners
  circle: 999, // fully round
};

// ── Cuisine visual themes ─────────────────────────────────────────────────────
// Returns an emoji and a rich background color for a given cuisine string.
// Used to build visually distinct placeholders when no photo is available.

export function getCuisineTheme(cuisine: string | null | undefined): {
  emoji: string;
  color: string; // rich, saturated background
} {
  const c = (cuisine ?? '').toLowerCase();
  if (c.includes('pakistan') || c.includes('indian') || c.includes('bengal') || c.includes('banglades') || c.includes('desi'))
    return { emoji: '🍛', color: '#c2410c' };
  if (c.includes('middle east') || c.includes('turkish') || c.includes('lebanes') || c.includes('arab') || c.includes('shawarma') || c.includes('kebab') || c.includes('falafel'))
    return { emoji: '🥙', color: '#0369a1' };
  if (c.includes('italian') || c.includes('pizza') || c.includes('pasta'))
    return { emoji: '🍕', color: '#dc2626' };
  if (c.includes('american') || c.includes('burger') || c.includes('fast food') || c.includes('fastfood'))
    return { emoji: '🍔', color: '#1d4ed8' };
  if (c.includes('mexican') || c.includes('taco') || c.includes('tex-mex'))
    return { emoji: '🌮', color: '#16a34a' };
  if (c.includes('chinese') || c.includes('cantonese') || c.includes('dim sum'))
    return { emoji: '🥡', color: '#b91c1c' };
  if (c.includes('japanese') || c.includes('sushi') || c.includes('ramen'))
    return { emoji: '🍱', color: '#7c3aed' };
  if (c.includes('thai'))
    return { emoji: '🍜', color: '#0891b2' };
  if (c.includes('mediterranean') || c.includes('greek'))
    return { emoji: '🥗', color: '#0d9488' };
  if (c.includes('somali') || c.includes('ethiopian') || c.includes('nigerian') || c.includes('african'))
    return { emoji: '🍖', color: '#854d0e' };
  if (c.includes('bbq') || c.includes('grill') || c.includes('steakhouse') || c.includes('steak'))
    return { emoji: '🥩', color: '#78350f' };
  if (c.includes('seafood') || c.includes('fish'))
    return { emoji: '🦐', color: '#0369a1' };
  if (c.includes('bakery') || c.includes('cafe') || c.includes('café') || c.includes('dessert') || c.includes('sweet'))
    return { emoji: '☕', color: '#92400e' };
  if (c.includes('korean'))
    return { emoji: '🍲', color: '#6d28d9' };
  if (c.includes('afghan'))
    return { emoji: '🍖', color: '#b45309' };
  // default — brand green
  return { emoji: '🍽️', color: '#245737' };
}

// ── Brand palette (prayer-first redesign) ─────────────────────────────────────
// Used by Home, Qibla, and onboarding. Cream/deep-green/gold, distinct from the
// legacy `Colors` above — extend this one as more screens get restyled to match.

export const Brand = {
  cream:     '#F7F2E7',
  deepGreen: '#1F3D2B',
  green:     '#245737',
  gold:      '#B08D57',
  textDark:  '#20241F',
  textMuted: '#8C8776',
  hairline:  '#EAE3D3',
  red:       '#C0392B',
  amber:     '#B7791F',
  white:     '#FFFFFF',
  // Zabihah badges — teal, distinct from Brand.green
  zabihah:          '#0C6E78',
  zabihahBg:        '#E0F7F8',
  zabihahPartial:   '#6D9EA4',
  zabihahPartialBg: '#F0F7F8',
};

// ── Shadows ───────────────────────────────────────────────────────────────────

export const Shadow = {
  light: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  strong: {
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  green: (opacity = 0.25) => ({
    shadowColor: Colors.green,
    shadowOpacity: opacity,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  }),
};
