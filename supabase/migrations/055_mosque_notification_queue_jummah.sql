-- 055_mosque_notification_queue_jummah.sql
-- Extends mosque_notification_queue with optional custom notification text so
-- the same queue/delivery pipeline can serve both "iqama times updated" and
-- "jummah schedule updated" messages without a second table.
--
-- Existing rows (notif_title / notif_body NULL) keep their current behaviour:
-- send_queued_mosque_notifications() falls back to the iqama-change wording.

ALTER TABLE public.mosque_notification_queue
  ADD COLUMN IF NOT EXISTS notif_title text,
  ADD COLUMN IF NOT EXISTS notif_body  text;

-- ── Updated delivery function ────────────────────────────────────────────────
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
      q.id, q.mosque_id, q.mosque_name, q.mosque_osm_id,
      q.notif_title, q.notif_body,
      pt.token
    FROM mosque_notification_queue q
    JOIN mosque_follows mf ON mf.mosque_id = q.mosque_id
    JOIN push_tokens pt    ON pt.user_id   = mf.user_id
    WHERE q.sent = false
      AND q.send_after <= v_now
  LOOP
    v_messages := array_append(v_messages, jsonb_build_object(
      'to',    v_row.token,
      'sound', 'default',
      'title', COALESCE(v_row.notif_title, 'Iqama times updated at ' || v_row.mosque_name),
      'body',  COALESCE(v_row.notif_body,  'Tap to see the new schedule.'),
      'data',  jsonb_build_object(
                 'type',        CASE WHEN v_row.notif_title IS NOT NULL THEN 'jummah_update' ELSE 'iqama_update' END,
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

  UPDATE mosque_notification_queue
  SET sent = true
  WHERE sent = false AND send_after <= v_now;

  RETURN jsonb_build_object('fired', v_fired);
END;
$$;

REVOKE ALL ON FUNCTION public.send_queued_mosque_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_queued_mosque_notifications() TO service_role;
