# HalalForMe — Feature Inventory

Status legend: ✅ Built & verified · 🟡 Built but partial/incomplete coverage · 🔧 Hidden/deferred (built, intentionally not user-facing) · ⬜ Not started

## Home Tab (Prayer Times)

| Feature | Status | Notes |
|---|---|---|
| Prayer time calculation | ✅ | `adhan` library, 12 calculation methods, Hanafi/Shafi madhab toggle. `lib/prayer/calculate.ts` |
| GPS location resolution | ✅ | On-device only, no third-party geocoding service. `lib/prayer/coordinates.ts` |
| Manual city search | ✅ | OS-level geocoder (`Location.geocodeAsync`) |
| Auto method-switching by location | ✅ | Re-suggests calculation method when the resolved country changes; never overwrites a manual override made while staying in the same country. Tracked via `lastCountryCode` in `PrayerSettings` |
| Country-level method defaults | ✅ | 30-entry table (`lib/prayer/methodDefaults.ts`), e.g. India → Karachi/Hanafi |
| City/region-level method overrides | ⬜ | Not built — would need a curated per-region exceptions table (e.g. if a specific region within a country diverges from the country default). No such divergence has been specified yet. |
| Precaution buffer (e.g. Maghrib) | ✅ | User-adjustable per-prayer minute offsets |
| Local notification scheduling | ✅ | 7 days rolling, DATE-type triggers (see CLAUDE.md for why), cancel-and-reschedule-fully pattern |
| Background schedule refresh | ✅ (build) / ⬜ (verification) | `expo-background-task` task registered unconditionally at app entry; has never been exercised end-to-end on a real device |
| Foreground notification display | ✅ | Explicit `setNotificationHandler` — required or foreground notifications are silently dropped |
| Prayer strip (today's times) | ✅ | Three-state design: muted past prayers + Sunrise, tinted-pill current prayer, normal upcoming prayers |
| Midnight-to-Fajr display | ✅ | Fixed — previously stuck on "Resolving prayer times…" between midnight and Fajr |
| Past-Isha next-prayer display | ✅ | Fixed — now computes tomorrow's Fajr instead of hiding the "next" row entirely |
| Qibla quick-access card | ✅ | Deep-links to `/qibla` |
| Daily Dua card | ✅ | Random dua from UmmahAPI, cached per calendar day in AsyncStorage; taps through to Duas screen |
| Quick-access tiles (5) | ✅ | Qibla, Halal Food, Mosques, Quran, Duas — 3+2 flexWrap grid |
| Upcoming Events card | ✅ | Nearby claimed mosques' upcoming `mosque_posts` events, soonest 5; hidden entirely when there are none |
| Upcoming Jummah card | ✅ | Nearby claimed mosques' Jummah time(s) + khateeb (`mosques.jummah_sessions`); only shown Thursday 6 PM–Friday 3:30 PM, hidden the rest of the week |
| Follow a mosque for Iqama times | ✅ | Opt-in from a mosque's page; shows the followed mosque's Iqama time alongside (never instead of) the computed Adhan time in the hero card + All Prayers sheet. Local device setting (`PrayerSettings.followedMosqueId`), Adhan countdown/notifications unaffected if the mosque's data is stale or missing |

## Quran Screen

| Feature | Status | Notes |
|---|---|---|
| Surah list | ✅ | All 114 surahs via UmmahAPI, searchable by English name or number, virtualized FlatList |
| Surah reader | ✅ | Arabic text (RTL, `textAlign: 'right'`), transliteration, English translation, verse number badges |
| Offline caching | ✅ | 7-day AsyncStorage cache per surah; same-week re-opens hit storage only |

## Duas Screen

| Feature | Status | Notes |
|---|---|---|
| Category list | ✅ | 27 categories from UmmahAPI, 24-hour cache |
| Duas by category | ✅ | Full dua cards: Arabic, transliteration, translation, reference |
| Offline caching | ✅ | 24-hour AsyncStorage cache per category |

## Mosques

| Feature | Status | Notes |
|---|---|---|
| Nearby mosque list | ✅ | Live query against OpenStreetMap Overpass API (`lib/mosques/overpass.ts`), no bulk import, works in any city worldwide. `components/MosqueList.tsx` |
| Mosque detail page | ✅ | `app/mosque/[id]/index.tsx`, keyed by URL-encoded OSM id. Shows basic OSM info for unclaimed mosques; description/contact/website/iqama times/events/announcements once claimed |
| Claimable mosque pages | ✅ | Concierge model, not self-serve: an admin creates the page and shares a one-time invite code out-of-band; no public claim form, proof upload, or review queue (unlike restaurant claims). `supabase/migrations/017_mosques.sql` |
| Invite code redemption | ✅ | `app/redeem-mosque.tsx` (Profile → "Manage a Mosque"), calls the `redeem_mosque_invite()` `SECURITY DEFINER` RPC. Checks existing ownership on every focus — an owner returning to "Manage a Mosque" skips straight to their manage screen instead of re-prompting for the code |
| Owner page management | ✅ | `app/mosque/[id]/manage.tsx` — edit description/contact/website/iqama times, add/delete events & announcements (`mosque_posts`) |
| Multiple Jummah sessions + khateeb | ✅ | `mosques.jummah_sessions` (array of `{time, khateeb}`) — separate from the single-value iqama times since mosques often run several Jummah slots and re-enter the khateeb weekly |
| Manually-added mosques (not in OSM) | ✅ | `app/(admin)/add-mosque.tsx` (admin-only "+" on `app/mosques.tsx`) — synthetic `manual/<uuid>` id in the same `osm_id` column, no schema change. `lib/mosques/manual.ts`'s `fetchNearestMosquesIncludingManual()` merges these into every nearby-mosques surface (list, Home widget, Home upcoming events), not just reachable by direct link |
| Mosque name search | ✅ | `app/mosques.tsx` search box + Explore hub search bar (tries mosques first, falls back to food). `searchOsmMosquesByName()` (Overpass regex-on-name, `lib/mosques/overpass.ts`) + `searchMosquesByName()`/`searchMosques()` (own `mosques` table, `lib/mosques/manual.ts`), merged and deduped by `osm_id` |
| Duplicate-OSM-element fallback | ✅ | `app/mosque/[id]/index.tsx` — when an OSM element has no page but a name-matching element does (common: a mosque's building "way" + POI "node" both exist in OSM), shows a banner linking to the existing page instead of silently offering to create a duplicate |
| "Follow for Iqama Times" button | ✅ | On any claimed mosque page; no sign-in required (local device preference). See Home Tab section for where it's surfaced |
| Recurring, prayer-anchored events | ✅ | `recurring_mosque_events` table (`052_recurring_mosque_events.sql`) — owner configures a weekly recurrence (day + anchor prayer, e.g. "every Monday, after Isha") once in `app/mosque/[id]/posts.tsx`; an hourly `pg_cron` job materializes each week's real occurrence into `mosque_posts` using that day's `iqama_times` and auto-schedules a 1-hour-before push to followers, reusing the existing `event_reminders`/`send_event_reminder_notifications()` delivery pipeline unchanged |
| Website-sync confidence gating | ✅ | `parse-mosque-website/index.ts` only auto-publishes iqama/Jummah times straight to the live mosque row when the extraction is deterministic and high-confidence; anything less certain goes to the admin "Pending Review" queue (`app/(admin)/mosque-sync.tsx`) instead of silently overwriting what's public |
| Notify followers on iqama-time change | ✅ | `mosque_notification_queue` table (`053_mosque_notification_queue.sql`) — owner/admin manual changes notify followers immediately; the unattended sync auto-publish path defers delivery to a reasonable morning hour via a 15-minute `pg_cron` job, capped so it never arrives later than 60 minutes before the earliest changed prayer's next occurrence today |
| Public self-serve mosque claiming | ⬜ | Deliberately deferred — would mirror `restaurant_claims` (role picker, proof upload, admin review queue) if/when outreach moves beyond direct, hand-to-hand onboarding |
| Mosque photo galleries | ⬜ | Not built |
| Volunteer signups / donations | ⬜ | Deliberately deferred — donations in particular needs a payments/compliance model not yet decided |

## Qibla Screen

| Feature | Status | Notes |
|---|---|---|
| Live compass heading | ✅ | `expo-location` heading API, distinguishes permission-denied from thrown errors |
| Bearing calculation | ✅ | Reuses `adhan`'s own `Qibla()` function, spot-verified against known city bearings |
| Alignment feedback | ✅ | "You're facing Qibla" / "Turn left/right N°" |
| Accuracy indicator + calibration hint | ✅ | Prompts "move in a figure-8" below a threshold |
| Rotating true-north compass rose | ⬜ | Currently a fixed dial with a rotating needle — planned for Phase 2 |
| Live distance-to-Kaaba readout | ⬜ | Planned for Phase 2 |

## Explore Tab (Restaurant Directory)

| Feature | Status | Notes |
|---|---|---|
| Restaurant search (text) | ✅ | Name + cuisine substring match |
| Location search (city/zip) | ✅ | OS geocoder, haversine distance filter |
| Distance shown on results | ✅ | Fixed — was computed for sorting/filtering but never rendered on cards |
| Cuisine/certification filters | ✅ | Multi-select filter sheet |
| Open-now filter | ✅ | Computed from `opening_hours` JSON, handles overnight ranges |
| Top-rated / 4+ stars filter | ✅ | Fixed — now computed from the `reviews` table directly rather than a `restaurants.avg_rating` column that was never in a tracked migration |
| Submit-restaurant entry point | ✅ | Sign-in required (account-gated action) |
| Map view | ⬜ | Entirely list-based today; `react-native-maps` isn't installed. Phase 3. |
| Grocery & Butcher categories | ✅ | `restaurants.category` column (`018_business_category.sql`) rather than a parallel schema — reuses reviews/photos/filters as-is. Admin-curated only, no public submission or claiming. Browsed together under one "Grocery & Butcher" Explore hub tile (`?category=market`, mapped to both DB values via `VIEW_CATEGORIES`) since the line between the two is blurry in practice — each row keeps its real category for per-card icons |
| Admin "Manage Listings" screen | ✅ | `app/(admin)/listings.tsx` — browse all listings by category, create new ones from scratch (`edit/[id].tsx` now also handles `id === 'new'`, previously edit-only) |

## Restaurant Detail

| Feature | Status | Notes |
|---|---|---|
| Reviews (CRUD) | ✅ | Per-category ratings (halal compliance, food, ambiance, service, value), anonymous option |
| Photo uploads (categorized) | ✅ | Food/outside/inside/menu tabs, community + admin-curated sources merged |
| Save/bookmark | ✅ | Account-gated |
| Claim (ownership) flow | ✅ | Pending/approved status tracking, admin-side approval |
| Report content | ✅ | Reviews can be reported or the reviewer blocked |
| Share | ✅ | Native share sheet with a deep link |
| Admin edit shortcut | ✅ | Visible to admins only |

## Halal Scanner

| Feature | Status | Notes |
|---|---|---|
| Barcode scanning | ✅ | `expo-camera`, supports EAN-13/8, UPC-A/E, Code128/39, ITF-14, QR |
| Manual barcode entry | ✅ | Fallback when scanning isn't practical |
| Open Food Facts lookup | ✅ | With timeout handling |
| E-number halal-status table | ✅ | `lib/eNumbers.ts`, works fully offline |
| Ingredient-name rule engine | ✅ | Pork, gelatin, alcohol, carmine, blood, tallow, animal enzymes (haram); natural flavors, rennet, L-cysteine, mono/diglycerides, glycerin, shellac, inosinate/guanylate, stearic acid, bone phosphate (unclear) — all with vegan/vegetarian-label exemptions where applicable |
| Halal-certification / vegan label signals | ✅ | From Open Food Facts `labels_tags`, upgrades "unclear" verdicts when certified |
| Community-verified override | ✅ | `verified_products` table, admin-curated, takes precedence over automated analysis |
| Scan history | ✅ | AsyncStorage-backed, last 10 scans |
| Report a problem | ✅ | Fixed — now persists to `scan_reports` (previously silently discarded because the table didn't exist) |

## Profile Tab

| Feature | Status | Notes |
|---|---|---|
| Account info + avatar | ✅ | Editable name/email/avatar, partial-failure-tolerant save (DB succeeds independently of auth metadata update) |
| Guest state | ✅ | Full sign-in/sign-up CTAs + legal links, not a broken/blocked screen |
| Menu navigation | ✅ | Saved, My Submissions, My Reviews, Blocked Users, Certification Guide, Notifications, Help, legal pages, Admin Panel (admins only) |
| Sign out | ✅ | |
| Account deletion | ✅ | Double confirmation, storage cleanup, `delete_user()` RPC, graceful "not configured" fallback message |
| Contribution stats card (points/badges) | Removed | Was showing regardless of Community being hidden from the tab bar — removed for consistency (see CHANGELOG) |

## Community (Hidden)

| Feature | Status | Notes |
|---|---|---|
| Contribution points | 🔧 | Awarded via DB triggers on submission/review/photo approval — fully automated, no client-side trust required |
| Badges | 🔧 | first_scout, scout, super_scout, lensman, community_star |
| Monthly/all-time leaderboard | 🔧 | Postgres views using `RANK()`, UTC month boundaries |
| Anonymous leaderboard toggle | 🔧 | Deterministic pseudonym generator (adjective + animal, 900 combinations) |
| Tab bar entry | 🔧 | Deliberately hidden (`href: null` in the tab layout) pending a content-seeding plan |

## Accounts, Trust & Safety

| Feature | Status | Notes |
|---|---|---|
| Email/password auth | ✅ | |
| OTP verification | ✅ | |
| Password reset | ✅ | Includes recovery-session handling to avoid redirect loops |
| Guest browsing | ✅ | Deliberate App Store 5.1.1(v) compliance decision — core app fully usable without an account |
| Admin flag | ✅ | `profiles.is_admin`, checked via `AuthContext` |
| Blocking users | ✅ | Hides their reviews from the blocker |
| Content reporting | ✅ | Feeds the admin reports queue |

## Admin Panel

| Feature | Status | Notes |
|---|---|---|
| Dashboard (stats + pending queues) | ✅ | Restaurants, users, reviews, pending submissions/claims/reviews/reports counts |
| Submission approval | ✅ | Triggers `+50` contribution points + badge check |
| Restaurant editor | ✅ | Full field editor incl. address autocomplete, photo management; also handles creating a listing from scratch (`id === 'new'`), not just editing |
| Manage Listings (browse/create) | ✅ | `app/(admin)/listings.tsx` — all restaurants/grocery/butcher listings, tabbed by category, "+ Add Listing" |
| Review moderation | ✅ | Approve/reject, triggers `+15` points, auto-approves linked photos |
| Claim moderation | ✅ | Ownership verification workflow |
| Reports queue | ✅ | Pending/reviewed/dismissed tabs |
| Admin notification inbox | ✅ | `admin_notifications` table, read/unread tracking |
| Push notification to admins | ✅ | On new submissions/claims/reviews/reports, via Edge Function |
| Push notification to users | ✅ | On status changes to their own submissions/claims/reviews |
| Weekly digest | ✅ | Scheduled Edge Function summarizing weekly activity to admins |

## Notifications (Cross-Cutting)

| Feature | Status | Notes |
|---|---|---|
| On-device prayer notifications | ✅ | Fully built, see Home Tab section |
| Server-side push infrastructure | ✅ | `push_tokens` table, 3 Edge Functions, real call sites |
| Push token registration coverage | 🟡 | Only happens when a user visits the in-app Notifications screen — not automatic at login, so coverage is incomplete across the user base |
| In-app notification history | ✅ | `app/notifications.tsx` |

## Design System

| Feature | Status | Notes |
|---|---|---|
| Brand palette (cream/deep-green/gold) | ✅ | Home, Qibla, onboarding, Explore, Scanner, Profile |
| Legacy palette (`Colors`) | 🟡 | Still used by restaurant detail, submit-restaurant, saved/reviews/submissions, legal pages, auth screens, admin panel — see [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| Shared design tokens | ✅ | Single source (`lib/theme.ts`) |
| Onboarding | ✅ | Explains the 3 core features; mentions calculation-method auto-detection + Settings adjustability |

## Larger Gaps (Not Started)

| Gap | Why it matters |
|---|---|
| Map view | Standard expectation for a restaurant-discovery app; most visible gap vs. competitors |
| Monetization | No ads SDK, no subscription/IAP library — needs a model consistent with the no-ads/no-data-selling commitment |
| Automated test suite | Only manual Node scripts validate prayer/Qibla/notification math today |
| Untracked database tables formalized | `restaurants`, `reviews`, `push_tokens`, `admin_notifications` (and others) predate migration tracking — see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) |
