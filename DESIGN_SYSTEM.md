# HalalForMe — Design System

Single source of truth for visual design tokens: `lib/theme.ts`. Every screen should import from there rather than redefining colors/spacing locally — this document explains what exists and the current migration status between the two palettes that coexist right now.

## Two Palettes, One Transition In Progress

### `Brand` — the current visual direction

Cream/deep-green/gold. This is the palette used by the "prayer-first redesign": **Home, Qibla, onboarding, Explore, Scanner, Profile.**

```ts
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
};
```

- **cream** — screen backgrounds
- **deepGreen** — primary buttons, hero accents, splash background
- **green** — secondary brand green, active/selected states, success
- **gold** — accent color for highlights, stars, decorative elements (mandala, Qibla needle tip)
- **textDark / textMuted** — primary/secondary text on cream backgrounds
- **hairline** — dividers and thin borders
- **red / amber** — error / warning, consistent across both palettes

### `Colors` — the legacy palette

Still in active use by **restaurant detail, submit-restaurant, saved/reviews/submissions/photos screens, blocked-users, legal pages, auth screens, and the entire admin panel.**

```ts
export const Colors = {
  green: '#245737', red: '#e53e3e', amber: '#d97706', redDark: '#c0392b',
  text: '#111', textSub: '#555', textMuted: '#888', textFaint: '#aaa', textGhost: '#ccc',
  border: '#ebebeb', borderFaint: '#f0f0f0',
  bg: '#f5f5f5', bgAlt: '#f7f7f7', bgInput: '#fafafa', white: '#fff',
  greenTint: '#e6f9f2', greenBg: '#f0faf6', redTint: '#fff5f5', amberTint: '#fffbeb',
};
```

Note that `green` (`#245737`) is shared between both palettes — that's not a coincidence, it's the one color that carried over unchanged when the Brand palette was introduced. Most admin screens and several legal/auth screens don't even import from `lib/theme.ts` — they hardcode `const GREEN = '#245737'` locally, which is functionally consistent but not centrally managed.

### Migration Status

| Screen area | Palette | Status |
|---|---|---|
| Home, Qibla, onboarding | `Brand` | ✅ Migrated |
| Explore, Scanner, Profile | `Brand` | ✅ Migrated |
| Restaurant detail | `Colors` / local hardcoded | ⬜ Not migrated (Phase 2) |
| Submit-restaurant, claim-restaurant | `Colors` / local hardcoded | ⬜ Not migrated (Phase 2) |
| Saved, My Reviews, My Submissions, My Photos, Blocked Users | `Colors` / local hardcoded | ⬜ Not migrated (Phase 2) |
| Legal pages (privacy, terms, certification guide, help) | local hardcoded | ⬜ Not migrated (Phase 2) |
| Auth screens (login, signup, password reset, OTP) | local hardcoded | ⬜ Not migrated (Phase 2) |
| Admin panel (all screens) | local hardcoded `GREEN`/`RED` | ⬜ Not migrated (Phase 2 or later — lower priority, internal-only surface) |

**When migrating a screen:** replace local color constants with imports from `Brand`, and update backgrounds from `Colors.bg` (`#f5f5f5`, cool light grey) to `Brand.cream` (`#F7F2E7`, warm cream) — the visual difference is the core of the redesign, not just a token rename.

## Typography

```ts
export const Type = {
  screenTitle:  { fontSize: 22, fontWeight: '800' },
  sheetTitle:   { fontSize: 20, fontWeight: '800' },
  cardTitle:    { fontSize: 16, fontWeight: '700' },
  sectionLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  label:        { fontSize: 13, fontWeight: '600' },
  body:         { fontSize: 15 },
  bodySmall:    { fontSize: 14 },
  caption:      { fontSize: 12 },
  tiny:         { fontSize: 11 },
};
```

Screens on the `Brand` palette generally don't consume `Type` directly — they define their own `StyleSheet` objects with sizes matching this scale by convention. Treat `Type` as the intended scale even where a screen hasn't literally imported it.

## Spacing & Radius

```ts
export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const Radius  = { input: 14, card: 16, chip: 20, sheet: 28, circle: 999 };
```

- **input (14px)** — text inputs, primary buttons
- **card (16px)** — cards, list items
- **chip (20px)** — filter chips, badges, pills
- **sheet (28px)** — bottom sheet top corners
- **circle (999px)** — fully round (avatars, icon circles)

## Shadows

```ts
export const Shadow = {
  light:  { shadowOpacity: 0.04, shadowRadius: 6,  shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  medium: { shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  strong: { shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  green:  (opacity = 0.25) => ({ shadowColor: Colors.green, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6, shadowOpacity: opacity }),
};
```

Cards on `Brand`-migrated screens typically inline their own shadow values matching `medium` rather than importing `Shadow` directly (same pattern as `Type` above) — consistent by convention, not by strict enforcement.

## Cuisine Visual Themes

`getCuisineTheme(cuisine: string)` returns an `{ emoji, color }` pair used to build a rich, distinct placeholder when a restaurant has no photo — e.g. 🍛 terracotta for South Asian, 🥙 blue for Middle Eastern, 🍕 red for Italian, 🌮 green for Mexican, 🍱 purple for Japanese, and 13 other cuisine categories, with `#245737` (brand green) as the default for anything unmatched. This function lives in `lib/theme.ts` alongside the palettes and is used by `RestaurantCard.tsx` and the restaurant detail hero.

## Prayer Strip Visual States (Home Tab)

A concrete example of the design language in practice — the Home tab's prayer-time list uses exactly three visual states, deliberately not more:

1. **Past prayers** (and Sunrise, always) — `Brand.textMuted`, medium weight
2. **Current prayer** — `Brand.green`, bold, plus a soft green-tinted pill background (`#EFF6F1`) behind the row
3. **Upcoming prayers** — `Brand.textDark`, normal weight

This pattern (past = muted, current = distinctly highlighted, future = normal — no fourth state) is a useful reference for any other "timeline-like" list added elsewhere in the app.

## Icon & Notification Assets

App icon, splash icon, adaptive icon (Android), and favicon are single-source PNGs in `assets/` (`icon.png`, `splash-icon.png`, `adaptive-icon.png`, `favicon.png`). These are compiled into native asset catalogs at build time (`ios/.../Images.xcassets/AppIcon.appiconset/`, `android/.../mipmap-*/`) — **updating the source PNG in `assets/` has no effect on an already-installed app** until a fresh native build (local `expo prebuild` + rebuild, or an EAS cloud build) is produced and reinstalled. See [ARCHITECTURE.md](./ARCHITECTURE.md#native-asset-baking) for the full explanation and the disk-space gotchas encountered while fixing a stale icon.
