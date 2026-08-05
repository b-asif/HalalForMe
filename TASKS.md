# HalalForMe — Tasks

The current, actionable ground truth. Update this file the moment something here is finished — move it to [CHANGELOG.md](./CHANGELOG.md) instead of just deleting it. See [CLAUDE.md](./CLAUDE.md) for the full sync workflow.

## 🔴 Active / Blocking

- [ ] **Verify the app icon fix on a real device.** `assets/icon.png` was updated to the new kufi/crescent design, but the notification banner was still showing the old "goat eating a gyro" icon because the native asset catalogs (`ios/.../AppIcon.appiconset/`, Android mipmaps) hadn't been regenerated. In progress: `npx expo prebuild --clean` was run (after freeing disk space and ultimately deleting Xcode entirely), and the plan is now to verify via an EAS ad-hoc/preview build rather than a local Xcode build. **Not yet confirmed working on-device.**
- [ ] **Complete the EAS ad-hoc build + device registration flow** for the icon-fix verification above (see ARCHITECTURE.md's "EAS Cloud Builds" section for the mechanics). If Xcode is needed again later for local builds, it will need to be reinstalled (was deleted to free disk space).

## 🟡 Near-Term

- [ ] **Confirm `verify_jwt` is enabled for `notify-user`/`notify-admin`** in Supabase Dashboard → Edge Functions (not tracked in-repo, no `supabase/config.toml`). The functions now check caller identity/admin status themselves either way, but `verify_jwt` is the outer layer that should also reject fully anonymous requests before the function body runs.
- [ ] **Confirm `halal_certificates` storage bucket is private with per-user path-scoped policies** (security audit, Medium/Low findings — not yet checked against the live dashboard).
- [ ] **`weekly-digest` Edge Function is publicly callable and leaks aggregate metrics** (security audit, Low finding) — needs the same caller-auth treatment as `notify-user`/`notify-admin`, not yet done.
- [ ] **Background refresh verification.** The background prayer-notification-refresh task has never been exercised end-to-end on a real device — needs a real test pass (leave the app backgrounded for the full 7-day window and confirm the schedule stays current).
- [ ] **Qibla rotating compass rose** — currently a fixed dial with a rotating needle; a true-north-anchored rotating rose is a planned enhancement (Phase 2).
- [ ] **Live distance-to-Kaaba readout** on the Qibla screen (Phase 2).
- [ ] **Finish the visual consistency pass** — migrate restaurant detail, submit-restaurant, claim-restaurant, saved/my-reviews/my-submissions/my-photos, blocked-users, legal pages, and auth screens from the legacy `Colors` palette to `Brand` (see [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)).

## 🟢 Larger, Not Yet Started

- [ ] **Map view for restaurant discovery** (Phase 3) — `react-native-maps` isn't installed; discovery is entirely list-based today.
- [ ] **Formalize untracked database tables into migrations** (Phase 4) — `restaurants`, `reviews`, `submissions`, `profiles`, `saved_restaurants`, `restaurant_claims`, `push_tokens`, `admin_notifications` all predate migration tracking. See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).
- [ ] **Automated test suite** (Phase 4) — only manual Node scripts (`scripts/validate*.ts`) exist today.
- [ ] **Community re-launch plan** (Phase 5) — leaderboard/badges are fully built and hidden; needs a concrete activity-seeding plan before the tab comes back.
- [ ] **Monetization model** (Phase 7) — no ads SDK, no subscription/IAP library; must be consistent with the no-ads/no-data-selling commitment in [PRODUCT_VISION.md](./PRODUCT_VISION.md).
- [ ] **City/region-level prayer-method overrides** (Phase 8) — country-level defaults exist (`lib/prayer/methodDefaults.ts`); no sub-country exceptions table exists yet, and none has been specified as actually needed.
- [ ] **Internationalization / multi-language support** (Phase 8).

## ✅ Recently Completed

See [CHANGELOG.md](./CHANGELOG.md) for the full dated history. Most recent:
- Security audit High findings resolved: `notify-user`/`notify-admin` Edge Functions now check caller identity (admin-only / signed-in-only respectively); live RLS on `restaurants`/`restaurant_claims` verified against `pg_policies` — already correctly admin-gated, not a real gap.
- Security audit Critical finding fixed: mosque invite codes were publicly readable via RLS column exposure — now column-REVOKEd, admin read goes through a `SECURITY DEFINER` RPC.
- Push token registration now happens automatically at sign-in (`app/_layout.tsx`), not only when a user visits the in-app Notifications screen — closes the biggest coverage gap from Phase 6. Was already fixed in code but undocumented until 2026-07-11; see CHANGELOG.
- Full Phase 1 QA audit across Home/Qibla/Explore/Scanner/Profile, with 4 concrete fixes (midnight-to-Fajr display bug, Explore distance not rendered, Explore rating filter depending on a nonexistent column, Scanner reports silently discarded)
- Home prayer strip redesigned into a 3-state timeline
- Auto method-switching by resolved location's country
- Removed the orphaned Contribution stats card from Profile (was showing regardless of Community being hidden)
- Onboarding updated to mention automatic calculation-method detection
- Comprehensive project documentation created (this file and its siblings)

## Housekeeping / Minor

- [ ] `sj.ts` (repo root) and `scripts/sj.geojson` appear to be a personal scratch/debug script for San Jose prayer-time testing — confirm whether it should be moved into `scripts/` properly or removed.
- [ ] `unregisterBackgroundPrayerRefresh()` (`lib/prayer/backgroundRefresh.ts`) is exported but never called anywhere — low-severity dead code, not currently wired to any user action.
