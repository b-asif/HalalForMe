# HalalForMe

**The daily Muslim companion app** — prayer times, Qibla direction, a halal barcode/ingredient scanner, and a community-driven halal restaurant directory. Prayer-first, privacy-first, built to earn a place on the home screen.

HalalForMe is an Expo / React Native app (iOS + Android) backed by Supabase. This README is the entry point for engineering — for product, design, and planning context, see the [Documentation Map](#documentation-map) below.

---

## Documentation Map

This project is documented as a set of living, single-source-of-truth Markdown files. Read them in roughly this order depending on what you need:

| Document | What it's for |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | Conventions and working agreements for any Claude Code session (or engineer) working in this repo |
| [PRODUCT_VISION.md](./PRODUCT_VISION.md) | Why this app exists, the four pillars, what we will and won't do |
| [ROADMAP.md](./ROADMAP.md) | The 8-phase build plan, linking out to `docs/phaseN.md` for detail |
| [FEATURES.md](./FEATURES.md) | Full feature inventory — what's built, what's partial, what's not started |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture, folder structure, key patterns |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Every Supabase table, view, function, and trigger, with migration provenance |
| [API_PLAN.md](./API_PLAN.md) | Current API surface (Supabase + Edge Functions) and future API plans |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Colors, type, spacing, and the brand visual language rollout status |
| [TASKS.md](./TASKS.md) | The current, actionable task list — the "what's next" ground truth |
| [CHANGELOG.md](./CHANGELOG.md) | Dated log of everything shipped |
| `docs/phase1.md` … `docs/phase8.md` | Detailed per-phase breakdowns referenced from ROADMAP.md |

**These documents are the single source of truth for the project.** When a feature ships, update `CHANGELOG.md`, `TASKS.md`, the relevant `ROADMAP.md`/`docs/phaseN.md` checkbox, and `FEATURES.md` in the same change — see [CLAUDE.md](./CLAUDE.md) for the exact workflow.

---

## Tech Stack

- **Framework:** Expo SDK ~54, React Native 0.81, React 19, TypeScript, Expo Router (file-based routing)
- **Backend:** Supabase (Postgres, Auth, Storage, Row-Level Security, Edge Functions)
- **Prayer math:** [`adhan`](https://github.com/batoulapps/adhan-js) + Luxon for timezone-safe date handling
- **Location:** `expo-location` (on-device geocoding/reverse-geocoding, no third-party geocoding service)
- **Notifications:** `expo-notifications` (on-device scheduling) + Supabase Edge Functions (server-side push to admins/users via Expo's push API)
- **Native builds:** `expo-background-task` / `expo-task-manager` for background prayer-schedule refresh; EAS Build for cloud compilation

## Getting Started

```bash
npm install
npx expo start
```

- `npm run ios` / `npm run android` — local native build (requires Xcode / Android Studio and enough free disk space — see [ARCHITECTURE.md](./ARCHITECTURE.md#local-native-builds) for the disk-space gotchas we've hit before)
- `eas build --profile preview --platform ios` — cloud build, no local Xcode required (see [ARCHITECTURE.md](./ARCHITECTURE.md#eas-cloud-builds))
- `npm run validate:prayer` / `validate:qibla` / `validate:methodDefaults` / `validate:notificationPlan` — Node-runnable regression scripts for the prayer/Qibla/notification math (see `scripts/`)

Environment variables live in `.env` (see `.env.example` if present, or ask a teammate) — `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are safe to expose client-side. **`SUPABASE_SERVICE_KEY` must never be added to `eas.json` or exposed client-side** — it's for server-side/Edge Function use only.

## Project Structure

```
app/                  Expo Router screens (file-based routing)
  (tabs)/              Home, Explore, Scanner, Profile, Community (hidden)
  (auth)/              Login, signup, password reset, OTP verification
  (admin)/             Moderation panel (submissions, reviews, claims, reports)
  restaurant/[id].tsx   Restaurant detail (reviews, photos, claim, share)
  claim-restaurant/     Ownership claim flow
  ...                   Account screens (saved, my-reviews, my-submissions, my-photos,
                        blocked-users, notifications), legal pages, onboarding
components/            Shared UI components (RestaurantCard, AddressAutocomplete)
contexts/              AuthContext (session, admin flag, sign-out)
lib/
  prayer/               Prayer time calculation, Qibla bearing, compass, notification
                        scheduling — see ARCHITECTURE.md for the pure/native split
  supabase.ts           Supabase client
  theme.ts              Design tokens (see DESIGN_SYSTEM.md)
  errors.ts             User-facing error formatting, fetch-with-timeout
  eNumbers.ts            E-number halal-status lookup table
supabase/
  migrations/            Tracked SQL migrations (see DATABASE_SCHEMA.md for what's
                        tracked vs. inferred-from-usage)
  functions/             Edge Functions (notify-admin, notify-user, weekly-digest)
scripts/                Node-runnable validation scripts for prayer/Qibla/notification math
docs/                   Detailed phase-by-phase roadmap documents
```

## Contributing / Working Agreement

See [CLAUDE.md](./CLAUDE.md) for the full working agreement, including the documentation-sync rule: **every completed feature updates `CHANGELOG.md`, `TASKS.md`, the roadmap, and `FEATURES.md` in the same change.**
