# HalalForMe — Database Schema

Supabase (Postgres) is the sole backend. This document is organized by **provenance**, which matters more than it would in most schema docs: several core tables predate this repo's migration tracking and exist only in the live database. Treat any table not explicitly listed as "tracked" as **best-effort reconstruction from application code**, not a verified schema — always check the live database before writing code that assumes a specific column exists.

## ⚠️ Untracked Tables (Inferred From Usage, Not From Migrations)

These tables are queried extensively throughout the app but have **no `CREATE TABLE` in any file under `supabase/migrations/`**. They were created directly against Supabase (dashboard or an untracked script) before migration tracking started. This has already caused real, silent bugs — see [CLAUDE.md](./CLAUDE.md#keeping-docs-honest).

RLS and `CREATE TABLE` definitions are now both in version control:
- **`029_rls_core_tables.sql`** (2026-07-15) — enables RLS and creates named policies on all eight tables
- **`030_baseline_schema.sql`** (2026-07-15) — `CREATE TABLE IF NOT EXISTS` for all eight tables, captured from the live database via `information_schema` introspection

The schema is now fully reproducible from `supabase/migrations/`, with the caveat in `030` that it must be applied before migrations 001–029 on a fresh deployment (see the ordering note in that file).

| Table | RLS | CREATE TABLE | Verified columns (from live DB, 2026-07-15) |
|---|---|---|---|
| `restaurants` | ✓ 029 | ✓ 030 | `id, name, address, lat, lng, cuisine_type, primary_certifier, is_verified, phone, website, submitted_by, created_at, updated_at, image_url, confidence, cuisine, osm_id, status, reason, source, certifiers, user_id, gallery_images, opening_hours, categorized_photos, avg_rating, review_count, owner_id, instagram_handle, zabihah_status, zabihah_notes, category, has_prayer_room`. Note: `avg_rating` and `review_count` **do exist** as nullable columns (contrary to an older note in this file); ratings are also computed client-side as a fallback. One column at ordinal position 22 was dropped from the live DB at an unknown point. |
| `reviews` | ✓ 029 | ✓ 030 | `id, user_id, restaurant_id, rating, halal_compliance_rating, comment, created_at, updated_at, photo_urls, food_rating, ambiance_rating, service_rating, value_rating, status, is_anonymous`. UNIQUE on `(user_id, restaurant_id)`. |
| `submissions` | ✓ 029 | ✓ 030 | `id, user_id, name, address, cuisine_type, phone, website, certification_photo_url, notes, status, reviewer_notes, created_at, food_photo_urls, restaurant_photo_urls, restaurant_id, lat, lng` |
| `profiles` | ✓ 029 | ✓ 030 | `id, name, avatar_url, dietary_preferences, created_at, updated_at, is_admin, tos_accepted_at, leaderboard_anonymous`. FK → `auth.users` CASCADE. |
| `saved_restaurants` | ✓ 029 | ✓ 030 | `id, user_id, restaurant_id, created_at`. UNIQUE on `(user_id, restaurant_id)`. |
| `restaurant_claims` | ✓ 029 | ✓ 030 | `id, restaurant_id, user_id, contact_name, contact_email, role, message, status, created_at, reviewed_at, proof_url`. UNIQUE on `(restaurant_id, user_id)`. |
| `push_tokens` | ✓ 029 | ✓ 030 | `id, user_id, token, created_at`. UNIQUE on `(user_id, token)`. Security note: a pre-existing `"Service role reads all"` policy (`TO public, USING (true)`) that exposed all tokens to unauthenticated callers is dropped in `030`. |
| `admin_notifications` | ✓ 029 | ✓ 030 | `id, type, title, body, link_type, link_id, is_read, created_at` |

## ✅ Tracked Tables & Changes (from `supabase/migrations/`)

### `001_gallery_and_admin.sql`
- `submissions` += `food_photo_urls text[]`, `restaurant_photo_urls text[]`
- `restaurants` += `gallery_images text[]`
- `profiles` += `is_admin boolean DEFAULT false`
- Storage bucket: `gallery_photos` (public)

### `002_review_categories.sql`
- `reviews` += `food_rating`, `ambiance_rating`, `service_rating`, `value_rating` (all `integer CHECK (1-5)`)

### `003_menu_photos.sql` — new table `menu_photos`
```
id uuid PK, restaurant_id uuid FK→restaurants, user_id uuid FK→auth.users, url text, created_at
```
RLS: public read; owner-only insert/delete.

### `004_restaurant_photos.sql` — new table `restaurant_photos`
```
id uuid PK, restaurant_id uuid FK→restaurants, user_id uuid FK→auth.users,
review_id uuid FK→reviews (nullable, SET NULL on delete),
url text, category text CHECK IN ('food','outside','inside'), created_at
```
RLS: public read; owner-only insert/delete.

### `005_delete_user.sql` — RPC `delete_user()`
`SECURITY DEFINER` function that deletes all of a user's rows across every table, then removes the `auth.users` row. Granted to `authenticated`, revoked from `PUBLIC`. Called from Profile's account-deletion flow.

### `006_moderation.sql`
- `reviews`, `restaurant_photos`, `menu_photos` += `status text DEFAULT 'approved'` (existing rows grandfathered in as approved; new inserts explicitly set `'pending'`)
- Indexes on `status` for admin queue queries

### `007_safety_features.sql` (Apple Guideline 1.2 compliance)
- `profiles` += `tos_accepted_at timestamptz`
- New table `reports`: `id, reporter_id FK→auth.users, content_type CHECK IN ('review','restaurant'), content_id, reason CHECK IN ('spam','inappropriate','harassment','other'), comment, status CHECK IN ('pending','reviewed','dismissed'), created_at`. RLS: reporters see their own; admins see/update all.
- New table `blocks`: `id, blocker_id FK→auth.users, blocked_id FK→auth.users, created_at`, unique on the pair. RLS: users manage their own.

### `008_verified_products.sql` — new table `verified_products`
```
id uuid PK, barcode text UNIQUE, product_name text,
verdict text CHECK IN ('halal','haram','unclear'),
verified_by text CHECK IN ('admin','certification') DEFAULT 'admin',
notes text, created_at, updated_at (auto-updated via trigger)
```
RLS: public read; admin-only write. Populated by admins reviewing `scan_reports`; overrides the Scanner's automated ingredient analysis when a barcode matches.

### `009_gamification.sql` — contribution points, badges, leaderboards
- New table `contribution_points`: `id, user_id FK→profiles, type CHECK IN ('restaurant_approved','photo_approved'), reference_id, points, earned_at`, **unique on `(type, reference_id)`** to prevent double-awarding on re-approval.
- New table `user_badges`: `id, user_id FK→profiles, badge_type CHECK IN ('first_scout','scout','super_scout','lensman','community_star'), earned_at`, unique on `(user_id, badge_type)`.
- Views `alltime_leaderboard` / `monthly_leaderboard`: `SUM(points)` + `RANK()` (ties share rank), monthly view bounded by UTC month start.
- Function `check_and_award_badges(user_id)`: awards badges by threshold (1/5/25 approved restaurants → first_scout/scout/super_scout; 10 approved photos → lensman).
- Triggers `trg_submission_approved` (+50 pts), `trg_photo_approved` (+10 pts) — both `SECURITY DEFINER`, fire on status transition to `'approved'`.
- RLS: users read only their own points/badges; **no INSERT policy exists on purpose** — points are only ever awarded via the `SECURITY DEFINER` triggers, so no authenticated user can self-award points by inserting directly.

### `010_leaderboard_privacy.sql`
- `profiles` += `leaderboard_anonymous boolean DEFAULT false` — opt-in pseudonym display on the public leaderboard.

### `011_review_points.sql`
- Extends `contribution_points.type` CHECK to include `'review_approved'`.
- Trigger `trg_review_approved` (+15 pts on review approval).
- Trigger `trg_approve_review_photos` — auto-approves any `restaurant_photos` linked via `review_id` when the parent review is approved (cascades the +10/photo award too).

### `012_backfill_review_photos.sql`
One-time backfill: approves any `restaurant_photos` already linked to an approved review but still `'pending'` (predating the trigger in `011`).

### `013_grant_gamification.sql`
`GRANT SELECT` on `contribution_points`, `user_badges` (to `authenticated`) and both leaderboard views (to `authenticated, anon`) — Supabase doesn't auto-grant `SELECT` on new tables/views, so without this migration points/badges silently read as null/zero for every client.

### `014_backfill_points.sql`
One-time backfill: awards points retroactively for everything approved before the `009`/`011` triggers existed, with `ON CONFLICT DO NOTHING` to avoid double-awarding anything already covered.

### `015_scan_reports.sql` — new table `scan_reports`
```
id uuid PK, barcode text, product_name text,
report_reason text CHECK IN (the 6 fixed options shown in the Scanner's report sheet),
verdict_shown text CHECK IN ('halal','haram','unclear','no_data'),
status text DEFAULT 'pending' CHECK IN ('pending','reviewed','dismissed'),
created_at
```
RLS: **public insert** (scanning works for guests, no `reporter_id`/auth requirement); admin-only read/update.

Written idempotently (`ADD COLUMN IF NOT EXISTS` per column, not a single `CREATE TABLE` assumed to be a no-op) because the table **already existed live** with a different, unknown shape when this migration was first written — see [CLAUDE.md](./CLAUDE.md#keeping-docs-honest) for the full story.

### `016_zabihah.sql` — zabihah columns on `restaurants`
- `restaurants` += `zabihah_status text CHECK IN ('full', 'partial')` (nullable — NULL means not zabihah)
- `restaurants` += `zabihah_notes text` (nullable — optional free text, e.g. "Beef & lamb only — chicken is not zabihah")

Idempotent (`ADD COLUMN IF NOT EXISTS`). "Zabihah" is a slaughter method, not a certifying body — stored as a separate attribute so a restaurant can be e.g. `primary_certifier = 'HMA'` AND `zabihah_status = 'full'` simultaneously.

## Storage Buckets

| Bucket | Public | Used for |
|---|---|---|
| `gallery_photos` | Yes | Review photos, submission photos |
| `avatars` | Yes | Profile avatar images |

## Row-Level Security Summary

Every table (tracked and previously-untracked) now has RLS enabled as of migration `029_rls_core_tables.sql`. The general pattern:
- **Public read** for user-facing content (reviews, photos, verified products, leaderboards, restaurants)
- **Owner-only write** for user-generated content (`auth.uid() = user_id`)
- **Admin-only write** for moderation-controlled data (`verified_products`, report status updates, `admin_notifications`)
- **Admin-only read** for internal tables (`admin_notifications`, all submissions/claims beyond the owner's own)
- **Owner-only read+write** for private user data (`saved_restaurants`, `push_tokens`)
- **No client-side INSERT for point-bearing tables** — points/badges are only ever written by `SECURITY DEFINER` trigger functions, never directly by a client, closing off the obvious self-awarding exploit

### Previously-untracked tables — RLS status after `029_rls_core_tables.sql`

| Table | RLS | Read policy | Write policy |
|---|---|---|---|
| `profiles` | ✓ | public read | owner update; admin update any |
| `restaurants` | ✓ | public read | owner update (claimed); admin all |
| `reviews` | ✓ | public read | owner insert/update/delete; admin update |
| `saved_restaurants` | ✓ | owner-only | owner-only |
| `submissions` | ✓ | owner + admin | owner insert; admin update |
| `restaurant_claims` | ✓ | owner + admin | owner insert; admin update |
| `push_tokens` | ✓ | owner-only | owner-only (edge functions use service key, bypass RLS) |
| `admin_notifications` | ✓ | admin-only | admin-only (edge functions use service key, bypass RLS) |
