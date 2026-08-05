# HalalForMe — Roadmap

This roadmap is organized into 8 phases. Phase 1 is complete and verified; Phases 2-8 are the proposed build order, grounded in the actual gaps found in the codebase (see [PRODUCT_VISION.md](./PRODUCT_VISION.md) and [FEATURES.md](./FEATURES.md)) rather than invented from scratch. **This structure is a starting proposal, not a locked commitment** — adjust freely as priorities shift, but keep this file and `docs/phaseN.md` in sync with whatever the real order ends up being (see [CLAUDE.md](./CLAUDE.md)).

Each phase has a detail document in `docs/`: [phase1.md](./docs/phase1.md), [phase2.md](./docs/phase2.md), [phase3.md](./docs/phase3.md), [phase4.md](./docs/phase4.md), [phase5.md](./docs/phase5.md), [phase6.md](./docs/phase6.md), [phase7.md](./docs/phase7.md), [phase8.md](./docs/phase8.md).

## Status at a Glance

| Phase | Theme | Status |
|---|---|---|
| 1 | Core Daily-Use Foundation | ✅ Complete |
| 2 | Visual & Reliability Polish | 🟡 In Progress |
| 3 | Restaurant Discovery Maturity | ⬜ Not Started |
| 4 | Trust, Safety & Technical Debt | ⬜ Not Started |
| 5 | Community Re-Launch | ⬜ Not Started |
| 6 | Notifications & Engagement Platform | 🟡 In Progress |
| 7 | Monetization | ⬜ Not Started |
| 8 | Global Scale & Internationalization | ⬜ Not Started |

## Phase 1 — Core Daily-Use Foundation ✅

The four-tab core: Home (prayer times + Qibla launch point), Explore (restaurant finder), Halal Scanner, Profile. Verified complete via a full QA audit (execution-flow tracing, DB/schema cross-checks, navigation verification) — see `docs/phase1.md` for the audit findings and fixes. Guest browsing, auth, and the admin moderation panel are also part of this foundation.

## Phase 2 — Visual & Reliability Polish 🟡

Finish rolling the cream/deep-green/gold design system out to the screens that still carry the older look (restaurant detail, submit-restaurant flow, saved/reviews/submissions screens, legal pages, auth screens, admin panel). Qibla enhancements (rotating true-north compass rose, live distance-to-Kaaba). Background-refresh end-to-end verification on a real device. See `docs/phase2.md`.

## Phase 3 — Restaurant Discovery Maturity

Add a map view (`react-native-maps` isn't installed yet) — restaurant discovery is entirely list-based today, which is the most visible gap versus competitor apps. Richer restaurant profiles, improved filtering/sorting once map-based proximity is available. See `docs/phase3.md`.

**Done ahead of this phase (2026-07-09, see CHANGELOG):** Grocery & Butcher categories, sharing the `restaurants` table via a new `category` column rather than a parallel schema. Admin-curated only for now (no public submission/claiming) — worth revisiting alongside this phase's discovery work if grocery/butcher listings should eventually get the same community-submission model restaurants have.

## Phase 4 — Trust, Safety & Technical Debt

Formalize the untracked database tables (`restaurants`, `reviews`, `push_tokens`, `admin_notifications`, and others — see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)) into proper tracked migrations so the schema is fully reconstructable from `supabase/migrations/`. Stand up an automated test suite beyond the current manual Node validation scripts. See `docs/phase4.md`.

## Phase 5 — Community Re-Launch

Leaderboard and badges are fully built but hidden from the tab bar. This phase is about the *plan*, not the code: seeding real activity so the leaderboard doesn't launch to an empty room, then re-adding the Community tab. See `docs/phase5.md`.

**Related, but a separate initiative:** claimable mosque pages (2026-07-09, see CHANGELOG) — a concierge-onboarded mosque partnership surface (events, announcements, iqama times), distinct from the leaderboard/badges effort above. Built to support direct outreach ("we'll build your mosque a free page"); a public self-serve claim flow is deferred until outreach outgrows hand-to-hand onboarding.

## Phase 6 — Notifications & Engagement Platform 🟡

Server-side push already exists (Edge Functions + `push_tokens`). The main coverage gap — tokens only registering when a user happened to visit the Notifications screen — is fixed as of 2026-07-11 (registration now also fires automatically at sign-in). Remaining: measuring actual delivery coverage (needs analytics, which doesn't exist yet) and expanding push to cover more real events (review replies, community activity). See `docs/phase6.md`.

## Phase 7 — Monetization

No ads SDK, no subscription/IAP library exists yet. Per [PRODUCT_VISION.md](./PRODUCT_VISION.md)'s "What We Won't Do," this must be a model that doesn't compromise the no-ads/no-data-selling privacy commitment — most likely an optional premium tier. See `docs/phase7.md`.

## Phase 8 — Global Scale & Internationalization

Multi-language support, expanded city/region-level prayer-method defaults beyond the current country-level table (e.g. handling intra-country variation, not just Bangalore-follows-Karachi-at-the-country-level), and infrastructure/performance work for serving a global user base. See `docs/phase8.md`.
