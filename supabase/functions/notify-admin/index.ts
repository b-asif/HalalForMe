import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const UUID_RE      = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = ['submission', 'claim', 'mosque_claimed'] as const;
type NotifType = typeof ALLOWED_TYPES[number];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Require a valid signed-in user — anonymous callers cannot notify admins.
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

  // ── Validate caller-supplied input ────────────────────────────────────────────
  // Only accept `type` and `link_id` from the caller. title/body/link_type are
  // reconstructed server-side so callers cannot inject arbitrary notification content.
  let payload: { type?: unknown; link_id?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const type = payload.type;
  if (!ALLOWED_TYPES.includes(type as NotifType)) {
    return new Response('Invalid type', { status: 400 });
  }

  const link_id = payload.link_id;
  if (typeof link_id !== 'string' || !UUID_RE.test(link_id)) {
    return new Response('Invalid link_id', { status: 400 });
  }

  // ── Verify ownership, then reconstruct title/body from the DB ─────────────────
  // This also ensures the link_id actually belongs to the calling user, so a
  // caller cannot reference someone else's submission or claim.
  let title: string;
  let body: string;
  const link_type: NotifType = type as NotifType;

  if (type === 'submission') {
    const { data: row } = await supabase
      .from('submissions')
      .select('name')
      .eq('id', link_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!row) {
      return new Response('Not found', { status: 403 });
    }

    title = 'New Restaurant Submission';
    body  = `"${row.name}" was submitted for review.`;

  } else if (type === 'claim') {
    const { data: row } = await supabase
      .from('restaurant_claims')
      .select('contact_name, role, restaurants(name)')
      .eq('id', link_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!row) {
      return new Response('Not found', { status: 403 });
    }

    const restaurantName = (row.restaurants as any)?.name ?? 'a restaurant';
    title = 'New Ownership Claim';
    body  = `${row.contact_name} (${row.role}) claims ${restaurantName}.`;

  } else {
    // type === 'mosque_claimed'
    // owner_id is set to auth.uid() by redeem_mosque_invite, so this query
    // acts as both a lookup and an ownership check in one.
    const { data: row } = await supabase
      .from('mosques')
      .select('name')
      .eq('id', link_id)
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!row) {
      return new Response('Not found', { status: 403 });
    }

    title = 'Mosque Page Claimed';
    body  = `${user.email ?? 'A user'} redeemed the invite code for "${row.name}".`;
  }

  // ── 1. Log to admin_notifications ────────────────────────────────────────────
  const { error: insertError } = await supabase.from('admin_notifications').insert({
    type,
    title,
    body,
    link_type,
    link_id,
  });

  if (insertError) {
    console.error('notify-admin: DB insert failed:', insertError.message);
    return new Response(JSON.stringify({ error: 'Notification failed' }), { status: 500 });
  }

  // ── 2. Push to all admins ─────────────────────────────────────────────────────
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

  if (!response.ok) {
    const result = await response.json();
    console.error(`notify-admin: Expo push API returned ${response.status}:`, JSON.stringify(result));
  }

  return new Response(JSON.stringify({ sent: messages.length }), { status: 200 });
});
