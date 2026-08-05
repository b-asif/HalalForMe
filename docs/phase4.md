# Phase 4 — Trust, Safety & Technical Debt

**Status: ⬜ Not Started**

## Scope

Two related threads of technical debt that both come down to "the codebase currently trusts things it can't fully verify": untracked database schema, and no automated test coverage beyond manual math validation.

## Formalize Untracked Database Tables

As documented in detail in [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md), the following tables are queried extensively but have no `CREATE TABLE` in any tracked migration — they predate migration tracking and were created directly against the live Supabase project:

- `restaurants`, `reviews`, `submissions`, `profiles` (base tables — only ever `ALTER`ed by tracked migrations, never created by one)
- `saved_restaurants`, `restaurant_claims`
- `push_tokens`, `admin_notifications`

This isn't just a documentation nicety — it has already caused real, silent bugs (the Explore rating filter and the Scanner's report feature both broke because code assumed a schema shape that either never existed or existed differently than assumed; see [CHANGELOG.md](../CHANGELOG.md), 2026-07-05 and 2026-07-06 entries).

**Plan:**
1. Use `supabase db pull` (or manual inspection via the SQL editor) to capture the actual live schema for each untracked table.
2. Write a consolidated baseline migration (or one per table) that reconstructs the current live shape, using `IF NOT EXISTS`/idempotent patterns throughout — per the lesson learned in `015_scan_reports.sql`, never assume a straightforward `CREATE TABLE` is a safe no-op against a live table that might already exist in a different shape.
3. From that point forward, every schema change goes through a tracked migration — no more direct dashboard edits for anything beyond one-off data fixes.

## Automated Test Suite

Today, correctness is validated only by manual Node scripts (`scripts/validate*.ts`, runnable via `npm run validate:prayer`/`validate:qibla`/`validate:methodDefaults`/`validate:notificationPlan`) against the pure modules in `lib/prayer/`. This is a real, working substitute for unit tests on the math-heavy parts of the app, but it's manual (someone has to remember to run it) and has no coverage at all outside the prayer/Qibla subsystem.

**Plan:**
1. Wire the existing `validate:*` scripts into CI so they run automatically on every PR, not just when someone remembers.
2. Add component/screen-level tests for the highest-risk areas first: notification scheduling logic, the Scanner's ingredient rule engine (`analyzeIngredients`), and the Explore tab's filter/sort logic — all pure-enough functions that don't require heavy native mocking.
3. Consider Detox or Maestro for end-to-end flows (sign-up → scan → verdict, search → filter → detail) once unit coverage is in place — lower priority than unit coverage of the math-heavy logic.

## Exit Criteria

- [ ] Every table in the live Supabase project has a corresponding `CREATE TABLE` in `supabase/migrations/`
- [ ] `scripts/validate*.ts` run automatically in CI
- [ ] Unit test coverage exists for the Scanner's ingredient rule engine and the notification scheduling pure functions
