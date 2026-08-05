# CLAUDE.md — Working Agreement for This Repository

This file tells any Claude Code session (or human engineer) how to work in the HalalForMe repo: what the documentation set means, how to keep it synchronized, and which established conventions/decisions should not be silently re-litigated.

## Start Here

If you're picking up this project cold, read in this order:
1. [PRODUCT_VISION.md](./PRODUCT_VISION.md) — why this app exists and what it will never do
2. [FEATURES.md](./FEATURES.md) — what's actually built vs. planned
3. [ARCHITECTURE.md](./ARCHITECTURE.md) — how it's built
4. [TASKS.md](./TASKS.md) — what's actionable right now
5. [ROADMAP.md](./ROADMAP.md) + `docs/phaseN.md` — where it's going

Everything in this documentation set is meant to be **read as current truth, then verified against the code** before you act on it — not blindly trusted forever. See "Keeping Docs Honest" below.

## Documentation Sync Rule

Every time a feature is completed, in the same change:
1. Add an entry to **CHANGELOG.md** (dated, one or two sentences, why not just what).
2. Update **TASKS.md** — move the item out of the active list.
3. Check off the relevant item in **ROADMAP.md** and the matching `docs/phaseN.md`.
4. Update **FEATURES.md** if the feature's status or scope changed (e.g. "PLANNED" → "BUILT", or a new sub-capability was added to something already built).

**Never delete or overwrite documentation history without preserving previous information, unless explicitly instructed.** When a document needs a significant rewrite (not an incremental update), move the outdated section into a "Superseded" note or a dated changelog entry rather than silently dropping it — the goal is that anyone reading `CHANGELOG.md` end-to-end can reconstruct the project's actual history.

## Keeping Docs Honest

This codebase has a recurring, important pattern: **not everything referenced in code is guaranteed to exist in the live database**, because several tables predate this repo's migration tracking (see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for the exact list — `restaurants`, `reviews`, `push_tokens`, `admin_notifications`, and others were created directly against Supabase, not via a tracked `supabase/migrations/*.sql` file). Concretely, this has already caused real bugs:
- The Explore tab's rating filter silently broke because `restaurants.avg_rating` was queried but never existed in a tracked migration (fixed by computing ratings from `reviews` client-side instead — see CHANGELOG).
- The Scanner's "Report this result" feature silently discarded every report for an unknown period because `scan_reports` didn't exist at all (fixed in `supabase/migrations/015_scan_reports.sql`, written idempotently because the table *did* exist live, just with a different shape than assumed).

**Lesson: before trusting that a Supabase table/column exists, grep `supabase/migrations/` for it. If it's not there, say so explicitly rather than assuming — and if you're adding a migration for something that might already exist live in a different shape, write it idempotently (`ADD COLUMN IF NOT EXISTS` per-column, not a single `CREATE TABLE` you assume is a no-op).**

## Established Conventions — Don't Re-Litigate These

- **Pure vs. native module separation** (`lib/prayer/`): modules doing pure computation (`calculate.ts`, `notificationPlan.ts`, `qibla.ts`, `methodDefaults.ts`) never import native/RN-only packages, so they can run under plain Node via `tsx` for regression testing (`scripts/validate*.ts`, `npm run validate:*`). Modules that must call native APIs (`coordinates.ts`, `notifications.ts`, `compass.ts`, `settingsStore.ts`) are kept separate and import pure modules with `import type` where possible. Don't blur this line for convenience.
- **Notification triggers are DATE-type on both platforms, never CALENDAR-type.** This was a deliberate, hard-won fix — CALENDAR triggers silently failed to register on iOS due to a `Calendar(identifier: .iso8601)` bug in expo-notifications' own native Swift source. DST-safety comes from how `fireDate` is computed (Luxon + IANA tz data), not from the trigger primitive. See `lib/prayer/notifications.ts` for the full writeup.
- **`TaskManager.defineTask()` must be imported unconditionally from `app/_layout.tsx`** (via `lib/prayer/backgroundRefresh.ts`), not lazily from a settings screen — otherwise the background task silently never fires on a cold background launch.
- **Guest browsing is a deliberate App Store-compliance decision, not a placeholder.** The app must remain fully usable without an account; only account-gated actions (reviews, submissions, saved items, claims) should ever require sign-in. Don't add auth walls to browsing/discovery features.
- **Community (leaderboard/badges) is intentionally hidden from the tab bar**, not abandoned. The backend (`contribution_points`, `user_badges`, leaderboard views) is fully built and works — it's hidden until there's a concrete plan to seed real activity, because an empty leaderboard is worse than no leaderboard. Don't remove the backend; don't silently re-add the tab without a content plan.
- **Two color systems coexist on purpose right now**: `Colors` (legacy, `lib/theme.ts`) and `Brand` (cream/deep-green/gold, the current visual direction — `lib/theme.ts`). See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for which screens use which and the migration status. Don't introduce a third.
- **`SUPABASE_SERVICE_KEY` must never be exposed client-side or added to `eas.json`.** Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` belong there.
- **Server-side push notifications**: `registerPushToken()` (`lib/notifications.ts`) is called both from the in-app Notifications screen (`app/notifications.tsx`) and automatically at sign-in from `app/_layout.tsx` (a `useEffect` keyed on `session?.user?.id`), so `push_tokens` gets a row for every signed-in device, not just users who happened to visit that screen. This closed what used to be a real coverage gap; fix was already in the codebase but undocumented until 2026-07-11 — see CHANGELOG.md.

## Working Style Notes (from prior sessions)

- Prefer fixing the root cause over working around it (e.g. the CALENDAR→DATE trigger fix, not a retry-loop hack).
- When investigating a claimed bug, verify by tracing actual code/config/schema before proposing a fix — several "is this broken?" questions in this project turned out to require checking the actual Supabase schema, actual library source, or actual file state rather than assuming.
- Disk space has been a recurring, real blocker for local iOS builds (CocoaPods + Xcode DerivedData + Simulator caches easily consume several GB) — check `df -h` before assuming a build failure is a code problem.
- When adding a Supabase migration, check whether the target table might already exist live in an untracked form before assuming `CREATE TABLE IF NOT EXISTS` alone is sufficient.
