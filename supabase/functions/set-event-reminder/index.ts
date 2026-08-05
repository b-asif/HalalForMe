import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const UUID_RE           = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_LEAD_MINS = new Set([60, 1440]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Require a signed-in user — guests cannot set reminders.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Missing Authorization header', { status: 401 });
  }

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ── Validate input ────────────────────────────────────────────────────────────
  let payload: { postId?: unknown; leadMinutes?: unknown; action?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { postId, leadMinutes, action } = payload;

  if (typeof postId !== 'string' || !UUID_RE.test(postId)) {
    return new Response('Invalid postId', { status: 400 });
  }
  if (typeof leadMinutes !== 'number' || !ALLOWED_LEAD_MINS.has(leadMinutes)) {
    return new Response('leadMinutes must be 60 or 1440', { status: 400 });
  }

  // ── Delete path ───────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const { error } = await supabase
      .from('event_reminders')
      .delete()
      .eq('user_id', user.id)
      .eq('post_id', postId)
      .eq('lead_minutes', leadMinutes)
      .eq('sent', false);  // never delete already-sent rows

    if (error) {
      console.error('set-event-reminder: delete failed:', error.message);
      return new Response(JSON.stringify({ error: 'Delete failed' }), { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // ── Set / upsert path ─────────────────────────────────────────────────────────
  // Look up event_start from the DB — never trust caller-supplied dates.
  const { data: post, error: postError } = await supabase
    .from('mosque_posts')
    .select('event_start')
    .eq('id', postId)
    .eq('type', 'event')
    .maybeSingle();

  if (postError || !post) {
    return new Response('Event not found', { status: 404 });
  }

  const eventStart = new Date(post.event_start as string);
  if (isNaN(eventStart.getTime()) || eventStart <= new Date()) {
    return new Response('Event has already started', { status: 422 });
  }

  const remindAt = new Date(eventStart.getTime() - leadMinutes * 60 * 1000);
  if (remindAt <= new Date()) {
    return new Response('Reminder time has already passed', { status: 422 });
  }

  const { error: upsertError } = await supabase
    .from('event_reminders')
    .upsert(
      {
        user_id:      user.id,
        post_id:      postId,
        lead_minutes: leadMinutes,
        remind_at:    remindAt.toISOString(),
        sent:         false,
      },
      { onConflict: 'user_id,post_id,lead_minutes' },
    );

  if (upsertError) {
    console.error('set-event-reminder: upsert failed:', upsertError.message);
    return new Response(JSON.stringify({ error: 'Could not save reminder' }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ ok: true, remindAt: remindAt.toISOString() }),
    { status: 200 },
  );
});
