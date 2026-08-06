import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Service client ────────────────────────────────────────────────────────────
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const CRON_SECRET           = Deno.env.get('CRON_SECRET')!;
const PARSE_FUNCTION_URL    = `${SUPABASE_URL}/functions/v1/parse-mosque-website`;

// Rate-limit: pause between mosque syncs to avoid hammering external sites
const DELAY_BETWEEN_MS = 2_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Auth: only accept calls from pg_cron (service role) or admins ─────────────
async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') ?? '';

  // pg_cron / scheduler calls carry the CRON_SECRET
  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) return true;

  // GitHub Actions / external schedulers call with the service role key.
  // The gateway already verified the JWT — just decode the payload and check
  // the role claim rather than comparing raw key strings.
  try {
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload?.role === 'service_role') return true;
  } catch { /* not a JWT or malformed — fall through */ }

  // Also allow admin users who explicitly trigger a batch sync from the UI
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anon) return false;
  const callerClient = createClient(SUPABASE_URL, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  return profile?.is_admin === true;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  console.log('[mosque-website-batch-sync] invoked', req.method);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!await isAuthorized(req)) {
    console.log('[mosque-website-batch-sync] unauthorized');
    return new Response('Unauthorized', { status: 401 });
  }

  // ── Parse scope from request body ─────────────────────────────────────────
  // 'times' — prayer/jummah only (default; fast and cheap)
  // 'events' — events only
  // 'all'    — full sync
  let scope = 'times';
  try {
    const body = await req.json().catch(() => ({}));
    if (body.scope === 'events' || body.scope === 'all') scope = body.scope;
  } catch { /* body may be empty */ }
  console.log('[mosque-website-batch-sync] scope:', scope);

  // ── Fetch all mosques that have a website URL ─────────────────────────────
  const { data: mosques, error } = await supabase
    .from('mosques')
    .select('id, name, website')
    .not('website', 'is', null)
    .order('name');

  if (error) {
    console.error('[mosque-website-batch-sync] DB error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log('[mosque-website-batch-sync] found', mosques?.length ?? 0, 'mosques with websites');

  const summary = {
    total: mosques?.length ?? 0,
    cached: 0,
    parsed: 0,
    llmFallback: 0,
    failed: 0,
    errors: [] as { mosqueId: string; name: string; error: string }[],
  };

  // ── Process each mosque ───────────────────────────────────────────────────
  for (const mosque of (mosques ?? [])) {
    if (!mosque.website) continue;

    console.log(`[mosque-website-batch-sync] syncing: ${mosque.name} (${mosque.id})`);

    try {
      const res = await fetch(PARSE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // CRON_SECRET signals to the parse function that this is a trusted internal call
          'Authorization': `Bearer ${CRON_SECRET}`,
          // Signal to parse function that this is an internal batch call
          'X-Batch-Sync': 'true',
        },
        body: JSON.stringify({ url: mosque.website, mosqueId: mosque.id, scope }),
        signal: AbortSignal.timeout(90_000), // generous timeout for slow sites
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const method: string = data._extractionMethod ?? 'deterministic';

      if (method === 'cached') {
        summary.cached++;
        console.log(`[mosque-website-batch-sync] ${mosque.name}: cached (no change)`);
      } else if (method === 'llm_fallback') {
        summary.llmFallback++;
        console.log(`[mosque-website-batch-sync] ${mosque.name}: parsed via LLM fallback`);
      } else {
        summary.parsed++;
        console.log(`[mosque-website-batch-sync] ${mosque.name}: parsed deterministically`);
      }
    } catch (e: any) {
      summary.failed++;
      summary.errors.push({ mosqueId: mosque.id, name: mosque.name, error: e.message });
      console.log(`[mosque-website-batch-sync] ${mosque.name} FAILED:`, e.message);
    }

    // Polite delay between requests to avoid hammering external mosque websites
    await sleep(DELAY_BETWEEN_MS);
  }

  console.log('[mosque-website-batch-sync] complete:', JSON.stringify(summary));

  // ── Clean up past events ──────────────────────────────────────────────────
  // Deletes mosque_posts rows where type='event' and the event ended over a
  // day ago. event_reminders are removed automatically via ON DELETE CASCADE.
  try {
    const { data: deletedCount } = await supabase.rpc('cleanup_past_mosque_events');
    console.log('[mosque-website-batch-sync] cleaned up', deletedCount, 'past event(s)');
    summary.cleanedUpEvents = deletedCount ?? 0;
  } catch (e: any) {
    console.log('[mosque-website-batch-sync] event cleanup failed (non-fatal):', e.message);
  }

  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  });
});
