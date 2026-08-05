import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  // Allow cron (GET) and manual trigger (POST)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Require a shared secret so this endpoint cannot be triggered by anyone
  // on the public internet. Set CRON_SECRET in Supabase Edge Function secrets,
  // then configure pg_cron / the Supabase scheduler to pass:
  //   Authorization: Bearer <CRON_SECRET>
  const secret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── Query all stats in parallel ───────────────────────────
  const [
    restaurantsRes,
    usersRes,
    submissionsRes,
    claimsRes,
    reviewsRes,
    approvedRes,
  ] = await Promise.all([
    // Total verified restaurants
    supabase.from('restaurants').select('id', { count: 'exact', head: true })
      .eq('is_verified', true),

    // New users this week
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .gte('created_at', since),

    // New restaurant submissions this week (unverified = pending review)
    supabase.from('restaurants').select('id', { count: 'exact', head: true })
      .eq('is_verified', false)
      .gte('created_at', since),

    // New ownership claims this week
    supabase.from('restaurant_claims').select('id', { count: 'exact', head: true })
      .gte('created_at', since),

    // New reviews this week
    supabase.from('reviews').select('id', { count: 'exact', head: true })
      .gte('created_at', since),

    // Restaurants approved this week
    supabase.from('restaurants').select('id', { count: 'exact', head: true })
      .eq('is_verified', true)
      .gte('updated_at', since),
  ]);

  const totalRestaurants = restaurantsRes.count ?? 0;
  const newUsers         = usersRes.count       ?? 0;
  const newSubmissions   = submissionsRes.count  ?? 0;
  const newClaims        = claimsRes.count       ?? 0;
  const newReviews       = reviewsRes.count      ?? 0;
  const approved         = approvedRes.count     ?? 0;

  // ── Build digest message ──────────────────────────────────
  const lines: string[] = [];
  if (newUsers > 0)       lines.push(`👤 ${newUsers} new user${newUsers !== 1 ? 's' : ''}`);
  if (newSubmissions > 0) lines.push(`📋 ${newSubmissions} new submission${newSubmissions !== 1 ? 's' : ''}`);
  if (approved > 0)       lines.push(`✅ ${approved} restaurant${approved !== 1 ? 's' : ''} approved`);
  if (newClaims > 0)      lines.push(`🏪 ${newClaims} ownership claim${newClaims !== 1 ? 's' : ''}`);
  if (newReviews > 0)     lines.push(`⭐ ${newReviews} new review${newReviews !== 1 ? 's' : ''}`);

  const digestBody = lines.length > 0
    ? lines.join(' · ')
    : 'No new activity this week.';

  const digestTitle = `Weekly Digest — ${totalRestaurants} restaurant${totalRestaurants !== 1 ? 's' : ''} total`;

  // ── Log to admin_notifications ────────────────────────────
  const { error: insertError } = await supabase.from('admin_notifications').insert({
    type:  'digest',
    title: digestTitle,
    body:  digestBody,
    link_type: null,
    link_id:   null,
  });

  if (insertError) {
    console.error('weekly-digest: failed to insert admin_notification:', insertError.message);
    return new Response(
      JSON.stringify({ error: 'DB insert failed', detail: insertError.message }),
      { status: 500 },
    );
  }

  // ── Send push to all admins ───────────────────────────────
  const { data: adminProfiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_admin', true);

  if (!adminProfiles || adminProfiles.length === 0) {
    return new Response(JSON.stringify({ sent: 0, digest: digestBody }), { status: 200 });
  }

  const adminIds = adminProfiles.map((p: any) => p.id);
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', adminIds);

  if (tokens && tokens.length > 0) {
    const messages = tokens.map((t: any) => ({
      to: t.token,
      sound: 'default',
      title: digestTitle,
      body:  digestBody,
      data:  { type: 'digest' },
    }));

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!pushRes.ok) {
      const pushBody = await pushRes.text().catch(() => '(unreadable)');
      console.error(`weekly-digest: Expo push API returned ${pushRes.status}:`, pushBody);
    }
  }

  return new Response(
    JSON.stringify({ sent: tokens?.length ?? 0, digest: digestBody }),
    { status: 200 },
  );
});
