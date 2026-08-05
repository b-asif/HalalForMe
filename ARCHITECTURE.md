# HalalForMe — Architecture

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK ~54, React Native 0.81, React 19, TypeScript |
| Routing | Expo Router (file-based, `app/` directory) |
| Backend | Supabase (Postgres + Auth + Storage + Row-Level Security + Edge Functions) |
| Local persistence | `@react-native-async-storage/async-storage` |
| Prayer math | `adhan` (calculation engine) + `luxon` (timezone-safe date arithmetic) |
| Location | `expo-location` (on-device geocoding/reverse-geocoding/heading, no third-party geocoding service) |
| Notifications (on-device) | `expo-notifications` |
| Notifications (server push) | Supabase Edge Functions + Expo push API |
| Background execution | `expo-background-task` + `expo-task-manager` |
| Camera/scanning | `expo-camera` (barcode scanning) |
| Images | `expo-image` (display), `expo-image-picker` (upload) |
| Native builds | Local Xcode/Android Studio, or EAS Build (cloud) |

## Folder Structure

```
app/                         Expo Router screens — file path = route
  (tabs)/                     Tab group: Home (index), Explore (search), Scanner, Profile, Community (hidden)
  (auth)/                     Auth group: login, signup, forgot/reset password, OTP verification
  (admin)/                    Admin group: dashboard, submissions edit, review/claim moderation, reports, notifications
  restaurant/[id].tsx          Restaurant detail (dynamic route)
  claim-restaurant/[id].tsx     Ownership claim flow (dynamic route)
  _layout.tsx                  Root layout — auth-aware routing, splash screen, unconditional
                              backgroundRefresh import
  onboarding.tsx, saved.tsx, my-reviews.tsx, my-submissions.tsx, my-photos.tsx,
  blocked-users.tsx, notifications.tsx, submit-restaurant.tsx, certification-guide.tsx,
  help.tsx, privacy-policy.tsx, terms-of-service.tsx, qibla.tsx
                              Top-level account/utility/legal screens

components/                  Shared UI: RestaurantCard, AddressAutocomplete
contexts/                    AuthContext (session, user, isAdmin, isPasswordRecovery, signOut)

lib/
  prayer/                     Prayer/Qibla subsystem — see "The Prayer Subsystem" below
  supabase.ts                  Supabase client singleton
  theme.ts                     Design tokens — see DESIGN_SYSTEM.md
  errors.ts                    formatError() (user-facing message mapping), fetchWithTimeout()
  eNumbers.ts                  Static E-number → halal-status lookup table
  notifications.ts             Push token registration (registerPushToken) — separate from lib/prayer/notifications.ts
  guestLoginIntent.ts           Module-level flags distinguishing intentional guest→auth navigation
                              from stale Expo Router nav-state restoration

supabase/
  migrations/                  Tracked, numbered SQL migrations (001-015 as of this writing)
  functions/                    Edge Functions: notify-admin, notify-user, weekly-digest

scripts/                     Node-runnable validation scripts (tsx) for prayer/Qibla/notification math
```

## The Prayer Subsystem — Pure vs. Native Module Separation

This is the most deliberately-architected part of the codebase and worth understanding before touching it.

**Pure modules** (no native/RN imports, runnable under plain Node via `tsx`):
- `calculate.ts` — wraps `adhan`'s `PrayerTimes`, handles the timezone-correct calendar-day resolution (`calendarDateForRuntime`)
- `qibla.ts` — bearing calculation, relative-angle math
- `methodDefaults.ts` — country → recommended calculation method/madhab table
- `notificationPlan.ts` — pure computation of what *should* be scheduled, given coordinates/settings/now
- `notificationScheduleState.ts`'s `needsReschedule` — pure gating logic for the background task

**Native-calling modules** (import `expo-location`/`expo-notifications`, cannot run under Node):
- `coordinates.ts` — GPS resolution, manual city geocoding, country-code reverse-geocoding
- `compass.ts` — live heading subscription
- `notifications.ts` — actual `expo-notifications` scheduling calls
- `settingsStore.ts` — AsyncStorage read/write

Cross-references from pure to native-adjacent modules use `import type` so no runtime native code is ever pulled in transitively. This split exists specifically so `scripts/validate*.ts` can regression-test the prayer/Qibla/notification math with `npm run validate:*` — a real (if partial) substitute for the automated test suite that doesn't exist yet (see [TASKS.md](./TASKS.md)).

## Notification Scheduling Architecture

1. `computeNotificationPlan()` (pure) generates a rolling 7-day plan of `{identifier, prayer, fireDate, title, body}` entries from coordinates + settings + "now," skipping anything already in the past.
2. `rescheduleAllPrayerNotifications()` (native) does a **full cancel-then-reschedule** every time — `Notifications.cancelAllScheduledNotificationsAsync()` followed by scheduling the fresh plan. Never partial/incremental, so a stale and fresh schedule can never coexist.
3. Triggers are **DATE-type on both platforms**, deliberately not CALENDAR-type — CALENDAR triggers silently failed to register on iOS due to a bug in expo-notifications' own native Swift source (`Calendar(identifier: .iso8601)` in its trigger-building code). DST-safety comes entirely from how `fireDate` is computed upstream (Luxon + IANA timezone data), not from the trigger primitive — a DATE trigger is just "fire at this absolute instant," which is unaffected by DST regardless of platform.
4. A background task (`expo-background-task` + `expo-task-manager`) periodically re-runs the reschedule so the 7-day window stays current without the user opening the app. The task handler (`TaskManager.defineTask()`) is registered via an **unconditional side-effect import in `app/_layout.tsx`** — this must happen on every JS bundle execution, including background OS wake-ups, or the task silently never fires.
5. `notificationScheduleState.ts` provides gating logic (`needsReschedule`) so the background path doesn't do unnecessary work — this gating is intentionally *not* applied to the foreground reschedule effect, which always reschedules on settings/location change.

## Auth & Routing Architecture

`AuthContext` (`contexts/AuthContext.tsx`) hydrates from `supabase.auth.getSession()` on boot and stays in sync via `onAuthStateChange`. It separately fetches `is_admin` from `profiles` whenever the logged-in user changes, and backfills `tos_accepted_at` on first sign-in.

`app/_layout.tsx`'s `RootLayoutNav` owns all top-level redirect logic: password-recovery deep links, first-run onboarding (guest and per-user AsyncStorage keys, with a guest→user backfill so someone who saw onboarding as a guest doesn't see it again after signing in), and auth-group redirects. A custom `SplashOverlay` (rendered in a `Modal`) is held until routing has settled, specifically to avoid a flash of the wrong screen while Expo Router restores persisted navigation state.

**Guest browsing is architectural, not incidental**: `!session` does not redirect to auth by default — only account-gated actions (via `setGuestLoginIntent(true)` + `router.push('/(auth)/login')`) send a guest to sign in, and only when they've actually chosen to.

## Server-Side Push Notification Architecture

Three Supabase Edge Functions (Deno), all using the `SUPABASE_SERVICE_ROLE_KEY` server-side (never exposed to the client):

- **`notify-admin`** — logs to `admin_notifications` + pushes to every admin's registered tokens. Called from `submit-restaurant.tsx`, `restaurant/[id].tsx` (new review), `claim-restaurant/[id].tsx`.
- **`notify-user`** — pushes to a specific user's tokens. Called from admin review/claim moderation actions, to notify the original submitter of a status change.
- **`weekly-digest`** — aggregates a week of activity (new users, submissions, claims, reviews, approvals) into a single admin push; designed to be triggered by both `GET` (cron) and `POST` (manual).

All three send through `https://exp.host/--/api/v2/push/send` (Expo's push gateway) using tokens from the `push_tokens` table, populated by `registerPushToken()` (`lib/notifications.ts`) — which is **only called from `app/notifications.tsx`**, the in-app Notifications screen, not automatically at login. This means push delivery coverage depends on whether a given user has ever opened that screen — a real gap, tracked in [TASKS.md](./TASKS.md).

## Native Asset Baking

App icons (and by extension what iOS shows in a notification banner — iOS always uses the app's own registered icon, there's no separate notification-icon override) are compiled into the native asset catalogs (`ios/.../Images.xcassets/AppIcon.appiconset/`, `android/.../mipmap-*/`) at build time. **Updating `assets/icon.png` has zero effect on an already-installed app** — the OS reads whatever was baked into the binary at the time it was compiled and signed. Getting a new icon onto a device requires: a native rebuild (`npx expo prebuild --clean` to resync the native folders from `assets/`, since `ios/`/`android/` are gitignored and disposable) and a fresh install (local Xcode/`expo run:ios`, or an EAS cloud build + reinstall).

### Local Native Builds

Requires Xcode (iOS) and/or Android Studio, plus meaningful free disk space — CocoaPods, Xcode DerivedData, and Simulator caches routinely consume several GB combined. **Disk space has been a real, recurring blocker in this project** — a `prebuild --clean` can silently produce incomplete native folders (missing icon assets, missing `Pods/`, near-empty `android/app`) when disk space runs out mid-operation, while still printing success checkmarks for steps that didn't actually finish. Always check `df -h` before debugging a mysterious build failure. Safe-to-clear locations when space is tight: `~/Library/Developer/CoreSimulator/Caches`, `~/Library/Caches/CocoaPods`, `~/Library/Developer/Xcode/DerivedData` (all regenerate automatically; don't clear `~/Library/Developer/CoreSimulator/Devices`, which holds actual simulator instance data).

### EAS Cloud Builds

`eas build --profile <development|preview|production> --platform <ios|android>` compiles entirely on Expo's infrastructure — no local Xcode, CocoaPods, or disk space required, since `ios:`/`android:` are gitignored and EAS runs `prebuild` fresh in the cloud from `app.json` + `assets/` every time. Distribution differs by profile:
- **`development`/`preview`** (internal/ad-hoc) — requires registering each physical device's UDID once (Apple's ad-hoc provisioning requirement, not an Expo/EAS choice); install via a direct link/QR code EAS provides.
- **TestFlight** (internal testing) — no device UDID registration, skips Apple's full review, but requires an App Store Connect app record and the TestFlight app.
- **Full App Store submission** — no device registration, but goes through Apple's full review (hours to days) — not appropriate for quick iteration.

## Third-Party Data Sources

- **Open Food Facts** (`world.openfoodfacts.org`) — barcode/product/ingredient data for the Scanner. Public API, no key required.
- **Supabase** — all first-party data (restaurants, reviews, users, submissions, moderation, gamification).
- No third-party geocoding service is used anywhere — all location resolution goes through the OS-level geocoder via `expo-location`, which is a deliberate privacy decision (see [PRODUCT_VISION.md](./PRODUCT_VISION.md)).
