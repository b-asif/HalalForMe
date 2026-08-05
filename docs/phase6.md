# Phase 6 — Notifications & Engagement Platform

**Status: 🟡 In Progress**

## Scope

Server-side push notification infrastructure already exists — this phase is about closing coverage gaps and expanding what it's used for, not building it from scratch (an earlier version of this roadmap listed server-side push as "not started," which was inaccurate as of the 2026-07-06 correction — see [PRODUCT_VISION.md](../PRODUCT_VISION.md#5-whats-changed-since-the-original-vision-doc)).

## What Already Exists

- `push_tokens` table (`user_id`, `token`)
- Three Supabase Edge Functions: `notify-admin` (new submissions/claims/reviews/reports → all admins), `notify-user` (status updates → the specific affected user), `weekly-digest` (weekly activity summary → admins, cron-triggered)
- Real call sites wired into `submit-restaurant.tsx`, `restaurant/[id].tsx`, `claim-restaurant/[id].tsx`, and the admin review/claim moderation screens

See [ARCHITECTURE.md](../ARCHITECTURE.md#server-side-push-notification-architecture) for the full flow.

## Token Registration Coverage — Fixed (2026-07-11)

`registerPushToken()` (`lib/notifications.ts`) used to be called **only from `app/notifications.tsx`**, the in-app Notifications screen — not automatically at login or app start, meaning a user who never opened that screen had no row in `push_tokens` and could never receive a push about their own submission/claim/review status, even though the sending logic was fully correct.

This was the highest-leverage fix in this phase and is now done: `app/_layout.tsx` also calls `registerPushToken()` from a `useEffect` keyed on `session?.user?.id`, firing on every sign-in. See CHANGELOG.md (2026-07-11) — the fix predated that changelog entry and was found undocumented.

## Planned Expansion

With coverage fixed, remaining work in this phase:
- Extend server-side push to review replies/engagement (if/when added), community activity (once [Phase 5](./phase5.md)'s re-launch plan is underway — e.g. badge earned, leaderboard position change), and richer prayer-related re-engagement — the last one needs careful thought to avoid contradicting the app's own "we don't nag" positioning
- Measure actual delivery coverage now that registration fires automatically — no analytics/instrumentation exists yet to compute tokens registered ÷ active users (see the scale-plan discussion in session notes)

## Exit Criteria

- [x] Push token registration happens automatically for every signed-in user, not only those who've visited the Notifications screen
- [ ] Measured push delivery coverage (tokens registered ÷ active users) reaches a healthy baseline
- [ ] At least one new push use case beyond the current submission/claim/review/digest set is shipped, if justified by Phase 5's community re-launch
