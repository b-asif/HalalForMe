-- 051_mosque_posts_unique_event_fix.sql
-- Replaces the partial unique index from 049 with a full unique index.
-- The partial index (WHERE event_start IS NOT NULL) is not usable by
-- PostgREST's ON CONFLICT clause, which causes upserts to fail with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". A non-partial index works because PostgreSQL treats
-- NULL as distinct in unique indexes — so (mosque_id, title, NULL) rows
-- are always allowed to coexist while (mosque_id, title, same_date)
-- rows are correctly blocked as duplicates.

DROP INDEX IF EXISTS public.mosque_posts_unique_event;

CREATE UNIQUE INDEX mosque_posts_unique_event
  ON public.mosque_posts (mosque_id, title, event_start);
