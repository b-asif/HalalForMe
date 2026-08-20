/**
 * notify-campus-followers
 *
 * Sends push notifications to followers of a university who have the
 * relevant notification category enabled.
 *
 * Payload:
 *   msaId       string   — the MSA whose followers to notify
 *   category    string   — 'jummah' | 'prayer' | 'events' | 'announcements'
 *   title       string   — push notification title
 *   body        string   — push notification body
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_CATEGORIES = ['jummah', 'prayer', 'events', 'announcements', 'dining'] as const;
type Category = typeof VALID_CATEGORIES[number];

Deno.serve(async (req) => {
  console.log('[notify-campus-followers] invoked', req.method);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Missing Authorization header', { status: 401, headers: CORS_HEADERS });
  }

  // Verify the caller is authenticated
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await callerClient.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  const body = await req.json().catch(() => null);
  if (!body?.msaId || !body?.category || !body?.title || !body?.body) {
    return new Response('Missing required fields: msaId, category, title, body', { status: 400, headers: CORS_HEADERS });
  }

  const { msaId, category, title: pushTitle, body: pushBody } = body as {
    msaId: string;
    category: Category;
    title: string;
    body: string;
  };

  if (!VALID_CATEGORIES.includes(category)) {
    return new Response(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, { status: 400, headers: CORS_HEADERS });
  }

  if (typeof pushTitle !== 'string' || pushTitle.trim().length === 0 || pushTitle.length > 100) {
    return new Response('title must be a non-empty string under 100 characters', { status: 400, headers: CORS_HEADERS });
  }
  if (typeof pushBody !== 'string' || pushBody.trim().length === 0 || pushBody.length > 500) {
    return new Response('body must be a non-empty string under 500 characters', { status: 400, headers: CORS_HEADERS });
  }

  // Verify caller is an active MSA member OR a global admin
  const { data: membership } = await supabase
    .from('msa_members')
    .select('role, status')
    .eq('user_id', user.id)
    .eq('msa_id', msaId)
    .eq('status', 'active')
    .maybeSingle();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if ((!membership || membership.role !== 'admin') && profile?.is_admin !== true) {
    return new Response('Forbidden — MSA admin role required', { status: 403, headers: CORS_HEADERS });
  }

  // Get the university_id for this MSA
  const { data: msa } = await supabase
    .from('msas')
    .select('university_id, name, universities(slug)')
    .eq('id', msaId)
    .maybeSingle();

  if (!msa) {
    return new Response('MSA not found', { status: 404, headers: CORS_HEADERS });
  }

  const { university_id: universityId } = msa;
  const universitySlug = (msa as any).universities?.slug ?? null;

  // Step 1: get all followers of this university.
  const { data: followRows, error: followsError } = await supabase
    .from('campus_follows')
    .select('user_id')
    .eq('university_id', universityId);

  if (followsError) {
    console.error('[notify-campus-followers] follows query error', followsError);
    return new Response('Internal error fetching followers', { status: 500, headers: CORS_HEADERS });
  }

  if (!followRows || followRows.length === 0) {
    console.log('[notify-campus-followers] no followers for university', universityId);
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const allFollowerIds = followRows.map((r: any) => r.user_id);

  // Step 2: filter to those who have this category enabled in their preferences.
  // campus_notification_preferences has no FK to campus_follows so we can't
  // do a PostgREST join — query separately and intersect.
  const { data: prefRows, error: prefError } = await supabase
    .from('campus_notification_preferences')
    .select('user_id')
    .eq('university_id', universityId)
    .eq('category', category)
    .eq('enabled', true)
    .in('user_id', allFollowerIds);

  if (prefError) {
    console.error('[notify-campus-followers] prefs query error', prefError);
    return new Response('Internal error fetching preferences', { status: 500, headers: CORS_HEADERS });
  }

  if (!prefRows || prefRows.length === 0) {
    console.log('[notify-campus-followers] no opted-in followers for', msaId, category);
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const followerIds = prefRows.map((r: any) => r.user_id);
  console.log(`[notify-campus-followers] ${followerIds.length} opted-in followers for category=${category}`);

  // Fetch push tokens for all opted-in followers
  const { data: tokenRows, error: tokenError } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', followerIds);

  if (tokenError) {
    console.error('[notify-campus-followers] token query error', tokenError);
    return new Response('Internal error fetching tokens', { status: 500, headers: CORS_HEADERS });
  }

  if (!tokenRows || tokenRows.length === 0) {
    console.log('[notify-campus-followers] no push tokens found for followers');
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const tokens = tokenRows.map((r: any) => r.token);

  // Build messages
  const messages = tokens.map((token: string) => ({
    to: token,
    sound: 'default',
    title: pushTitle,
    body: pushBody,
    data: {
      type: 'campus_notification',
      category,
      msaId,
      universityId,
      slug: universitySlug,
    },
  }));

  // Send to Expo Push API in batches of 100
  let totalSent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const result = await res.json();
      console.error('[notify-campus-followers] expo push error', res.status, JSON.stringify(result));
    } else {
      totalSent += batch.length;
    }
  }

  console.log(`[notify-campus-followers] sent ${totalSent} notifications for msaId=${msaId} category=${category}`);

  return new Response(JSON.stringify({ sent: totalSent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
