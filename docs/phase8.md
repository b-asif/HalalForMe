# Phase 8 — Global Scale & Internationalization

**Status: ⬜ Not Started**

## Scope

Everything required to genuinely serve "Muslims worldwide" as [PRODUCT_VISION.md](../PRODUCT_VISION.md) states as the founding goal, beyond the country-level defaults and English-only UI that exist today.

## Multi-Language Support

The app is English-only today (UI strings, and the Scanner's ingredient analysis explicitly skips non-English ingredient text rather than mis-analyzing it — see `nonEnglishText` handling in `app/(tabs)/scanner.tsx`). Two separate localization efforts:
- **UI localization** — standard i18n (e.g. `expo-localization` is already a dependency, used today only for device region detection; would need a proper string-translation layer like `i18next` or `react-intl` added on top)
- **Scanner ingredient analysis in other languages** — a much harder problem than UI strings, since the ingredient rule engine (`HARAM_RULES`/`UNCLEAR_RULES` in `scanner.tsx`) is regex-based against English ingredient names. Open Food Facts does provide non-English ingredient text for many products; supporting it well would need either translated rule sets per supported language or a translation step before analysis (with the accuracy risk that implies for a halal/haram determination — this needs careful thought, not just a quick regex port).

## City/Region-Level Prayer Method Overrides

`lib/prayer/methodDefaults.ts` provides a 30-entry **country-level** table (e.g. India → Karachi/Hanafi). This phase would add a layer above that for intra-country variation, where it's real and specified — e.g. if a particular region within a country follows a different convention than the national default. As of this writing, **no such override has actually been identified as needed** (the Bangalore→Karachi example that prompted this discussion turned out to already be covered by India's existing country-level default) — this item should only be built against real, specified exceptions, not spculative ones. See the mechanism sketch in [ARCHITECTURE.md](../ARCHITECTURE.md) / `lib/prayer/coordinates.ts`'s `resolveCountryCode()` (reverse-geocoding is already wired up as of the 2026-07-06 auto-method-switching feature — extending it to also capture region/city would be the natural next step).

## Infrastructure & Performance for Scale

- **Database read patterns at scale** — the Explore tab currently fetches up to 200 restaurants per query and filters/sorts client-side; this won't hold up indefinitely as the restaurant count grows globally. Revisit once real usage data shows where this breaks down (ties into [Phase 3](./phase3.md)'s map-based "search this area" pattern, which naturally bounds the query to a viewport instead of a flat limit).
- **Leaderboard view performance** — `alltime_leaderboard`/`monthly_leaderboard` are recomputed per query (`SUM`/`RANK` over the full `contribution_points` table); fine at current volume, worth revisiting as part of [Phase 5](./phase5.md)'s re-launch if contribution volume grows substantially.
- **CDN/image delivery** — restaurant/review photos are served directly from Supabase Storage public buckets today; revisit if global image load times become a problem.

## Exit Criteria

- [ ] UI string localization framework in place with at least one non-English language shipped
- [ ] A documented decision on whether/how the Scanner supports non-English ingredient analysis
- [ ] Any specified (not speculative) city/region-level method override actually implemented and tested
- [ ] Database query patterns re-evaluated against real usage data at whatever scale has been reached
