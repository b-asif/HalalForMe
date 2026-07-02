import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await req.json();

  // ── Normalise payload (support old + new format) ──────────
  let type: string   = payload.type ?? 'general';
  let title: string  = payload.title ?? '';
  let body: string   = payload.body  ?? '';
  let link_type: string | null = payload.link_type ?? null;
  let link_id: string | null   = payload.link_id   ?? null;

  // Backward compat: old submit-restaurant format
  if (!title && payload.restaurantName) {
    type  = 'submission';
    title = 'New Restaurant Submission';
    body  = `"${payload.restaurantName}" was submitted for review.`;
    link_type = 'submission';
  }

  if (!title) {
    return new Response('Missing title', { status: 400 });
  }

  // ── 1. Log to admin_notifications table ───────────────────
  await supabase.from('admin_notifications').insert({
    type,
    title,
    body,
    link_type,
    link_id,
  });

  // ── 2. Send push to all admins ────────────────────────────
  const { data: adminProfiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true);

  if (!adminProfiles || adminProfiles.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const adminIds = adminProfiles.map((p: any) => p.id);

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', adminIds);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const messages = tokens.map((t: any) => ({
    to: t.token,
    sound: 'default',
    title,
    body,
    data: { type, link_type, link_id },
  }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  const result = await response.json();
  return new Response(JSON.stringify({ sent: messages.length, result }), { status: 200 });
});
