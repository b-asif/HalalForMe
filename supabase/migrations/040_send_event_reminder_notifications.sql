-- 040_send_event_reminder_notifications.sql
-- Creates a SQL function that sends due event reminder push notifications
-- via pg_net directly to the Expo Push API (https://exp.host/--/api/v2/push/send).
--
-- This replaces the previous approach of calling the send-event-reminders edge
-- function via pg_cron + net.http_post, which failed because Supabase blocks
-- pg_net from making self-referential calls to /functions/v1/* on the same project.
-- Calling the external Expo Push API has no such restriction.
--
-- Prerequisites: pg_net extension must be enabled (Database → Extensions → pg_net).
--
-- The cron job at the bottom replaces the HTTP-based job from migration 039.

-- ── SQL function ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_event_reminder_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now      timestamptz := now();
  v_cutoff   timestamptz := now() - interval '10 minutes';
  v_fired    integer     := 0;
  v_reminder record;
  v_messages jsonb[]     := ARRAY[]::jsonb[];
  v_ids      uuid[]      := ARRAY[]::uuid[];
BEGIN
  -- Collect due reminders joined with their push tokens.
  -- The 10-minute lower bound (remind_at >= v_cutoff) prevents re-sending if
  -- the cron fires slightly late and then again in the same window.
  FOR v_reminder IN
    SELECT
      er.id,
      er.lead_minutes,
      er.post_id,
      mp.title AS event_title,
      m.name   AS mosque_name,
      pt.token
    FROM event_reminders er
    JOIN mosque_posts mp ON mp.id      = er.post_id
    JOIN mosques m       ON m.id       = mp.mosque_id
    JOIN push_tokens pt  ON pt.user_id = er.user_id
    WHERE er.sent       = false
      AND er.remind_at <= v_now
      AND er.remind_at >= v_cutoff
  LOOP
    v_messages := array_append(v_messages, jsonb_build_object(
      'to',    v_reminder.token,
      'sound', 'default',
      'title', 'Reminder: ' || v_reminder.event_title,
      'body',  v_reminder.mosque_name || ' starts in ' ||
               CASE WHEN v_reminder.lead_minutes = 60 THEN '1 hour' ELSE 'tomorrow' END ||
               ' — don''t miss it.',
      'data',  jsonb_build_object(
                 'type',   'event_reminder',
                 'postId', v_reminder.post_id
               )
    ));
    v_ids := array_append(v_ids, v_reminder.id);

    -- Flush at 100 messages (Expo's per-request batch limit).
    IF cardinality(v_messages) >= 100 THEN
      PERFORM net.http_post(
        url     := 'https://exp.host/--/api/v2/push/send'::text,
        body    := to_jsonb(v_messages),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
      -- Mark sent optimistically; pg_net delivers asynchronously.
      -- The 10-minute window prevents duplicate sends on transient failures.
      UPDATE event_reminders SET sent = true WHERE id = ANY(v_ids);
      v_fired    := v_fired + cardinality(v_messages);
      v_messages := ARRAY[]::jsonb[];
      v_ids      := ARRAY[]::uuid[];
    END IF;
  END LOOP;

  -- Flush any remaining messages.
  IF cardinality(v_messages) > 0 THEN
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send'::text,
      body    := to_jsonb(v_messages),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
    UPDATE event_reminders SET sent = true WHERE id = ANY(v_ids);
    v_fired := v_fired + cardinality(v_messages);
  END IF;

  RETURN jsonb_build_object('fired', v_fired);
END;
$$;

-- Only service_role (pg_cron runs as superuser which can execute any function)
-- should call this directly.
REVOKE ALL ON FUNCTION public.send_event_reminder_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_event_reminder_notifications() TO service_role;

-- ── Replace pg_cron job ────────────────────────────────────────────────────────
-- Drop the old HTTP-based job from migration 039 and replace it with a direct
-- SQL call — no HTTP round-trip, no auth header, no self-referential restriction.

SELECT cron.unschedule('send-event-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-event-reminders');

SELECT cron.schedule(
  'send-event-reminders',
  '*/5 * * * *',
  $$ SELECT public.send_event_reminder_notifications(); $$
);
