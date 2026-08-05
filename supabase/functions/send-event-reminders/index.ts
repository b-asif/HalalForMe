import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Expo push API accepts up to 100 messages per request
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE    = 100;

Deno.serve(async (req) => {
  // Allow cron (GET) and manual trigger (POST)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Require the shared cron secret — same pattern as weekly-digest.
  // Set CRON_SECRET in Supabase Edge Function secrets and configure the
  // Supabase scheduler to send: Authorization: Bearer <CRON_SECRET>
  const secret     = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now    = new Date();
  const cutoff = new Date(now.getTime() - 10 * 60 * 1000); // 10-minute lookback window

  // ── Find due reminders ────────────────────────────────────────────────────────
  // The 10-minute lower bound (remind_at >= cutoff) prevents re-sending if the
  // cron fires slightly late and then again before `sent` is committed.
  const { data: reminders, error: fetchError } = await supabase
    .from('event_reminders')
    .select(`
      id,
      user_id,
      lead_minutes,
      post_id,
      mosque_posts!inner (
        title,
        mosque_id,
        mosques!inner ( name )
      )
    `)
    .lte('remind_at', now.toISOString())
    .gte('remind_at', cutoff.toISOString())
    .eq('sent', false);

  if (fetchError) {
    console.error('send-event-reminders: fetch failed:', fetchError.message);
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  if (!reminders || reminders.length === 0) {
    return new Response(JSON.stringify({ fired: 0 }), { status: 200 });
  }

  // ── Fetch push tokens for affected users ──────────────────────────────────────
  const userIds = [...new Set(reminders.map((r: any) => r.user_id))];

  const { data: tokenRows } = await supabase
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', userIds);

  // Build a map: user_id → token[]
  const tokensByUser = new Map<string, string[]>();
  for (const row of (tokenRows ?? []) as any[]) {
    const list = tokensByUser.get(row.user_id) ?? [];
    list.push(row.token);
    tokensByUser.set(row.user_id, list);
  }

  // ── Build messages, batched ───────────────────────────────────────────────────
  let totalFired = 0;

  const reminderGroups: { ids: string[]; messages: object[] }[] = [];
  let currentGroup: { ids: string[]; messages: object[] } = { ids: [], messages: [] };

  for (const reminder of reminders as any[]) {
    const tokens = tokensByUser.get(reminder.user_id);
    if (!tokens || tokens.length === 0) continue;

    const eventTitle  = reminder.mosque_posts?.title ?? 'an event';
    const mosqueName  = reminder.mosque_posts?.mosques?.name ?? 'Your mosque';
    const leadLabel   = reminder.lead_minutes === 60 ? '1 hour' : 'tomorrow';

    for (const token of tokens) {
      currentGroup.ids.push(reminder.id);
      currentGroup.messages.push({
        to:    token,
        sound: 'default',
        title: `Reminder: ${eventTitle}`,
        body:  `${mosqueName} starts in ${leadLabel} — don't miss it.`,
        data:  { type: 'event_reminder', postId: reminder.post_id },
      });

      if (currentGroup.messages.length >= BATCH_SIZE) {
        reminderGroups.push(currentGroup);
        currentGroup = { ids: [], messages: [] };
      }
    }
  }
  if (currentGroup.messages.length > 0) {
    reminderGroups.push(currentGroup);
  }

  // ── Send each batch, then mark sent ──────────────────────────────────────────
  for (const group of reminderGroups) {
    const pushRes = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(group.messages),
    });

    if (!pushRes.ok) {
      const body = await pushRes.text().catch(() => '(unreadable)');
      console.error(`send-event-reminders: Expo push API returned ${pushRes.status}:`, body);
      // Continue to next batch — partial delivery is better than none
      continue;
    }

    // Mark as sent only after a successful Expo response to avoid losing
    // reminders on transient failures. Duplicate sends within the same 10-minute
    // window are mitigated by the remind_at lower bound above.
    const sentIds = [...new Set(group.ids)]; // deduplicate per-token duplicates
    const { error: updateError } = await supabase
      .from('event_reminders')
      .update({ sent: true })
      .in('id', sentIds);

    if (updateError) {
      console.error('send-event-reminders: failed to mark sent:', updateError.message);
    }

    totalFired += group.messages.length;
  }

  return new Response(JSON.stringify({ fired: totalFired }), { status: 200 });
});
