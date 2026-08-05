# HalalForMe — API Plan

HalalForMe has no custom backend server today — the "API" is Supabase's auto-generated PostgREST layer plus a small number of Edge Functions. This document describes the current surface and the plan for what comes next as the app scales.

## Current API Surface

### 1. PostgREST (auto-generated, via `@supabase/supabase-js`)

Every table in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) is queried directly from the client via the Supabase JS SDK — there is no intermediate REST/GraphQL layer we control. Access control is enforced entirely by Postgres Row-Level Security policies, not by application-layer authorization code. This is appropriate at current scale but has real limits — see "Planned: A Real API Layer" below.

Client-visible operations follow this shape everywhere in the app:
```ts
supabase.from('restaurants').select('...').eq('...').order('...').limit(200)
supabase.from('reviews').insert({ ...payload, status: 'pending' })
supabase.rpc('delete_user')
```

### 2. Supabase RPCs (Postgres functions callable from the client)

| Function | Purpose |
|---|---|
| `delete_user()` | `SECURITY DEFINER`, deletes all of a user's data + their auth record. Granted to `authenticated` only. |
| `check_and_award_badges(user_id)` | Internal — called from triggers, not directly by the client |

### 3. Edge Functions (Deno, server-side, use the service-role key)

| Function | Trigger | Purpose |
|---|---|---|
| `notify-admin` | Called from `submit-restaurant.tsx`, `restaurant/[id].tsx`, `claim-restaurant/[id].tsx` | Logs an `admin_notifications` row + pushes to every admin's registered device tokens |
| `notify-user` | Called from admin review/claim moderation actions | Pushes a status update to a specific user's device tokens |
| `weekly-digest` | Cron (`GET`) or manual (`POST`) | Aggregates a week of platform activity into one admin push |

All three push through `https://exp.host/--/api/v2/push/send` using tokens from `push_tokens`. **The service-role key lives only in Edge Function environment variables — never in client code, never in `eas.json`.**

### 4. Third-Party APIs Called Directly From the Client

| API | Used for | Notes |
|---|---|---|
| Open Food Facts (`world.openfoodfacts.org`) | Barcode/ingredient lookup in the Scanner | Public, no API key, wrapped in `fetchWithTimeout` (10s default) |
| OS-level geocoder (via `expo-location`) | Manual city search, reverse-geocoding for country detection | Not a network API we call directly — routed through iOS/Android's own geocoding service, which is why there's no separate geocoding API key/cost to manage |

## Planned: A Real API Layer

At current scale, direct client → Supabase access with RLS is the right level of complexity — it avoids building and operating a server for no real benefit. This should change if/when any of the following become true, and is explicitly **not** planned before then:

- **Complex, multi-step business logic** that shouldn't live in Postgres triggers (the gamification points system is already close to this line — see `check_and_award_badges` and the award triggers in `009_gamification.sql`/`011_review_points.sql`)
- **Rate limiting / abuse prevention** beyond what RLS can express
- **A public/partner API** (e.g. if a mosque-finder aggregator or a third-party halal-data consumer wanted programmatic access) — this would need its own versioned, documented, authenticated surface, entirely separate from the app's internal Supabase access
- **Server-side aggregation** too expensive to compute client-side or via a Postgres view (the leaderboard views already show where this pattern's limits are — they're recomputed per-query today, which is fine at current data volume but not indefinitely)

## Push Notification API Coverage Gap

Documented in detail in [ARCHITECTURE.md](./ARCHITECTURE.md#server-side-push-notification-architecture) and [TASKS.md](./TASKS.md): the push infrastructure exists and is called from real user actions, but `registerPushToken()` only runs when a user visits the in-app Notifications screen — not at login. Closing this gap (Phase 6) is a client-side call-site change, not a new API.
