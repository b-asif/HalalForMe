-- 053_mosque_notification_queue.sql
-- Queues "iqama times changed" push notifications so unattended sync writes
-- (parse-mosque-website's auto-publish path) don't page followers at 3 AM.
-- Human-triggered writes (owner's manual save in prayer-times.tsx, admin's
-- "Approve & Publish" in mosque-sync.tsx) call notify-mosque-followers
-- directly and don't use this queue — a person choosing to publish right now
-- is never "too late," so there's nothing to defer there.
--
-- send_after is computed by the caller (parse-mosque-website/index.ts) using
-- an urgency-aware formula: defer to a reasonable morning hour, but never
-- past 60 minutes before the earliest changed prayer that still has an
-- upcoming occurrence today (a Fajr change detected at 1 AM must not be
-- deferred until 8 AM, well after that day's Fajr already happened).
--
-- Delivery mirrors event_reminders / send_event_reminder_notifications()
-- (036/040) — a plpgsql function on a pg_cron schedule, posting directly to
-- Expo's push API via pg_net, since pg_cron can't call same-project Edge
-- Functions (documented in 040).

CREATE TABLE IF NOT EXISTS public.mosque_notification_queue (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mosque_id      uuid        NOT NULL REFERENCES public.mosques(id) ON DELETE CASCADE,
  mosque_name    text        NOT NULL,
  mosque_osm_id  text        NOT NULL,
  send_after     timestamptz NOT NULL,
  sent           boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mosque_notification_queue_due_idx
  ON public.mosque_notification_queue (send_after)
  WHERE NOT sent;

-- Service-role-only table — written by the Edge Function's service-role
-- client, read/updated only by the cron function below. No client ever
-- touches this table directly, so RLS is enabled with no policies at all.
ALTER TABLE public.mosque_notification_queue ENABLE ROW LEVEL SECURITY;

-- ── Delivery ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_queued_mosque_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now      timestamptz := now();
  v_fired    integer     := 0;
  v_row      record;
  v_messages jsonb[]     := ARRAY[]::jsonb[];
  v_queue_ids uuid[]     := ARRAY[]::uuid[];
BEGIN
  FOR v_row IN
    SELECT DISTINCT
      q.id, q.mosque_id, q.mosque_name, q.mosque_osm_id, pt.token
    FROM mosque_notification_queue q
    JOIN mosque_follows mf ON mf.mosque_id = q.mosque_id
    JOIN push_tokens pt    ON pt.user_id   = mf.user_id
    WHERE q.sent = false
      AND q.send_after <= v_now
  LOOP
    v_messages := array_append(v_messages, jsonb_build_object(
      'to',    v_row.token,
      'sound', 'default',
      'title', 'Iqama times updated at ' || v_row.mosque_name,
      'body',  'Tap to see the new schedule.',
      'data',  jsonb_build_object(
                 'type',        'iqama_update',
                 'mosqueId',    v_row.mosque_id,
                 'mosqueOsmId', v_row.mosque_osm_id
               )
    ));

    IF cardinality(v_messages) >= 100 THEN
      PERFORM net.http_post(
        url     := 'https://exp.host/--/api/v2/push/send'::text,
        body    := to_jsonb(v_messages),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
      v_fired    := v_fired + cardinality(v_messages);
      v_messages := ARRAY[]::jsonb[];
    END IF;
  END LOOP;

  IF cardinality(v_messages) > 0 THEN
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send'::text,
      body    := to_jsonb(v_messages),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
    v_fired := v_fired + cardinality(v_messages);
  END IF;

  -- Mark all due rows sent regardless of follower count — a mosque with zero
  -- followers still had its change "delivered" (to nobody), and must not be
  -- retried every cron tick forever.
  UPDATE mosque_notification_queue
  SET sent = true
  WHERE sent = false AND send_after <= v_now;

  RETURN jsonb_build_object('fired', v_fired);
END;
$$;

REVOKE ALL ON FUNCTION public.send_queued_mosque_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_queued_mosque_notifications() TO service_role;

-- ── pg_cron: every 15 minutes ────────────────────────────────────────────
SELECT cron.unschedule('send-queued-mosque-notifications')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-queued-mosque-notifications');

SELECT cron.schedule(
  'send-queued-mosque-notifications',
  '*/15 * * * *',
  $$ SELECT public.send_queued_mosque_notifications(); $$
);
