import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  console.log('[notify-mosque-followers] invoked', req.method);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Missing Authorization header', { status: 401 });
  }

  // Authenticate the caller
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { mosqueId, mosqueName } = await req.json();

  if (!mosqueId) {
    return new Response('Missing mosqueId', { status: 400 });
  }

  // Verify the caller owns this mosque (or is an admin)
  const { data: mosque } = await supabase
    .from('mosques')
    .select('owner_id, name, osm_id')
    .eq('id', mosqueId)
    .maybeSingle();

  if (!mosque) {
    return new Response('Mosque not found', { status: 404 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  const isOwner = mosque.owner_id === user.id;
  const isAdmin = profile?.is_admin === true;

  if (!isOwner && !isAdmin) {
    return new Response('Forbidden — not the mosque owner', { status: 403 });
  }

  const displayName = mosqueName ?? mosque.name ?? 'A mosque you follow';

  // Find all followers
  const { data: follows } = await supabase
    .from('mosque_follows')
    .select('user_id')
    .eq('mosque_id', mosqueId);

  if (!follows || follows.length === 0) {
    console.log('[notify-mosque-followers] no followers for', mosqueId);
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const followerIds = follows.map((f: any) => f.user_id);

  // Look up push tokens for all followers
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', followerIds);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const messages = tokens.map((t: any) => ({
    to: t.token,
    sound: 'default',
    title: `Iqama times updated at ${displayName}`,
    body: 'Tap to see the new schedule.',
    data: { type: 'iqama_update', mosqueId, mosqueOsmId: mosque.osm_id },
  }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const result = await response.json();
    console.error('[notify-mosque-followers] expo push error', response.status, JSON.stringify(result));
  }

  console.log('[notify-mosque-followers] sent', messages.length, 'to followers of', mosqueId);
  return new Response(JSON.stringify({ sent: messages.length }), { status: 200 });
});
