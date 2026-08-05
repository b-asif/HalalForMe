# HalalForMe — Product Vision

*Building the daily Muslim companion app — prayer-first, privacy-first, and built to earn a place on the home screen, not just the App Store search results.*

> This document supersedes and expands on `docs/HalalForMe_Vision_Roadmap.pdf` (July 2026). Where the two disagree, this document is current — see the "What's Changed Since the Original Vision Doc" section at the end.

## 1. Why We're Building This

HalalForMe started as a halal restaurant directory. That's a real need, but it's an *occasional-use* product — someone opens a restaurant-finder app a few times a month, if that. An app built only around restaurant discovery will always struggle to become a daily habit, and daily habits are what make an app indispensable rather than disposable.

We asked a founder-level question: if this app didn't exist yet, what would we build for Muslims worldwide from first principles? The answer that kept surfacing was **prayer**. It happens five times a day, for essentially every practicing Muslim, everywhere in the world, with zero "cold start" problem — there's no education needed to explain why someone would want prayer times and a Qibla direction. That's the foundation of a real daily habit loop, something a restaurant directory can never be on its own.

**The pivot, in one sentence:** Prayer times and Qibla become the reason someone opens the app every day. The halal scanner is the strong secondary reason. Restaurant discovery and community features remain valuable, but as supporting modules — not the flagship.

## 2. The Four Pillars

### 🕌 Prayer Times & Notifications
The daily habit engine. Accurate, location-aware prayer times with a calculation method and madhab that match the user's own tradition, plus timely reminders that respect precaution buffers around fiqh edge cases (e.g. Maghrib). The calculation method now also follows the user automatically when their location changes to a different country (e.g. moving from the US to India correctly shifts the default from ISNA to Karachi), without ever overwriting a method the user picked by hand while staying in one place.

### 🧭 Qibla Compass
A clean, trustworthy compass that tells you which way to face, reachable directly from the home screen the moment prayer time arrives.

### 📷 Halal Scanner
Point your camera at a barcode and know in seconds whether a product is halal, haram, or unclear — with a transparent, ingredient-by-ingredient explanation, not just a verdict.

### 🍽 Restaurant Directory
Find halal restaurants nearby, filtered by certification and cuisine. Still a core feature — just no longer the front door to the app.

A fifth pillar, **Community** (contribution points, badges, leaderboard), already exists in the codebase and is intentionally kept off the tab bar until there's a real plan to seed activity — an empty leaderboard is worse than no leaderboard.

## 3. What's Already Built

This is a snapshot from reading the actual app code, not a plan — everything below exists and works today. (For the full, granular breakdown, see [FEATURES.md](./FEATURES.md).)

**Prayer & Qibla**
- Prayer time calculation via the `adhan` library — 12 calculation methods, Hanafi/Shafi madhab toggle, GPS or manual city location
- Calculation method now auto-aligns to the country the resolved location is actually in, without touching a manual override made while staying in the same country
- Configurable precaution buffer (e.g. Maghrib) so notifications never fire before a prayer has genuinely started
- Local notification scheduling, 7 days ahead on a rolling basis, DATE-type triggers on both platforms (see [CLAUDE.md](./CLAUDE.md) for why)
- Background refresh task registered so the notification schedule stays current without the app being opened
- Qibla compass with live heading, alignment feedback, and bearing/heading/accuracy readout
- Home screen prayer strip redesigned into a three-state timeline (past prayers muted, current prayer highlighted with a tinted pill, upcoming prayers normal) instead of one undifferentiated list

**Halal Scanner**
- Barcode lookup against Open Food Facts, cross-referenced with a static E-number halal-status table and ingredient-name rules — the ingredient logic works fully offline
- Full ingredient-by-ingredient breakdown with the specific reason anything is flagged
- Signals for halal certification, vegan/vegetarian labelling, and community-verified products layered on top of the automated analysis
- Scan history, manual barcode entry, and a "report a problem" flow (now actually persisted server-side — see CHANGELOG)

**Restaurant Directory & Community**
- Search, city/zip distance filtering (with real computed distance shown on each result), cuisine and certification filters, open-now and rating filters (ratings now computed from real review data rather than a column that never existed)
- Restaurant detail pages, reviews, photo uploads, a submit-restaurant flow, and a claim-restaurant (ownership) flow
- Community leaderboard (monthly and all-time points, badges, anonymous-name toggle) — built, present in the code, currently hidden from the tab bar

**Accounts, Trust & Safety**
- Guest browsing — the app is fully usable without an account, with account creation only required for account-gated actions like reviews or submissions
- Email/password auth, OTP verification, password reset
- Admin moderation panel: ownership claims, user reports, review moderation, submission approvals, restaurant editing
- Server-side push notifications to admins (new submission/claim/review/report events) and to users (status updates on their own submissions/claims/reviews), via Supabase Edge Functions and Expo's push API — currently opt-in-by-accident (see [TASKS.md](./TASKS.md))
- Account deletion with double confirmation

**Design & Visual Identity**
- A cream/deep-green/gold visual language rolled out across Home, Qibla, onboarding, Explore, Scanner, and Profile
- A single shared design-token source (`lib/theme.ts`) so every migrated screen pulls from one palette instead of redefining colors locally

## 4. What We Won't Do

- **No selling or sharing of location data.** Location is used to compute prayer times, Qibla direction, and nearby restaurants — never sold, never shared with third parties.
- **No ad SDKs.** Whatever monetization model we eventually pick, it will not come at the cost of tracking-based advertising.
- **No account requirement to use the core app.** Guest browsing stays fully functional; accounts are only required where they genuinely need to be (reviews, submissions, saved items, claims).

## 5. What's Changed Since the Original Vision Doc

The original `docs/HalalForMe_Vision_Roadmap.pdf` (July 2026) is still a faithful account of the founding rationale and the four-pillar structure, but several items it listed have since moved:

| Item | PDF said | Current reality |
|---|---|---|
| iOS notification delivery | INVESTIGATING | **Resolved.** Root-caused to `expo-notifications`' CALENDAR-trigger bug on iOS (`Calendar(identifier: .iso8601)` in its own Swift source); fixed by switching to DATE-type triggers universally. See CLAUDE.md and CHANGELOG.md. |
| Server-side push notifications | NOT STARTED | **Partially built.** `push_tokens` table, three Edge Functions (`notify-admin`, `notify-user`, `weekly-digest`), and real call sites exist (submit-restaurant, claim-restaurant, admin review/claim actions). The gap is coverage, not existence — token registration only happens when a user visits the in-app Notifications screen, not automatically at login. |
| Home prayer strip | Not mentioned | Redesigned into a muted-past / highlighted-current / normal-upcoming timeline, plus a midnight-to-Fajr display bug fixed (previously showed a stuck "Resolving prayer times…" between midnight and Fajr). |
| Explore ratings/distance | Not mentioned | Two bugs found via QA audit and fixed: distance was computed but never rendered on cards; the "Top Rated" filter depended on a `restaurants.avg_rating` column that was never in a tracked migration and may not exist live — now computed from the `reviews` table directly. |
| Scanner reports | Not mentioned | The `scan_reports` table referenced only in a migration *comment* was formally created (`015_scan_reports.sql`), fixing silently-discarded user reports. |

See [ROADMAP.md](./ROADMAP.md) for what's planned next, and [CHANGELOG.md](./CHANGELOG.md) for the full dated history.
