import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  console.log('[notify-user] invoked', req.method);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Every caller of this function (claim approve/reject, submission
  // approve/reject, review approve/reject) is an admin action — reject
  // anyone who isn't a signed-in admin before this runs with the
  // service-role client. Without this, any UUID could be sent an
  // arbitrary push under this app's name.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    console.log('[notify-user] missing Authorization header');
    return new Response('Missing Authorization header', { status: 401 });
  }

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) {
    console.log('[notify-user] auth failed', authError?.message);
    return new Response('Unauthorized', { status: 401 });
  }
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!callerProfile?.is_admin) {
    return new Response('Admin access required', { status: 403 });
  }

  const { userId, title, body } = await req.json();

  if (!userId || !title || !body) {
    return new Response('Missing userId, title, or body', { status: 400 });
  }

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const messages = tokens.map((t: any) => ({
    to: t.token,
    sound: 'default',
    title,
    body,
    data: { type: 'submission_update' },
  }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const result = await response.json();
    console.error('[notify-user] expo push error', response.status, JSON.stringify(result));
  }
  return new Response(JSON.stringify({ sent: messages.length }), { status: 200 });
});
