# Phase 5 — Community Re-Launch

**Status: ⬜ Not Started**

## Scope

The Community tab (contribution points, badges, monthly/all-time leaderboard) is **fully built and working** — it's deliberately hidden from the tab bar (`href: null` in `app/(tabs)/_layout.tsx`), not incomplete. This phase is about the *plan* to bring it back, not more engineering on the feature itself.

## Why It's Hidden

An empty leaderboard is worse than no leaderboard — launching a "community" feature with zero visible activity signals the app has no users, which is a worse first impression than not having the feature at all. The backend was built ahead of the activity that would justify surfacing it.

## What Already Works (No New Engineering Needed)

- Points awarded automatically via `SECURITY DEFINER` database triggers on submission/review/photo approval (50/15/10 points respectively) — see [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md#009_gamificationsql--contribution-points-badges-leaderboards)
- Badges: `first_scout`, `scout`, `super_scout` (1/5/25 approved restaurant submissions), `lensman` (10 approved photos), `community_star` (currently manual/future-automated, awarded for top-3 monthly placement)
- Monthly and all-time leaderboard views, with tie-aware `RANK()`
- Opt-in anonymous display (deterministic pseudonym: adjective + animal, e.g. "Swift Falcon")
- A full leaderboard/profile UI already exists in `app/(tabs)/community.tsx`

## What This Phase Actually Needs

1. **A concrete activity-seeding plan** — e.g. a launch cohort of contributors, a time-boxed campaign ("help us map the first 100 verified halal restaurants in your city"), or a minimum-activity threshold before the tab reappears for a given region/user base.
2. **A decision on scope of re-launch** — global from day one, or region-by-region as local activity reaches a healthy baseline?
3. **Badge/points tuning** — the current point values (50/15/10) and badge thresholds (1/5/25/10) were set without real usage data; revisit once there's actual contribution volume to look at.
4. **Community-star automation** — currently a manual/future-automation badge; decide whether to build the automation (top-3 monthly detection + auto-award) as part of this launch or keep it manual initially.

## Exit Criteria

- [ ] A written activity-seeding plan exists and has been executed (or is actively running) for at least one region/cohort
- [ ] Point values and badge thresholds have been reviewed against real (even if early) usage data
- [ ] Decision made and documented on `community_star` automation
- [ ] `href: null` removed from the Community tab once the above are satisfied
