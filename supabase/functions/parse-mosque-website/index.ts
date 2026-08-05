import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Service client — privileged reads only, never returned to caller ──────────
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const FETCH_TIMEOUT_MS = 10_000;

// Realistic browser headers — avoids 403s from basic bot detection
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// ── LLM config (read once at startup) ────────────────────────────────────────
const LLM_ENABLED        = Deno.env.get('LLM_FALLBACK_ENABLED') !== 'false';
const LLM_API_KEY        = Deno.env.get('LLM_API_KEY') ?? '';
const LLM_BASE_URL       = Deno.env.get('LLM_BASE_URL') ?? 'https://api.openai.com/v1';
const LLM_MODEL          = Deno.env.get('LLM_MODEL_NAME') ?? 'gpt-4o-mini';
const LLM_IN_COST        = parseFloat(Deno.env.get('LLM_INPUT_COST_PER_1M_TOKENS') ?? '0');
const LLM_OUT_COST       = parseFloat(Deno.env.get('LLM_OUTPUT_COST_PER_1M_TOKENS') ?? '0');
// Vision is only supported when using the Anthropic API (LLM_BASE_URL contains anthropic.com).
// Disable by setting LLM_VISION_ENABLED=false in Edge Function secrets.
const LLM_VISION_ENABLED = Deno.env.get('LLM_VISION_ENABLED') !== 'false';
const MAX_VISION_IMAGES  = 6; // max images to inspect per sync

interface ExtractedEvent {
  title: string;
  body: string | null;
  /** All matching category tags — e.g. ['youth', 'quran'] for a kids Quran class. */
  categories: string[];
  event_start: string | null;
  event_end: string | null;
  /** URL of the individual event page (from JSON-LD item.url), if available. */
  source_url: string | null;
  /** Which parsing tier produced this entry: 'json-ld' | 'ical' | 'google-calendar' | 'website' */
  source: string;
  /**
   * 0–1 confidence in the time fields.
   * 0.9 = timezone explicitly present (TZID or ISO offset/Z)
   * 0.5 = JSON-LD with no timezone (parsed as UTC — may be wrong for local events)
   * 0.4 = ICS floating time (no TZID, no Z — treated as UTC)
   */
  confidence: number;
  /**
   * True when confidence is low (<0.5) or when a duplicate with a conflicting
   * time was found across sources. The owner should verify before publishing.
   */
  needs_review: boolean;
}

interface IqamaTimes {
  fajr: string | null;
  dhuhr: string | null;
  asr: string | null;
  maghrib: string | null;
  isha: string | null;
}

interface SyncResult {
  iqama_times: IqamaTimes | null;
  jummah_sessions: Array<{ time: string; khateeb: string | null; hall: string | null }>;
  events: ExtractedEvent[];
  sources: string[];
  notes: string | null;
  /** IANA timezone detected from iCal X-WR-TIMEZONE or similar. Used to fix JSON-LD bare datetimes. */
  calendarTimezone: string | null;
}

// ── Timezone-aware local→UTC conversion ──────────────────────────────────────
// Converts "2026-07-15T19:00:00" in a given IANA timezone to a UTC ISO string.
// Uses Intl.DateTimeFormat (built into Deno/V8) — no external library needed.
function icsLocalToUTC(isoLocal: string, tzId: string): string {
  try {
    // Treat the local time as UTC to get an approximate Date object
    const approxUTC = new Date(isoLocal + 'Z');

    // Format that UTC instant in the target timezone to see what local time it shows
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzId,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(approxUTC).map(p => [p.type, p.value]));

    // Calculate how far off we are and adjust
    const tzH  = parseInt(parts.hour === '24' ? '0' : parts.hour);
    const tzMi = parseInt(parts.minute);
    const [, wH, wMi] = isoLocal.match(/T(\d{2}):(\d{2})/)!.map(Number);

    let diffMins = (wH * 60 + wMi) - (tzH * 60 + tzMi);
    // Clamp for midnight crossings
    if (diffMins >  720) diffMins -= 1440;
    if (diffMins < -720) diffMins += 1440;

    return new Date(approxUTC.getTime() + diffMins * 60_000).toISOString();
  } catch {
    return isoLocal + 'Z'; // fallback: treat as UTC
  }
}

// ── ICS / iCal parser (no external library) ───────────────────────────────────
// calendarTz: IANA timezone from X-WR-TIMEZONE (calendar-level). Used to convert
// floating DTSTART values (no TZID, no Z) that some plugins (e.g. All-in-One Event
// Calendar / ai1ec) emit — without it those times would be stored as UTC, producing
// a 7-hour error for US Pacific mosques.
function parseICS(icsText: string, source: string = 'ical', calendarTz: string | null = null): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const blocks = icsText.split('BEGIN:VEVENT').slice(1);
  const now = new Date();

  for (const block of blocks) {
    // Unfold continuation lines once per block
    const unfolded = block.replace(/\r?\n[ \t]/g, '');

    const get = (key: string): string | null => {
      const m = unfolded.match(new RegExp(`^${key}[^:\\r\\n]*:([^\\r\\n]+)`, 'm'));
      return m ? m[1].trim().replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';') : null;
    };

    // Returns both the raw datetime value and the TZID param (if present)
    const getDateTime = (key: string): { value: string; tzId: string | null } | null => {
      const m = unfolded.match(new RegExp(`^(${key}(?:;[^:\\r\\n]*)?):(\\S+)`, 'm'));
      if (!m) return null;
      const tzMatch = m[1].match(/TZID=([^;:\s]+)/i);
      return { value: m[2].trim(), tzId: tzMatch ? tzMatch[1] : null };
    };

    const title = get('SUMMARY');
    if (!title) continue;

    const dtStart = getDateTime('DTSTART');

    // Confidence reflects how reliably we can convert the time to UTC:
    //   0.9 = explicit IANA timezone (TZID) → icsLocalToUTC()
    //   0.85 = already UTC (ends with Z)
    //   0.7 = floating time converted via calendar-level X-WR-TIMEZONE
    //   0.4 = floating time (no TZID, no Z, no calendarTz) — treat as UTC which may be wrong
    const confidence: number = dtStart?.tzId
      ? 0.9
      : dtStart?.value?.endsWith('Z')
        ? 0.85
        : calendarTz ? 0.7 : 0.4;

    const parseICSDate = (dt: { value: string; tzId: string | null } | null): string | null => {
      if (!dt) return null;
      const { value: raw, tzId } = dt;
      const isUTC = raw.endsWith('Z');
      const s = raw.replace(/Z$/, '');

      if (!s.includes('T')) {
        // All-day event — no time conversion needed
        return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00Z`;
      }

      const isoLocal = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:00`;

      if (isUTC) return isoLocal + 'Z';

      // Per-event TZID takes priority
      if (tzId) return icsLocalToUTC(isoLocal, tzId);

      // Floating time: use calendar-level X-WR-TIMEZONE if available
      if (calendarTz) {
        try { return icsLocalToUTC(isoLocal, calendarTz); } catch { /* fall through */ }
      }

      // Truly floating — treat as UTC (may be wrong, confidence=0.4 above)
      return isoLocal + 'Z';
    };

    const start = parseICSDate(dtStart);
    if (start && new Date(start) < now) continue;

    const cleanTitle = title.replace(/\\n/g, ' ').trim().slice(0, 80);
    console.log(
      `[parse-mosque-website] ICS event: title="${cleanTitle}"`,
      `raw_start="${dtStart?.value ?? 'null'}"`,
      `tzid="${dtStart?.tzId ?? 'none'}"`,
      `→ event_start="${start}"`,
      `source=${source} confidence=${confidence}`,
    );

    events.push({
      title: cleanTitle,
      body: get('DESCRIPTION') ? stripHtml(get('DESCRIPTION')!.replace(/\\n/g, '\n')).slice(0, 1500) || null : null,
      categories: [],
      event_start: start,
      event_end: parseICSDate(getDateTime('DTEND')),
      source_url: get('URL') ?? null,
      source,
      confidence,
      needs_review: confidence < 0.5,
    });
  }

  return events;
}

// ── 24h "HH:MM" → "H:MM AM/PM" ───────────────────────────────────────────────
function toAmPm(t: string): string | null {
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ── Tier 1: Mawaqit.net API ───────────────────────────────────────────────────
async function tryMawaqit(url: string, result: SyncResult): Promise<void> {
  console.log('[parse-mosque-website] Tier 1: trying Mawaqit');
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
  if (!slug) return;

  const res = await fetch(
    `https://mawaqit.net/api/2.0/mosque/search?q=${encodeURIComponent(slug)}&limit=1`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`Mawaqit API ${res.status}`);
  const data = await res.json();
  const mosque = Array.isArray(data) ? data[0] : data;
  if (!mosque) throw new Error('No mosque found on Mawaqit');

  // times[]: [fajr, sunrise, dhuhr, asr, maghrib, isha] in "HH:MM"
  const times: string[] = mosque.times ?? [];
  result.iqama_times = {
    fajr:    toAmPm(times[0] ?? ''),
    dhuhr:   toAmPm(times[2] ?? ''),
    asr:     toAmPm(times[3] ?? ''),
    maghrib: toAmPm(times[4] ?? ''),
    isha:    toAmPm(times[5] ?? ''),
  };

  // jumuas[]: array of "HH:MM" jummah times
  result.jummah_sessions = (mosque.jumuas ?? [])
    .map((t: string) => ({ time: toAmPm(t) ?? t, khateeb: null, hall: null }))
    .filter((j: { time: string }) => j.time);

  result.sources.push('mawaqit');
  console.log('[parse-mosque-website] Mawaqit: found iqama + jummah');
}

// ── Tier 1b: Masjidal.com widget API ───────────────────────────────────────────
// Masjidal (mymasjidal.com / masjidal.ca) sells "Adhan Clock" prayer-time
// display hardware; mosques manage their schedule in Masjidal's own portal and
// embed a read-only widget (masjidal.com/widget/monthly/?masjid_id=...) on
// their own site via iframe. That widget's table is entirely client-rendered
// from a public, unauthenticated JSON API — calling the API directly is far
// more reliable than fetching+rendering the widget page itself.
function findMasjidalId(urls: string[]): string | null {
  for (const u of urls) {
    try {
      const id = new URL(u).searchParams.get('masjid_id');
      if (id) return id;
    } catch { /* malformed URL, skip */ }
  }
  return null;
}

async function tryMasjidal(masjidId: string, result: SyncResult): Promise<void> {
  console.log('[parse-mosque-website] Tier 1b: trying Masjidal, masjid_id=', masjidId);
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(
    `https://masjidal.com/api/v1/time/range?masjid_id=${encodeURIComponent(masjidId)}&masjid_detail=yes&from_date=${today}&to_date=${today}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`Masjidal API ${res.status}`);
  const data = await res.json();
  const iqama = data?.data?.iqamah?.[0];
  if (!iqama) throw new Error('No iqamah data in Masjidal response');

  result.iqama_times = {
    fajr: normalizeTimeStr(iqama.fajr ?? ''),
    dhuhr: normalizeTimeStr(iqama.zuhr ?? ''),
    asr: normalizeTimeStr(iqama.asr ?? ''),
    maghrib: normalizeTimeStr(iqama.maghrib ?? ''),
    isha: normalizeTimeStr(iqama.isha ?? ''),
  };

  result.jummah_sessions = [iqama.jummah1, iqama.jummah2]
    .filter((t): t is string => Boolean(t))
    .map(t => ({ time: normalizeTimeStr(t) ?? t, khateeb: null, hall: null }))
    .filter(j => j.time);

  result.sources.push('masjidal');
  console.log('[parse-mosque-website] Masjidal: found iqama + jummah');
}

// ── Tier 1d: Masjidi / UmmahSoft prayer widget ────────────────────────────────
// Many mosques embed the Masjidi prayer-time widget via a JS snippet that
// builds an iframe at runtime:
//   var srcURL = "https://ummahsoft.org/salahtime/masjid-embed/prayer_widet.php?masjid_id=XXXXX"
// The raw page HTML has only a <div id="masjidi-iqamadiv"> placeholder — no
// times at all. We detect the script, extract the masjid_id, and call the
// widget URL directly to get today's times without needing JS rendering.
const UMMAHSOFT_ID_RE = /ummahsoft\.org\/salahtime\/masjid-embed\/prayer_widet\.php[^"']*masjid_id=(\d+)/i;

function findMasjidiId(url: string, htmlBlocks: string[]): string | null {
  // Direct link to the widget itself as the mosque's "website"
  const direct = url.match(UMMAHSOFT_ID_RE);
  if (direct) return direct[1];
  // Widget script embedded in page HTML (script tag or JS var)
  for (const html of htmlBlocks) {
    const m = html.match(UMMAHSOFT_ID_RE);
    if (m) return m[1];
  }
  return null;
}

async function tryMasjidi(masjidId: string, result: SyncResult): Promise<void> {
  console.log('[parse-mosque-website] Tier 1d: Masjidi/UmmahSoft, masjid_id=', masjidId);
  const widgetUrl = `https://ummahsoft.org/salahtime/masjid-embed/prayer_widet.php?masjid_id=${masjidId}`;
  const res = await fetch(widgetUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const iqama: Record<string, string | null> = {
    fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null,
  };
  const jummahSessions: Array<{ time: string; khateeb: string | null; hall: string | null }> = [];

  // Table structure: <tr><td>Prayer</td><td>Start</td><td>Iqamah</td></tr>
  // Header uses <th> so it won't be matched by <td>.
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length < 2) continue;

    const prayerRaw = cells[0].toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    // Iqamah is the last <td> (3rd column when present)
    const iqamahTime = normalizeTimeStr(cells[cells.length - 1]);
    if (!iqamahTime) continue;

    if (prayerRaw.startsWith('jum')) {
      jummahSessions.push({ time: iqamahTime, khateeb: null, hall: null });
    } else {
      const key = PRAYER_MAP[prayerRaw] ?? PRAYER_MAP[prayerRaw.replace(/\s+/g, '')];
      if (key) iqama[key] = iqamahTime;
    }
  }

  if (Object.values(iqama).some(Boolean)) {
    result.iqama_times = iqama as IqamaTimes;
    result.sources.push('masjidi');
    console.log('[parse-mosque-website] Masjidi: found iqama times');
  }
  if (jummahSessions.length > 0 && result.jummah_sessions.length === 0) {
    result.jummah_sessions = jummahSessions;
    console.log('[parse-mosque-website] Masjidi:', jummahSessions.length, 'jummah session(s)');
  }
}

// ── Tier 1f: AthanPlus prayer-time widget ─────────────────────────────────────
// AthanPlus (timing.athanplus.com) is a mosque management platform that
// provides embeddable prayer-time widgets. Mosques embed the widget via iframe:
//   https://timing.athanplus.com/masjid/widgets/embed?masjid_id=XXXXXXXX
// On Google Sites and other JS-heavy hosts, the iframe URL doesn't appear in a
// standard <iframe src="..."> tag — it's embedded in JSON config strings with
// Unicode/backslash escapes. We scan the raw HTML text directly (after decoding
// those escapes) so the detection works regardless of host platform.
const ATHANPLUS_ID_RE = /timing\.athanplus\.com\/masjid\/widgets\/embed[^"'\s<>\\]*[?&]masjid_id=([A-Za-z0-9_-]+)/i;

function findAthanPlusId(htmlBlocks: string[]): string | null {
  for (const html of htmlBlocks) {
    // Decode Google Sites JSON encoding before matching
    // (\u0026 → & and \u003d → = are the two that appear in serialised URLs)
    const decoded = html.replace(/\\u0026/gi, '&').replace(/\\u003d/gi, '=');
    const m = decoded.match(ATHANPLUS_ID_RE);
    if (m) return m[1];
  }
  return null;
}

async function tryAthanPlus(masjidId: string, result: SyncResult): Promise<void> {
  console.log('[parse-mosque-website] Tier 1f: AthanPlus, masjid_id=', masjidId);
  // Build a clean widget URL — the widget renders prayer times server-side
  const widgetUrl = `https://timing.athanplus.com/masjid/widgets/embed?masjid_id=${encodeURIComponent(masjidId)}`;
  const res = await fetch(widgetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HalalForMe/1.0)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`AthanPlus widget ${res.status}`);
  const widgetHtml = await res.text();

  // Iqama times — widget renders an Adhan/Iqamah table; standard table parser handles it
  if (!result.iqama_times) {
    const tableResult = extractIqamaFromHtmlTable(widgetHtml);
    if (tableResult) {
      result.iqama_times = tableResult;
      result.sources.push('athanplus');
      console.log('[parse-mosque-website] AthanPlus: HTML table parser found iqama times');
    }
  }

  // Jummah sessions — reuse text heuristics on stripped widget HTML
  if (!result.jummah_sessions.length) {
    const text = stripHtml(widgetHtml);
    const jummah = extractJummahFromText(text);
    if (jummah.length > 0) {
      result.jummah_sessions = jummah;
      if (!result.sources.includes('athanplus')) result.sources.push('athanplus');
      console.log('[parse-mosque-website] AthanPlus:', jummah.length, 'Jummah session(s)');
    }
  }

  if (!result.iqama_times && !result.jummah_sessions.length) {
    throw new Error('AthanPlus widget returned no parseable prayer data');
  }
}

// ── Tier 1c: embedded Google Sheets "publish to web" CSV ───────────────────────
// Some mosques (e.g. ISCN) maintain their iqama schedule in a Google Sheet
// published as CSV and fetched client-side by their widget's own JS — the
// publish URL is plainly visible in that JS, so pulling the CSV directly and
// parsing it sidesteps needing to render the page at all (and any reliance on
// Real-world sheets are messy and
// mosque-specific (blank separator rows, "effective from this date" ranges
// rather than one row per calendar day, relative offsets like "+7 mins"
// instead of a clock time for a prayer some mosques compute rather than
// store) — every step below fails closed to a missing field rather than
// guess, since a wrong iqama time is worse than a missing one.
const SHEET_CSV_RE = /https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[\w-]+\/pub\?[^\s'"<>]*output=csv[^\s'"<>]*/i;

function findGoogleSheetCsvUrl(htmlBlocks: string[]): string | null {
  for (const block of htmlBlocks) {
    const m = block.match(SHEET_CSV_RE);
    if (m) return m[0];
  }
  return null;
}

// Minimal CSV line splitter handling quoted fields.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Column-name → prayer key matcher, generic enough for arbitrary mosque
// spreadsheets (header text varies, e.g. "Zuhr Iqama" vs "Dhuhr").
function matchPrayerColumn(header: string): string | null {
  const h = header.toLowerCase();
  if (h.includes('fajr')) return 'fajr';
  if (h.includes('zuhr') || h.includes('dhuhr')) return 'dhuhr';
  if (h.includes('asr')) return 'asr';
  if (h.includes('maghrib')) return 'maghrib';
  if (h.includes('isha')) return 'isha';
  return null;
}

function parseScheduleCsv(csvText: string): {
  iqama: IqamaTimes;
  jummah: Array<{ time: string; khateeb: string | null; hall: string | null }>;
  relativeOffsets: Record<string, number>;  // e.g. { maghrib: 7 } — minutes after adhan
} | null {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const headerCols = splitCsvLine(lines[0]);
  const dateColIdx = headerCols.findIndex(c => /date|day/i.test(c));
  const jummahColIdx = headerCols.findIndex(c => /jum/i.test(c));
  const prayerCols: Record<number, string> = {};
  headerCols.forEach((c, idx) => {
    const key = matchPrayerColumn(c);
    if (key) prayerCols[idx] = key;
  });
  if (Object.keys(prayerCols).length === 0) return null;

  const today = new Date();
  const todayOrdinal = today.getMonth() * 31 + today.getDate();

  let bestRow: string[] | null = null;
  let bestPastDiff = Infinity;   // most recent entry on/before today ("effective from" semantics)
  let fallbackRow: string[] | null = null;
  let fallbackDiff = Infinity;   // nearest entry overall, used only if nothing qualifies as "past"

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const dateCell = cols[dateColIdx !== -1 ? dateColIdx : 0] ?? '';
    const parsed = parseLooseDate(dateCell);
    if (!parsed) continue;

    const diff = todayOrdinal - (parsed.month * 31 + parsed.day);
    if (diff >= 0 && diff < bestPastDiff) { bestPastDiff = diff; bestRow = cols; }
    if (Math.abs(diff) < fallbackDiff) { fallbackDiff = Math.abs(diff); fallbackRow = cols; }
  }

  const row = bestRow ?? fallbackRow;
  if (!row) return null;

  const iqama: Record<string, string | null> = { fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null };
  const relativeOffsets: Record<string, number> = {};
  for (const [idxStr, key] of Object.entries(prayerCols)) {
    const raw = row[Number(idxStr)]?.trim();
    if (!raw) continue;
    // Detect relative offsets: "+7", "+7 mins", "+7 minutes" — common for Maghrib
    const offsetMatch = raw.match(/^\+(\d+)\s*(?:min|mins|minutes|m)?$/i);
    if (offsetMatch) { relativeOffsets[key] = parseInt(offsetMatch[1], 10); continue; }
    const withSuffix = /am|pm/i.test(raw) ? raw : `${raw} ${key === 'fajr' ? 'am' : 'pm'}`;
    const t = normalizeTimeStr(withSuffix);
    if (t) iqama[key] = t;
  }
  if (!Object.values(iqama).some(Boolean) && Object.keys(relativeOffsets).length === 0) return null;

  const jummah: Array<{ time: string; khateeb: string | null; hall: string | null }> = [];
  if (jummahColIdx !== -1) {
    const raw = row[jummahColIdx]?.trim();
    if (raw) {
      // May list multiple sessions separated by "/" (e.g. "12:20/1:30")
      for (const part of raw.split('/')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const withSuffix = /am|pm/i.test(trimmed) ? trimmed : `${trimmed} pm`;
        const t = normalizeTimeStr(withSuffix);
        if (t) jummah.push({ time: t, khateeb: null, hall: null });
      }
    }
  }

  return { iqama: iqama as unknown as IqamaTimes, jummah, relativeOffsets };
}

// Resolve relative prayer offsets (e.g. Maghrib "+7 mins") to clock times.
// Uses AlAdhan free API with the mosque's coordinates to get today's adhan times.
// AlAdhan returns 24h "HH:MM" strings; method=2 (ISNA) works for US mosques.
async function resolveRelativeOffsets(
  offsets: Record<string, number>,
  lat: number,
  lng: number,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000);
  const apiUrl = `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${lat}&longitude=${lng}&method=2`;
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`AlAdhan API ${res.status}`);
  const json = await res.json();
  const timings: Record<string, string> = json?.data?.timings ?? {};

  const result: Record<string, string> = {};
  // AlAdhan key names: Fajr, Dhuhr, Asr, Maghrib, Isha (capital first letter)
  const KEY_MAP: Record<string, string> = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
  for (const [prayer, offsetMins] of Object.entries(offsets)) {
    const baseStr = timings[KEY_MAP[prayer]]; // e.g. "20:38"
    if (!baseStr) continue;
    const [h, m] = baseStr.split(':').map(Number);
    const totalMins = h * 60 + m + offsetMins;
    const newH = Math.floor(totalMins / 60) % 24;
    const newM = totalMins % 60;
    const period = newH >= 12 ? 'PM' : 'AM';
    const displayH = newH === 0 ? 12 : newH > 12 ? newH - 12 : newH;
    result[prayer] = `${displayH}:${String(newM).padStart(2, '0')} ${period}`;
  }
  return result;
}

async function tryGoogleSheetSchedule(
  csvUrl: string,
  result: SyncResult,
  lat?: number | null,
  lng?: number | null,
): Promise<void> {
  console.log('[parse-mosque-website] Tier 1c: trying Google Sheet CSV schedule');
  const res = await fetch(csvUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Sheet CSV fetch ${res.status}`);
  const csvText = await res.text();
  const parsed = parseScheduleCsv(csvText);
  if (!parsed) throw new Error('Sheet CSV had no recognizable prayer schedule');

  result.iqama_times = parsed.iqama;

  // Resolve any relative offsets (e.g. Maghrib "+7 mins") using AlAdhan API
  if (Object.keys(parsed.relativeOffsets).length > 0) {
    if (lat && lng) {
      try {
        const resolved = await resolveRelativeOffsets(parsed.relativeOffsets, lat, lng);
        for (const [prayer, time] of Object.entries(resolved)) {
          (result.iqama_times as any)[prayer] = time;
          console.log(`[parse-mosque-website] Resolved relative offset: ${prayer} = ${time}`);
        }
      } catch (e: any) {
        console.log('[parse-mosque-website] AlAdhan offset resolution failed:', e.message);
      }
    } else {
      console.log('[parse-mosque-website] Relative offsets found but no coordinates available:', parsed.relativeOffsets);
    }
  }

  if (parsed.jummah.length > 0) result.jummah_sessions = parsed.jummah;
  result.sources.push('google-sheet');
  console.log(
    '[parse-mosque-website] Google Sheet CSV: found iqama',
    JSON.stringify(result.iqama_times),
    parsed.jummah.length ? `+ ${parsed.jummah.length} jummah session(s)` : '(no jummah column)',
  );
}

// ── Strip HTML tags and decode common entities ────────────────────────────────
// Script/style *contents* are dropped, not just their tags — a page's embedded
// JS can easily contain prayer-name keywords next to unrelated time-shaped
// strings (e.g. a hardcoded fallback schedule array), which the iqama/jummah
// text heuristics below would otherwise misread as real page content.
function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')          // remove tags
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    // Numeric entities for typographic punctuation — common in WordPress/Events Calendar titles
    .replace(/&#8211;/g, '-')          // en-dash
    .replace(/&#8212;/g, '--')         // em-dash
    .replace(/&#8216;/g, "'")          // left single quote
    .replace(/&#8217;/g, "'")          // right single quote / apostrophe
    .replace(/&#8220;/g, '"')          // left double quote
    .replace(/&#8221;/g, '"')          // right double quote
    .replace(/&#8230;/g, '...')        // ellipsis
    // Unicode equivalents (sometimes already decoded by the JSON parser)
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes
    .replace(/[\u201C\u201D]/g, '"')   // curly double quotes
    .replace(/\u2013/g, '-')           // en-dash
    .replace(/\u2014/g, '--')          // em-dash
    .replace(/\u2026/g, '...')         // ellipsis
    .replace(/\\n/g, ' ')              // literal \n escape sequences in JSON-LD
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Iframe discovery ───────────────────────────────────────────────────────────
// Many mosque sites embed their prayer-time widget as a same-origin iframe
// pointing at a separately-uploaded static file (a common WordPress pattern)
// rather than rendering the table directly on the page — the top-level HTML
// fetch never sees that content, so it has to be discovered and fetched
// separately for every other tier to have a chance at it.
const IFRAME_IGNORE_RE = /(youtube\.com|youtube-nocookie\.com|google\.com\/maps|maps\.google|facebook\.com|instagram\.com|twitter\.com|x\.com|recaptcha|doubleclick\.net|googletagmanager\.com|googleads|spotify\.com|soundcloud\.com|google\.com\/forms)/i;

function findIframeUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith('javascript:') || raw.startsWith('about:') || raw.startsWith('data:')) continue;
    try {
      const resolved = new URL(raw, baseUrl).toString();
      if (IFRAME_IGNORE_RE.test(resolved)) continue;
      urls.add(resolved);
    } catch { /* malformed src, skip */ }
  }
  return [...urls].slice(0, 3); // bound how many we follow
}

// ── Timezone extraction from page HTML ───────────────────────────────────────
// Extracts IANA timezone strings embedded in page JavaScript — covers:
//  • "The Events Calendar" (tribe) plugin: tribe_js_config, tribe_l10n_datatables
//  • JSON-LD EventSchedule: "scheduleTimezone"
//  • Any WordPress wp_localize_script output that includes a "timezone" key
// Used as fallback when no ICS X-WR-TIMEZONE is available, so JSON-LD bare
// local datetimes (no UTC offset) are converted correctly instead of stored as UTC.
function extractTimezoneFromHtml(html: string): string | null {
  // Match "timezone":"America\/Los_Angeles" or "scheduleTimezone":"America/Los_Angeles"
  // The regex handles both escaped (America\/Los_Angeles) and unescaped slashes.
  const re = /"(?:schedule[Tt]imezone|eventTimezone|timezone)"\s*:\s*"([A-Za-z_]+(?:[\/\\][A-Za-z_]+)+)"/g;
  for (const m of html.matchAll(re)) {
    const tz = m[1].replace(/\\/g, '/');
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      console.log('[parse-mosque-website] timezone extracted from HTML:', tz);
      return tz;
    } catch { /* invalid IANA tz, skip */ }
  }
  return null;
}

// ── WordPress REST API timezone lookup ───────────────────────────────────────
// WordPress exposes GET /wp-json/ publicly (no auth). The root response includes
// "timezone_string" (e.g. "America/Los_Angeles") and "gmt_offset" (-7). This is
// the most direct way to get the IANA timezone for WordPress sites that use Divi
// or other JS-heavy themes that defer inline script output.
async function lookupTimezoneFromWordPressApi(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/wp-json/`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return null;
    const data = await res.json();
    // timezone_string is the IANA name (preferred); gmt_offset is a numeric fallback
    const tzStr: string = data?.timezone_string ?? '';
    if (tzStr) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tzStr });
        console.log('[parse-mosque-website] timezone from WordPress REST API:', tzStr);
        return tzStr;
      } catch { /* invalid tz string */ }
    }
    // Fall back to gmt_offset if timezone_string is empty (WP stores "" when using UTC+N)
    const offset: number | undefined = typeof data?.gmt_offset === 'number' ? data.gmt_offset : undefined;
    if (offset !== undefined && !isNaN(offset)) {
      // Convert numeric offset to Etc/GMT±N — note: Etc/GMT sign is inverted
      const etcTz = `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: etcTz });
        console.log('[parse-mosque-website] timezone from WordPress REST API (gmt_offset):', etcTz);
        return etcTz;
      } catch { /* skip */ }
    }
    return null;
  } catch (err: any) {
    console.log('[parse-mosque-website] WordPress REST API timezone lookup failed:', err?.message ?? err);
    return null;
  }
}

// ── Coordinate-based timezone lookup ─────────────────────────────────────────
// Last-resort fallback when neither the ICS feed nor the page HTML contain a
// timezone string. Uses BigDataCloud's free (no-API-key) reverse-geocode API.
async function lookupTimezoneByCoords(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/timezone-by-coordinates?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) {
      console.log('[parse-mosque-website] BigDataCloud returned', res.status);
      return null;
    }
    const data = await res.json();
    const tz: string = data?.ianaTimeZone ?? '';
    if (!tz) {
      console.log('[parse-mosque-website] BigDataCloud returned no ianaTimeZone, full response:', JSON.stringify(data).slice(0, 200));
      return null;
    }
    // Validate before using
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    console.log('[parse-mosque-website] timezone from coordinates:', tz);
    return tz;
  } catch (err: any) {
    console.log('[parse-mosque-website] coordinate lookup failed:', err?.message ?? err);
    return null;
  }
}

// ── Tier 2: JSON-LD structured markup ────────────────────────────────────────
// Confidence depends on whether startDate carries explicit timezone information:
//   0.9 = has a UTC offset or trailing Z (e.g. "2026-07-15T21:20:00-07:00" or "...Z")
//   0.5 = bare local datetime with no timezone (e.g. "2026-07-15T21:20:00") —
//         JavaScript/Deno treats this as UTC, which will be wrong for most US mosques
function extractJsonLdEvents(html: string, calendarTimezone: string | null = null): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const now = new Date();
  const scriptMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  for (const match of scriptMatches) {
    let parsed: any;
    try { parsed = JSON.parse(match[1]); } catch { continue; }

    // Normalise to array — could be a single object or @graph array
    const items: any[] = [];
    if (Array.isArray(parsed)) items.push(...parsed);
    else if (parsed?.['@graph']) items.push(...parsed['@graph']);
    else items.push(parsed);

    for (const item of items) {
      if (item?.['@type'] !== 'Event') continue;
      const rawStart: string | null = item.startDate ? String(item.startDate) : null;

      // 0.9 if startDate has explicit non-zero tz offset, 0.85 if Z/UTC, 0.7 if bare local with known tz, 0.5 otherwise
      const hasTz = rawStart ? (/[+-]\d{2}:?\d{2}$/.test(rawStart) || rawStart.endsWith('Z')) : false;

      // Detect +00:00 / -00:00 / Z (zero UTC offset) — a common WordPress misconfiguration
      // where the site timezone is left as UTC so "The Events Calendar" writes event times
      // with +00:00 instead of the correct local offset (e.g. -07:00 for PDT). The time
      // values themselves are local (9:30 AM means 9:30 AM Pacific), but the offset is wrong.
      // We detect this when calendarTimezone is a non-UTC zone: strip the bogus offset and
      // reinterpret using the mosque's actual timezone from coordinates.
      const hasZeroOffset = rawStart
        ? (/[+-]00:?00$/.test(rawStart) || rawStart.endsWith('Z'))
        : false;
      const calTzIsNonUtc = calendarTimezone
        && !['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT'].includes(calendarTimezone);
      const isWordPressUtcMisconfiguration = hasTz && hasZeroOffset && calTzIsNonUtc;

      // For bare local datetimes, convert using the calendar timezone if we have one.
      // Without it, new Date() in the Deno UTC runtime treats local time as UTC — a 7-hour
      // error for US Pacific mosques. With calendarTimezone, icsLocalToUTC() gives correct UTC.
      let startIso: string | null = null;
      if (rawStart) {
        if (isWordPressUtcMisconfiguration) {
          // Strip the bogus +00:00 / Z and re-interpret as local time in the mosque's timezone
          const bareLocal = rawStart.replace(/Z$|[+-]\d{2}:?\d{2}$/, '');
          try { startIso = icsLocalToUTC(bareLocal, calendarTimezone!); } catch { startIso = new Date(rawStart).toISOString(); }
        } else if (hasTz) {
          startIso = new Date(rawStart).toISOString();
        } else if (calendarTimezone) {
          try { startIso = icsLocalToUTC(rawStart, calendarTimezone); } catch { startIso = rawStart + 'Z'; }
        } else {
          startIso = new Date(rawStart).toISOString(); // UTC-naive fallback
        }
      }

      const start = startIso ? new Date(startIso) : null;
      if (start && start < now) continue;

      const confidence = rawStart
        ? (hasTz && !isWordPressUtcMisconfiguration) ? 0.9
          : calendarTimezone ? 0.7
          : 0.5
        : 0.3;

      const loc = item.location?.name ?? item.location?.address?.streetAddress ?? null;
      const rawDesc = item.description ? stripHtml(String(item.description)) : null;
      const body = [rawDesc, loc ? `Location: ${loc}` : null]
        .filter(Boolean).join('\n').trim().slice(0, 1500) || null;

      const title = stripHtml(String(item.name ?? '')).trim().slice(0, 80);
      const sourceUrl: string | null = item.url ? String(item.url).trim() : null;

      // endDate: same handling including WordPress UTC misconfiguration correction
      let endIso: string | null = null;
      if (item.endDate) {
        const rawEnd = String(item.endDate);
        const endHasTz = /[+-]\d{2}:?\d{2}$/.test(rawEnd) || rawEnd.endsWith('Z');
        const endHasZeroOffset = /[+-]00:?00$/.test(rawEnd) || rawEnd.endsWith('Z');
        if (endHasTz && endHasZeroOffset && calTzIsNonUtc) {
          const bareEnd = rawEnd.replace(/Z$|[+-]\d{2}:?\d{2}$/, '');
          try { endIso = icsLocalToUTC(bareEnd, calendarTimezone!); } catch { endIso = new Date(rawEnd).toISOString(); }
        } else if (endHasTz) {
          endIso = new Date(rawEnd).toISOString();
        } else if (calendarTimezone) {
          try { endIso = icsLocalToUTC(rawEnd, calendarTimezone); } catch { endIso = rawEnd + 'Z'; }
        } else {
          endIso = new Date(rawEnd).toISOString();
        }
      }

      console.log(
        `[parse-mosque-website] JSON-LD event: title="${title}"`,
        `raw_start="${rawStart}"`,
        `hasTz=${hasTz} hasZeroOffset=${hasZeroOffset} wpUtcFix=${isWordPressUtcMisconfiguration}`,
        `calTz=${calendarTimezone ?? 'none'}`,
        `→ event_start="${startIso}"`,
        `confidence=${confidence}`,
      );

      events.push({
        title,
        body,
        categories: [],
        event_start: startIso,
        event_end: endIso,
        source_url: sourceUrl,
        source: 'json-ld',
        confidence,
        needs_review: !hasTz && rawStart !== null && !calendarTimezone,
      });
    }
  }

  return events.filter(e => e.title);
}

// ── Tier 3: Google Calendar ICS ───────────────────────────────────────────────
async function tryGoogleCalendar(html: string, result: SyncResult): Promise<void> {
  console.log('[parse-mosque-website] Tier 3: checking for Google Calendar embed');

  // Match both ?src=... and ?cid=... patterns
  const m = html.match(/calendar\.google\.com\/calendar\/embed\?[^"']*(?:src|cid)=([^&"'\s]+)/i);
  if (!m) return;

  const calendarId = decodeURIComponent(m[1]).replace(/\s/g, '+');
  console.log('[parse-mosque-website] Google Calendar ID:', calendarId);

  const encodedId = encodeURIComponent(calendarId);
  const icsUrl = `https://calendar.google.com/calendar/ical/${encodedId}/public/basic.ics`;

  const res = await fetch(icsUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    console.log('[parse-mosque-website] Google Calendar ICS fetch failed:', res.status);
    return;
  }

  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) return;

  const events = parseICS(text, 'google-calendar');
  if (events.length > 0) {
    result.events.push(...events);
    result.sources.push('google-calendar');
    console.log('[parse-mosque-website] Google Calendar: found', events.length, 'events');
  }
}

// ── Tier 3.5: Event platform link follower ────────────────────────────────────
// Many mosque sites don't host events themselves — they link out to Eventbrite,
// Humanitix, or similar platforms for each event. Those platform pages carry
// rich JSON-LD (type: "Event") with full dates, times, and descriptions.
// We detect links to known platforms in the page HTML and fetch their JSON-LD.
const EVENT_PLATFORM_RE = /https?:\/\/(?:www\.)?(?:eventbrite\.com\/e\/|humanitix\.com\/event\/|universe\.com\/events\/|ticketleap\.com\/event\/)[^\s"'<>]+/gi;
const MAX_PLATFORM_EVENTS = 8; // cap to avoid timeout on pages with many links

async function tryEventPlatformLinks(html: string, result: SyncResult): Promise<void> {
  const urls = [...new Set(html.match(EVENT_PLATFORM_RE) ?? [])].slice(0, MAX_PLATFORM_EVENTS);
  if (urls.length === 0) return;

  console.log('[parse-mosque-website] Tier 3.5: found', urls.length, 'event platform links');

  const fetched: ExtractedEvent[] = [];

  await Promise.all(urls.map(async (platformUrl) => {
    try {
      const res = await fetch(platformUrl, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return;
      const platformHtml = await res.text();
      const events = extractJsonLdEvents(platformHtml);
      if (events.length > 0) {
        // Override source_url to point to the actual event platform page
        fetched.push(...events.map(e => ({
          ...e,
          source_url: e.source_url ?? platformUrl,
          source: 'event-platform',
        })));
        console.log('[parse-mosque-website] Tier 3.5:', platformUrl, '→', events.length, 'events');
      }
    } catch (e: any) {
      console.log('[parse-mosque-website] Tier 3.5 fetch failed:', platformUrl, e.message);
    }
  }));

  if (fetched.length > 0) {
    result.events.push(...fetched);
    result.sources.push('event-platform');
    console.log('[parse-mosque-website] Tier 3.5 total:', fetched.length, 'events from platform links');
  }
}

// ── Tier 4: iCal / ICS feed ───────────────────────────────────────────────────
async function tryIcalFeed(origin: string, result: SyncResult): Promise<void> {
  console.log('[parse-mosque-website] Tier 4: trying iCal feed paths');

  // All-in-One Event Calendar (ai1ec / Timely) uses a non-standard export URL —
  // without these the scraper never finds their ICS feed and calendarTimezone stays
  // null, causing JSON-LD bare local datetimes to be stored as UTC (7-hour error
  // for US Pacific mosques like MCA Bay Area).
  const AI1EC_EXPORT = '?plugin=all-in-one-event-calendar&controller=ai1ec_exporter_controller&action=export_events';
  const paths = [
    `${origin}/events/?ical=1`,
    `${origin}/events-calendar/?ical=1`,
    `${origin}/calendar/?ical=1`,
    `${origin}/upcoming-events/?ical=1`,
    `${origin}/?ical=1`,
    `${origin}/events.ics`,
    `${origin}/feed/ical`,
    `${origin}/events/feed/ical`,
    // All-in-One Event Calendar (ai1ec) export paths
    `${origin}/events-calendar/${AI1EC_EXPORT}`,
    `${origin}/events/${AI1EC_EXPORT}`,
    `${origin}/${AI1EC_EXPORT}`,
  ];

  for (const feedUrl of paths) {
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) continue;

      // Extract calendar-level timezone — try X-WR-TIMEZONE first (standard), then
      // VTIMEZONE:TZID block (used by Google Calendar exports and some WordPress plugins
      // that omit X-WR-TIMEZONE but still embed a VTIMEZONE block).
      if (!result.calendarTimezone) {
        const wrTzMatch = text.match(/^X-WR-TIMEZONE:(.+)$/m);
        if (wrTzMatch) {
          const tz = wrTzMatch[1].trim();
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: tz });
            result.calendarTimezone = tz;
            console.log('[parse-mosque-website] iCal X-WR-TIMEZONE:', tz);
          } catch { /* invalid tz, skip */ }
        }
      }

      // Fallback: parse VTIMEZONE block — RFC 5545 mandates a VTIMEZONE component
      // for every TZID referenced in the file; the TZID property value is the IANA name.
      if (!result.calendarTimezone) {
        const vtMatch = text.match(/BEGIN:VTIMEZONE[\s\S]*?^TZID:(.+)$/m);
        if (vtMatch) {
          const tz = vtMatch[1].trim();
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: tz });
            result.calendarTimezone = tz;
            console.log('[parse-mosque-website] iCal VTIMEZONE:TZID:', tz);
          } catch { /* invalid tz, skip */ }
        }
      }

      const events = parseICS(text, 'ical', result.calendarTimezone);
      console.log('[parse-mosque-website] iCal feed at', feedUrl, '— calendarTimezone:', result.calendarTimezone ?? 'null', '—', events.length, 'events');
      if (events.length > 0) {
        result.events.push(...events);
        result.sources.push('ical');
        return; // Stop at first working feed
      }
    } catch (err: any) {
      console.log('[parse-mosque-website] iCal path failed:', feedUrl, err?.message ?? err);
    }
  }
  console.log('[parse-mosque-website] iCal: no feed found across all paths');
}

// ── Tier 5: text heuristics (runs on stripped raw HTML) ─────────────────────────

/** Normalize time strings to "H:MM AM/PM":
 *  "4:29AM" → "4:29 AM", "13:30" → "1:30 PM", "5:00 PM" → "5:00 PM" */
function normalizeTimeStr(t: string): string | null {
  const cleaned = t.trim().toUpperCase().replace(/\s+/g, ' ');
  // 12h without space: "4:29AM" → "4:29 AM"
  const m12 = cleaned.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/);
  if (m12) return `${parseInt(m12[1], 10)}:${m12[2]} ${m12[3]}`;
  // 24h: "13:30"
  const m24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return toAmPm(cleaned);
  return null;
}

const PRAYER_MAP: Record<string, string> = {
  fajr: 'fajr', zuhr: 'dhuhr', dhuhr: 'dhuhr', dhur: 'dhuhr', duhr: 'dhuhr', zohr: 'dhuhr',
  asr: 'asr', maghrib: 'maghrib', magrib: 'maghrib', isha: 'isha', isha: 'isha',
};

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Parses loose date strings seen in prayer-calendar tables — "Jul 01", "7/1",
// "7/1/2026", "2026-07-01" — into a month/day pair (year is ignored; these
// tables are matched against today's month/day, not a specific year).
function parseLooseDate(raw: string): { month: number; day: number } | null {
  const s = raw.trim().toLowerCase();

  const abbr = s.match(/^([a-z]{3,})\.?\s+(\d{1,2})/);
  if (abbr) {
    const month = MONTH_ABBR.indexOf(abbr[1].slice(0, 3));
    const day = parseInt(abbr[2], 10);
    if (month !== -1 && day >= 1 && day <= 31) return { month, day };
  }

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { month: parseInt(iso[2], 10) - 1, day: parseInt(iso[3], 10) };

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);
  if (slash) return { month: parseInt(slash[1], 10) - 1, day: parseInt(slash[2], 10) };

  return null;
}

// Rough day-of-year distance between two month/day pairs (year ignored) —
// good enough for picking "today's row" or the nearest one in a monthly/
// yearly table; not meant to be exact across a Dec→Jan boundary.
function looseDateDiff(a: { month: number; day: number }, b: { month: number; day: number }): number {
  return Math.abs((a.month * 31 + a.day) - (b.month * 31 + b.day));
}

// Detects a "calendar" style prayer table: one row per date, with each
// prayer's adhan/Iqama as a column pair (e.g. Fajr | Iqama | Dhuhr | Iqama |
// ...) — the opposite orientation from Strategy 1 below (one row per prayer,
// a single Iqama column). Mosques that publish a full month/year at once
// (e.g. ISCN's monthly calendar) commonly use this shape.
function extractCalendarIqama(lines: string[]): IqamaTimes | null {
  const TIME_RE = /\b(\d{1,2}:\d{2}\s*[APap][Mm])\b/;

  for (let i = 0; i < lines.length; i++) {
    if (!/iqama/i.test(lines[i]) || !lines[i].includes('|')) continue;

    const headerCols = lines[i].split('|').map(c => c.trim());
    if (headerCols.filter(c => /iqama/i.test(c)).length < 2) continue; // single-column tables are Strategy 1's job

    // Pair each "Iqama" column with the prayer-name column immediately before it.
    const colToPrayer: Record<number, string> = {};
    let lastPrayer: string | null = null;
    headerCols.forEach((col, idx) => {
      const norm = col.toLowerCase().replace(/[^a-z]/g, '');
      if (PRAYER_MAP[norm]) {
        lastPrayer = PRAYER_MAP[norm];
      } else if (/iqama/i.test(col) && lastPrayer) {
        colToPrayer[idx] = lastPrayer;
        lastPrayer = null; // each Iqama column consumes one preceding prayer name
      }
    });
    if (Object.keys(colToPrayer).length === 0) continue;

    const dateColIdx = headerCols.findIndex(c => /^date$/i.test(c));
    const todayLoose = { month: new Date().getMonth(), day: new Date().getDate() };

    let bestRow: string[] | null = null;
    let bestDiff = Infinity;

    for (let j = i + 1; j < Math.min(i + 400, lines.length); j++) {
      const rowCols = lines[j].split('|').map(c => c.trim());
      if (rowCols.length < 2 || rowCols.every(c => /^[-\s]*$/.test(c))) continue;
      if (!rowCols.some(c => TIME_RE.test(c))) continue; // not a data row

      const parsed = dateColIdx !== -1 ? parseLooseDate(rowCols[dateColIdx] ?? '') : null;
      if (parsed) {
        const diff = looseDateDiff(parsed, todayLoose);
        if (diff < bestDiff) { bestDiff = diff; bestRow = rowCols; }
      } else if (!bestRow) {
        bestRow = rowCols; // fallback: first data row found
      }
    }

    if (!bestRow) continue;

    const result: Record<string, string | null> = {
      fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null,
    };
    for (const [idxStr, prayer] of Object.entries(colToPrayer)) {
      const m = (bestRow[Number(idxStr)] ?? '').match(TIME_RE);
      if (m) result[prayer] = normalizeTimeStr(m[1]);
    }
    if (Object.values(result).some(Boolean)) return result as unknown as IqamaTimes;
  }

  return null;
}

// ── HTML table prayer parser ──────────────────────────────────────────────────
// Parses prayer times directly from an HTML <table> that has an "Iqama/Iqamah"
// column header, before whitespace-collapsing stripHtml loses the row structure.
// Handles two-column tables (Adhan | Iqamah) and single-column tables.
function extractIqamaFromHtmlTable(html: string): IqamaTimes | null {
  const iqama: Record<string, string | null> = { fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null };

  // Find all <table> blocks
  for (const tableMatch of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const table = tableMatch[0];

    // Extract all rows
    const rows: string[][] = [];
    for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim());
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length < 2) continue;

    // Find the header row — detect which column index holds "Iqama/Iqamah"
    let iqamaColIdx = -1;
    let dataStartRow = 0;
    for (let r = 0; r < Math.min(3, rows.length); r++) {
      const idx = rows[r].findIndex(c => /iqam/i.test(c));
      if (idx !== -1) { iqamaColIdx = idx; dataStartRow = r + 1; break; }
    }

    // If no explicit Iqama column, skip this table — don't guess
    if (iqamaColIdx === -1) continue;

    for (let r = dataStartRow; r < rows.length; r++) {
      const cells = rows[r];
      if (cells.length <= iqamaColIdx) continue;
      const prayerRaw = cells[0].toLowerCase().replace(/[^a-z]/g, '');
      const key = PRAYER_MAP[prayerRaw];
      if (!key) continue;
      const timeStr = normalizeTimeStr(cells[iqamaColIdx]);
      if (timeStr) iqama[key] = timeStr;
    }

    if (Object.values(iqama).some(Boolean)) break; // found a valid table, stop
  }

  return Object.values(iqama).some(Boolean) ? (iqama as unknown as IqamaTimes) : null;
}

// ── Tockify event extractor ───────────────────────────────────────────────────
// Tockify embeds all event data in a window.tkf.bootdata JS object inside a
// <script> tag. Events are server-bootstrapped on first load (no API call needed)
// with Unix ms timestamps and an IANA timezone from the calendar metadata.
function extractTockifyEvents(html: string): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];

  // Find window.tkf = { ... } assignment in any <script> block
  const scriptMatch = html.match(/window\.tkf\s*=\s*(\{[\s\S]*?\});\s*(?:<\/script>|window\.|var )/);
  if (!scriptMatch) return events;

  let bootdata: any;
  try {
    const parsed = JSON.parse(scriptMatch[1]);
    bootdata = parsed?.bootdata;
  } catch {
    return events;
  }
  if (!bootdata) return events;

  const timezone: string = bootdata?.calendar?.timezone ?? 'UTC';
  const rawEvents: any[] = bootdata?.query?.agenda?.events ?? [];
  const now = Date.now();

  for (const ev of rawEvents) {
    try {
      const startMs: number = ev.when?.start?.millis ?? ev.start ?? null;
      const endMs: number | null = ev.when?.end?.millis ?? ev.end ?? null;
      if (!startMs || startMs < now - 86_400_000) continue; // skip past events (allow today)

      const title: string = ev.content?.summary?.text ?? ev.summary ?? '';
      if (!title.trim()) continue;

      const body: string | null = ev.content?.description?.text?.replace(/<[^>]+>/g, '').trim() || null;
      const startIso = new Date(startMs).toISOString();
      const endIso = endMs ? new Date(endMs).toISOString() : null;

      events.push({
        title: title.trim(),
        body: body || null,
        categories: [],
        event_start: startIso,
        event_end: endIso,
        source_url: ev.url ?? null,
        source: 'tockify',
        confidence: 0.9, // ms timestamps are unambiguous
        needs_review: false,
      });
    } catch { /* malformed event, skip */ }
  }

  console.log('[parse-mosque-website] Tockify: extracted', events.length, 'events');
  return events;
}

function extractIqamaFromText(text: string): IqamaTimes | null {
  const lines = text.split('\n');

  const calendar = extractCalendarIqama(lines);
  if (calendar) return calendar;

  const result: Record<string, string | null> = {
    fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null,
  };

  const TIME_RE = /\b(\d{1,2}:\d{2}\s*[APap][Mm])\b/;

  // Strategy 1: Markdown table with "Iqama" or "Iqamah" column header
  let iqamaColIdx = -1;
  let headerLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/iqama/i.test(lines[i])) {
      const cols = lines[i].split('|').map(c => c.trim().toLowerCase());
      const idx = cols.findIndex(c => c.includes('iqama'));
      if (idx !== -1) {
        iqamaColIdx = idx;
        headerLineIdx = i;
        break;
      }
    }
  }

  if (headerLineIdx !== -1 && iqamaColIdx !== -1) {
    for (let i = headerLineIdx + 1; i < lines.length; i++) {
      const cols = lines[i].split('|').map(c => c.trim());
      if (cols.length < 2) continue;
      // Skip separator rows (---)
      if (cols.every(c => /^[-\s]*$/.test(c))) continue;

      const prayerName = cols[1]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
      const key = PRAYER_MAP[prayerName];
      if (!key) continue;

      const cell = cols[iqamaColIdx] ?? '';
      const m = cell.match(TIME_RE);
      if (m) result[key] = normalizeTimeStr(m[1]);
    }
  } else {
    // Regex to detect a time RANGE — e.g. "4:32 AM - 5:58 AM" or "4:32 AM – 5:58 AM".
    // Lines with ranges show prayer WINDOWS (adhan start → adhan end), not iqama times.
    // Picking the "last time on the line" heuristic would grab a window endpoint, not the iqama.
    const TIME_RANGE_LINE_RE = /\d{1,2}:\d{2}\s*[APap][Mm]\s*[-–—to]\s*\d{1,2}:\d{2}\s*[APap][Mm]/;

    // Strategy 2: prayer name and time on the same line
    // e.g. "Fajr   5:00 AM" or "Maghrib: 8:28 PM"
    // Skip lines that contain a time range — those show adhan windows, not iqama times.
    for (const line of lines) {
      if (TIME_RANGE_LINE_RE.test(line)) continue; // adhan window, not an iqama time
      const lower = line.toLowerCase();
      for (const [keyword, key] of Object.entries(PRAYER_MAP)) {
        if (!lower.includes(keyword)) continue;
        const times = [...line.matchAll(/\b(\d{1,2}:\d{2}\s*[APap][Mm])\b/g)];
        // Prefer last time on the line (more likely to be iqama, not adhan)
        const last = times[times.length - 1];
        if (last) result[key] = normalizeTimeStr(last[1]);
        break;
      }
    }

    // Strategy 3: prayer name on its own line, time on the next 1–2 lines.
    // Handles widget layouts like:
    //   Fajr
    //   5:00 AM
    //   Zuhr
    //   1:30 PM
    if (!Object.values(result).some(Boolean)) {
      for (let i = 0; i < lines.length - 1; i++) {
        const lower = lines[i].trim().toLowerCase().replace(/[^a-z]/g, '');
        const key = PRAYER_MAP[lower];
        if (!key || result[key]) continue;
        // Look at the next two lines for a time (skip range lines)
        for (const offset of [1, 2]) {
          const nextLine = lines[i + offset] ?? '';
          if (TIME_RANGE_LINE_RE.test(nextLine)) continue;
          const m = nextLine.match(/\b(\d{1,2}:\d{2}\s*[APap][Mm])\b/);
          if (m) { result[key] = normalizeTimeStr(m[1]); break; }
        }
      }
    }
  }

  return Object.values(result).some(Boolean) ? (result as unknown as IqamaTimes) : null;
}

function extractJummahFromText(
  text: string,
): Array<{ time: string; khateeb: string | null; hall: string | null }> {
  const sessions: Array<{ time: string; khateeb: string | null; hall: string | null }> = [];
  const TIME_RE = /\b(\d{1,2}:\d{2}\s*[APap][Mm])\b/g;

  // Titled names: Imam, Sheikh, Shaykh, Shaikh, Dr., Sh., Ustadh, Mufti, Brother, Br., Hafiz, Qari
  const KHATEEB_TITLED_RE = /(?:Imam|Sheikh|Shaykh|Shaikh|Dr\.|Sh\.|Ustadh|Mufti|Brother|Br\.|Hafiz|Qari)\s+[\w][\w\s]{1,40}/i;

  // Plain name fallback: 2–4 capitalized words on their own short line (e.g. "Sami Rehman")
  // Must be short (≤40 chars) and contain no digits, URLs, or common nav words.
  const PLAIN_NAME_RE = /^[A-Z][a-z'-]+(?: [A-Z][a-z'-]+){1,3}$/;
  const NAV_WORDS_RE = /home|about|contact|register|login|donate|more|info|learn|view|click|here|read/i;

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (!/jum+[auh]/i.test(lower) && !/friday\s+prayer/i.test(lower)) continue;

    // Skip lines where times appear as a range (prayer window) rather than a single iqama time
    if (/\d{1,2}:\d{2}\s*[APap][Mm]\s*[-–—to]\s*\d{1,2}:\d{2}\s*[APap][Mm]/.test(line)) continue;

    const timesOnLine = [...line.matchAll(TIME_RE)];
    if (timesOnLine.length === 0) continue;

    // Default: last time on the Jummah line (heuristic: iqama comes after khutbah)
    let time = normalizeTimeStr(timesOnLine[timesOnLine.length - 1][1]);
    if (!time) continue;

    // Better: look at the next 4 lines for an explicit "iqama" keyword.
    // Websites that split khutbah/iqama across lines (e.g. "Khutbah 1:25 PM\nIqama 1:50 PM")
    // would otherwise give us the khutbah time as the "last time on the Jummah line".
    const nextLines = [
      lines[i + 1] ?? '', lines[i + 2] ?? '',
      lines[i + 3] ?? '', lines[i + 4] ?? '',
    ];
    for (const nl of nextLines) {
      if (!/iqama/i.test(nl)) continue;
      const iqamaTimes = [...nl.matchAll(TIME_RE)];
      if (iqamaTimes.length > 0) {
        const explicit = normalizeTimeStr(iqamaTimes[iqamaTimes.length - 1][1]);
        if (explicit) { time = explicit; break; }
      }
    }

    // Look for khateeb name on same line or next 1–4 lines.
    // Strategy 1: titled name (Sheikh, Shaykh, Imam, Dr., etc.)
    let khateeb: string | null = null;
    const searchText = [line, ...nextLines].join(' ');
    const km = searchText.match(KHATEEB_TITLED_RE);
    if (km) {
      khateeb = km[0].trim();
    } else {
      // Strategy 2: plain name on its own line (2–4 capitalized words, no nav/UI words)
      for (const nl of nextLines) {
        const trimmed = nl.trim();
        if (
          trimmed.length >= 4 &&
          trimmed.length <= 40 &&
          PLAIN_NAME_RE.test(trimmed) &&
          !NAV_WORDS_RE.test(trimmed) &&
          !/\d/.test(trimmed)
        ) {
          khateeb = trimmed;
          break;
        }
      }
    }

    sessions.push({ time, khateeb, hall: null });
  }

  return sessions;
}

// Returns true if any iqama slot is null — used to decide whether to run
// further tiers that might be able to fill in the missing prayers.
function iqamaIsIncomplete(t: IqamaTimes | null): boolean {
  if (!t) return true;
  return Object.values(t).some(v => v === null);
}

// Merges freshly-extracted iqama times INTO the existing result, filling only
// slots that are currently null (never overwrites a value already captured by a
// higher-confidence tier like Masjidal or a Google Sheet).
function mergeIqamaTimes(result: SyncResult, fresh: Record<string, string | null>): void {
  const SLOTS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
  if (!result.iqama_times) {
    result.iqama_times = { fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null };
  }
  let filled = false;
  for (const slot of SLOTS) {
    if (!result.iqama_times[slot] && fresh[slot]) {
      result.iqama_times[slot] = fresh[slot];
      filled = true;
    }
  }
  if (filled) console.log('[parse-mosque-website] mergeIqamaTimes: filled missing iqama slots from page text');
}

// ── Auto-discover events from common sub-pages ────────────────────────────────
// Called when the main URL yielded no events. Tries predictable event page
// paths on the same origin: iCal feed first (most reliable), then JSON-LD
// from the HTML.
const EVENT_SUBPATHS = [
  '/events/',
  '/events-calendar/',
  '/calendar/',
  '/upcoming-events/',
  '/programs/',
  '/community-events/',
];

async function tryEventSubpages(origin: string, result: SyncResult): Promise<void> {
  console.log('[parse-mosque-website] Auto-discover: trying event subpages');

  for (const path of EVENT_SUBPATHS) {
    if (result.events.length > 0) break;

    const subUrl = `${origin}${path}`;

    // 1. iCal feed on this subpage path
    try {
      const icalRes = await fetch(`${subUrl}?ical=1`, {
        signal: AbortSignal.timeout(6_000),
      });
      if (icalRes.ok) {
        const text = await icalRes.text();
        if (text.includes('BEGIN:VCALENDAR')) {
          const events = parseICS(text, 'ical');
          if (events.length > 0) {
            result.events.push(...events);
            if (!result.sources.includes('ical')) result.sources.push('ical');
            console.log('[parse-mosque-website] Auto-discover iCal at', subUrl, '—', events.length, 'events');
            return;
          }
        }
      }
    } catch { /* try next */ }

    // 2. Fetch subpage HTML → JSON-LD + Google Calendar
    try {
      const htmlRes = await fetch(subUrl, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8_000),
      });
      if (!htmlRes.ok) continue;
      const html = await htmlRes.text();

      const jsonLdEvents = extractJsonLdEvents(html, result.calendarTimezone);
      if (jsonLdEvents.length > 0) {
        result.events.push(...jsonLdEvents);
        if (!result.sources.includes('json-ld')) result.sources.push('json-ld');
        console.log('[parse-mosque-website] Auto-discover JSON-LD at', subUrl, '—', jsonLdEvents.length, 'events');
        return;
      }

      await tryGoogleCalendar(html, result);
      if (result.events.length > 0) return;
    } catch { /* try next */ }
  }
}

// ── Normalize a title for duplicate comparison ────────────────────────────────
// Decodes common HTML entities and normalises Unicode punctuation so that the
// same event name from JSON-LD vs. ICS/iCal is treated as identical even when
// one source uses smart-quotes or numeric entities and the other uses plain ASCII.
function normalizeTitle(t: string): string {
  return t
    // Common named entities
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    // Common numeric entities for punctuation
    .replace(/&#8211;/g, '-')   // en-dash
    .replace(/&#8212;/g, '--')  // em-dash
    .replace(/&#8216;/g, "'")   // left single quote
    .replace(/&#8217;/g, "'")   // right single quote / apostrophe
    .replace(/&#8220;/g, '"')   // left double quote
    .replace(/&#8221;/g, '"')   // right double quote
    // Unicode curly/typographic punctuation → ASCII equivalents
    .replace(/[\u2013]/g, '-')          // en-dash
    .replace(/[\u2014]/g, '--')         // em-dash
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'") // curly single quotes / backtick / acute
    .replace(/[\u201C\u201D]/g, '"')    // curly double quotes
    .replace(/[\u2026]/g, '...')        // ellipsis
    // Collapse all whitespace (including non-breaking space U+00A0)
    .replace(/[\s\u00A0]+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── Auto-categorize events by title/body keywords ────────────────────────────
// Maps to the same category slugs used in the app: lectures | quran | youth |
// sisters | community | other. Order matters — first match wins, so more
// specific rules (quran, sisters) come before broader ones (lectures, community).
const CATEGORY_RULES: { category: string; re: RegExp }[] = [
  // Quran — hifz, tajweed, tafsir, memorization, recitation
  {
    category: 'quran',
    re: /quran|qur'?an|hifz|tahfiz|tajweed|tafseer|tafsir|tilawah|recit(ation|e)|memoriz/i,
  },
  // Sisters — women-only programs
  {
    category: 'sisters',
    re: /\bsisters?\b|\bwomen\b|\bwomen'?s\b|\bladies\b|\bmuslimah\b/i,
  },
  // Youth — teens, kids, children, youth programs, camps
  {
    category: 'youth',
    re: /\byouth\b|\bteens?\b|\bkids\b|\bchildren\b|\bchild\b|\bjuniors?\b|\bboys?\b|\bgirls?\b|\bcamp\b|\bSTEM\b|young adult/i,
  },
  // Community — social events, iftar, eid, dinners, charity, food
  {
    category: 'community',
    re: /\bcommunity\b|\bfamily\b|\bpicnic\b|\bdinner\b|\biftar\b|\beid\b|\bcelebrat|\bsocial\b|\bgathering\b|open house|\bpotluck\b|\bfundrais|\bcharity\b|\bvolunteer|\bfood\b|\bbazaar\b|\bfair\b|\bcarnival\b|\bbbq\b|barbeque|\bbrunch\b|\blunch\b/i,
  },
  // Lectures — classes, fiqh, hadith, aqeedah, seerah, halaqa, workshops
  {
    category: 'lectures',
    re: /\blecture\b|\bfiqh\b|\bhadith\b|\bus[uū]l\b|\baqeed[ah]\b|\bakhlaq\b|\bseerah\b|\bsirah\b|\bkhutbah\b|\bclass\b|\bcourse\b|\bseminar\b|\bworkshop\b|\blesson\b|\bhalaqa[h]?\b|\bstudy\b|\bdars\b|\btalk\b|\bpanel\b|\bprogramme?\b|\bilm\b|sacred contract/i,
  },
];

/**
 * Returns all matching category slugs for an event (e.g. ['youth', 'quran'] for
 * a kids Quran class). Returns empty array when no keywords match — the client
 * renders that as "other". Only fills categories when the event's own source left
 * it empty — manual overrides set by the mosque owner are never overwritten.
 */
function categorizeEvent(title: string, body: string | null): string[] {
  const text = `${title} ${body ?? ''}`;
  return CATEGORY_RULES.filter(({ re }) => re.test(text)).map(({ category }) => category);
}

// ── Deduplicate events ────────────────────────────────────────────────────────
// Strategy:
// - Sort by confidence DESCENDING so the most reliable event for a given
//   (normalized-title, date) slot is processed first and kept.
// - Then drop lower-confidence duplicates (same normalized title within 7 days).
// - Weekly/genuinely-recurring events (same title but 8+ days apart) are kept
//   as separate entries — this does NOT collapse legitimate recurring events.
// - If a duplicate is dropped whose time differs from the kept event by >30 min,
//   the kept event is marked needs_review (conflicting sources, owner should verify).
function dedupeEvents(events: ExtractedEvent[]): ExtractedEvent[] {
  // Source priority: ical/google-calendar feeds are most reliable (direct UTC or explicit TZID).
  // JSON-LD is less reliable when WordPress UTC misconfiguration emits +00:00 offsets.
  // We process highest-priority events first so that the "first seen wins" loop keeps the right one.
  const SOURCE_PRIORITY: Record<string, number> = {
    'ical': 10, 'google-calendar': 10,
    'tockify': 7, 'mawaqit': 7, 'masjidal': 7, 'athanplus': 7,
    'json-ld': 3,
    'llm': 1,
  };
  const srcPri = (ev: ExtractedEvent) => SOURCE_PRIORITY[ev.source] ?? 2;

  // Primary sort: higher confidence first.
  // Tie-break 1: higher source priority (ical before json-ld avoids wrong-UTC wins).
  // Tie-break 2: earlier start time.
  const sorted = [...events].sort((a, b) => {
    const confDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (Math.abs(confDiff) > 0.05) return confDiff;
    const priDiff = srcPri(b) - srcPri(a);
    if (priDiff !== 0) return priDiff;
    if (!a.event_start) return 1;
    if (!b.event_start) return -1;
    return new Date(a.event_start).getTime() - new Date(b.event_start).getTime();
  });

  const kept: ExtractedEvent[] = [];

  for (const ev of sorted) {
    const titleKey = normalizeTitle(ev.title);
    const start = ev.event_start ? new Date(ev.event_start).getTime() : null;

    let foundDupe = false;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      if (normalizeTitle(k.title) !== titleKey) continue;

      // Same title with no start on either → exact duplicate
      if (!start || !k.event_start) { foundDupe = true; break; }

      const diffMs = Math.abs(start - new Date(k.event_start).getTime());
      if (diffMs >= 7 * 24 * 60 * 60 * 1000) continue; // >7 days → genuinely different occurrence

      // Within 7 days with same normalized title → duplicate
      foundDupe = true;

      // If the times differ by >30 min, sources disagree — flag the kept event
      if (diffMs > 30 * 60 * 1000) {
        console.log(
          `[parse-mosque-website] dedup: conflicting times for "${ev.title}":`,
          `kept=${k.event_start} (${k.source}, conf=${k.confidence})`,
          `vs dropped=${ev.event_start} (${ev.source}, conf=${ev.confidence})`,
        );
        kept[i] = { ...k, needs_review: true };
      }
      break;
    }

    if (!foundDupe) kept.push(ev);
  }

  return kept;
}

// ── SHA-256 content hash ──────────────────────────────────────────────────────
// Used for change detection: if the cleaned page text hasn't changed since the
// last sync, we skip re-parsing and return the cached result at $0 cost.
async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Evaluate deterministic parse completeness ────────────────────────────────
// Returns 'high' if all 5 iqama slots are filled, 'medium' if 3–4 are filled,
// 'low' if ≤2 prayers are found (LLM fallback will be attempted).
function evaluateConfidence(result: SyncResult): 'high' | 'medium' | 'low' {
  if (!result.iqama_times) return 'low';
  const filled = Object.values(result.iqama_times).filter(Boolean).length;
  if (filled === 5) return 'high';
  if (filled >= 3) return 'medium';
  return 'low';
}

// ── LLM cost estimator ────────────────────────────────────────────────────────
function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * LLM_IN_COST + (outputTokens / 1_000_000) * LLM_OUT_COST;
}

// ── LLM fallback (OpenAI-compatible API) ─────────────────────────────────────
// Called only when deterministic parsing returns low confidence.
// Uses configurable model/endpoint/pricing from env vars.
// Returns a partial SyncResult merged with the deterministic result.
interface LlmFallbackResult {
  result: Partial<SyncResult>;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
  estimatedCost: number;
  warnings: string[];
}

const LLM_SCHEMA = `{
  "iqamaTimes": {
    "fajr": "string | null",
    "dhuhr": "string | null",
    "asr": "string | null",
    "maghrib": "string | null",
    "isha": "string | null"
  },
  "jummah": [
    { "time": "string", "khateeb": "string | null", "notes": "string | null" }
  ],
  "timezone": "IANA timezone string inferred from the page content (e.g. America/Los_Angeles, America/New_York) or null if unknown",
  "events": [
    {
      "title": "string",
      "date": "YYYY-MM-DD or null",
      "startTime": "H:MM AM/PM or null",
      "endTime": "H:MM AM/PM or null",
      "location": "string | null",
      "description": "string | null",
      "sourceText": "short excerpt from source text"
    }
  ],
  "confidence": "high | medium | low",
  "warnings": ["string"]
}`;

const TIME_RANGE_RE = /^(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)$/i;

function isValidAmPm(t: string | null | undefined): boolean {
  if (!t) return false;
  return TIME_RANGE_RE.test(t.trim());
}

async function tryLlmFallback(cleanedText: string, sourceUrl: string, mosqueName?: string | null): Promise<LlmFallbackResult> {
  const warnings: string[] = [];

  if (!LLM_API_KEY) throw new Error('LLM_API_KEY not set');

  // Cap input to ~12k tokens (~48k chars) to stay within typical context budgets
  const cappedText = cleanedText.slice(0, 48_000);
  const estimatedInputTokens = Math.ceil(cappedText.length / 4) + 200; // +200 for system/schema

  const systemPrompt =
    'You extract mosque prayer and event data from website text. ' +
    'Respond ONLY with valid JSON matching the provided schema. No explanation, no markdown fences.';

  const todayIso = new Date().toISOString().slice(0, 10);

  const locationLine = mosqueName
    ? `- This page may show prayer times for multiple locations or masjids. Extract data ONLY for the location named "${mosqueName}". If you see a toggle or section labels, match the one closest to this name and ignore all others.\n`
    : '';

  const userPrompt =
    `Today's date is ${todayIso}. Extract mosque prayer and event data from the following website text.\n\n` +
    `Return ONLY valid JSON matching this schema:\n${LLM_SCHEMA}\n\n` +
    `Rules:\n` +
    `- All times must be in "H:MM AM/PM" format (e.g. "5:30 AM", "1:15 PM").\n` +
    `- Set "timezone" to the IANA timezone you can infer from the page (city, state, or explicit timezone mention). For example, a mosque in the San Francisco Bay Area → "America/Los_Angeles", New York → "America/New_York", Chicago → "America/Chicago". Use null only if you truly cannot determine the timezone.\n` +
    locationLine +
    `- Use the IQAMA time for each prayer, not the Adhan/Azan time. If both appear, take the later one.\n` +
    `- For Jumu'ah: extract EVERY session listed (mosques often have 1st, 2nd, sometimes 3rd Jumu'ah).\n` +
    `- For each Jumu'ah session, use the Iqama time (not the Khutbah time).\n` +
    `- For each Jumu'ah session, capture the khateeb/speaker name if shown — it may appear as a plain name (e.g. "Sami Rehman") without any title, or with a title (Sheikh, Shaykh, Imam, Dr., Ustadh, Mufti, Hafiz).\n` +
    `- dates must be ISO format YYYY-MM-DD.\n` +
    `- Only include future events (today ${todayIso} or later). Skip past events.\n` +
    `- For RECURRING programs/classes (e.g. "Every Tuesday at 7 PM", "Weekly Halaqa"): calculate the next upcoming date from today (${todayIso}) and use that as the date. Set description to note it is recurring.\n` +
    `- If a field is unknown, use null.\n` +
    `- sourceText is required for every event — include a short excerpt proving where you found it.\n\n` +
    `Website text:\n${cappedText}`;

  // Detect API format from base URL.
  // Anthropic: LLM_BASE_URL contains "anthropic.com" → use /v1/messages format.
  // Everything else: assume OpenAI-compatible /chat/completions format.
  const isAnthropic = LLM_BASE_URL.includes('anthropic.com');

  console.log('[parse-mosque-website] LLM fallback: calling', LLM_MODEL, `(${isAnthropic ? 'Anthropic' : 'OpenAI-compatible'})`, 'estimated input tokens:', estimatedInputTokens);

  let llmRes: Response;
  if (isAnthropic) {
    llmRes = await fetch(`${LLM_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       LLM_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      LLM_MODEL,
        max_tokens: 1500,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } else {
    llmRes = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model:       LLM_MODEL,
        messages:    [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0,
        max_tokens:  1500,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  }

  if (!llmRes.ok) {
    const err = await llmRes.text().catch(() => '');
    throw new Error(`LLM API ${llmRes.status}: ${err.slice(0, 200)}`);
  }

  const llmData = await llmRes.json();

  // Parse response — Anthropic and OpenAI use different shapes
  let rawContent: string;
  let outputTokens: number;
  let inputTokens: number;

  if (isAnthropic) {
    // Anthropic: { content: [{type:'text', text:'...'}], usage: {input_tokens, output_tokens} }
    rawContent    = llmData.content?.[0]?.text ?? '';
    outputTokens  = llmData.usage?.output_tokens ?? Math.ceil(rawContent.length / 4);
    inputTokens   = llmData.usage?.input_tokens  ?? estimatedInputTokens;
  } else {
    // OpenAI: { choices: [{message:{content:'...'}}], usage: {prompt_tokens, completion_tokens} }
    rawContent    = llmData.choices?.[0]?.message?.content ?? '';
    outputTokens  = llmData.usage?.completion_tokens ?? Math.ceil(rawContent.length / 4);
    inputTokens   = llmData.usage?.prompt_tokens     ?? estimatedInputTokens;
  }

  // Strip markdown fences if the model included them despite instructions
  const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(`LLM returned non-JSON: ${e.message}. Raw: ${rawContent.slice(0, 300)}`);
  }

  // ── Validate and normalise LLM output ──────────────────────────────────────
  const iqamaTimes: IqamaTimes = {
    fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null,
  };

  const rawIqama = parsed.iqamaTimes ?? {};
  for (const key of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
    const raw = rawIqama[key];
    if (!raw) continue;
    const norm = normalizeTimeStr(String(raw));
    if (norm) {
      iqamaTimes[key] = norm;
    } else {
      warnings.push(`LLM returned unparseable time for ${key}: "${raw}"`);
    }
  }

  const jummahSessions: Array<{ time: string; khateeb: string | null; hall: string | null }> = [];
  for (const j of (parsed.jummah ?? [])) {
    const norm = j.time ? normalizeTimeStr(String(j.time)) : null;
    if (norm) {
      jummahSessions.push({ time: norm, khateeb: j.khateeb ?? null, hall: null });
    }
  }

  // The LLM may return an IANA timezone it inferred from the page (e.g. "America/Los_Angeles").
  // Use it to convert local event times to UTC so they display correctly on the user's device.
  const llmTimezone: string | null = parsed.timezone && typeof parsed.timezone === 'string'
    ? parsed.timezone.trim() || null
    : null;

  /** Convert "YYYY-MM-DD" + "HH:MM" (24h) → UTC ISO string, using llmTimezone when available. */
  function buildUtcIso(date: string, hh: string, mm: string): string {
    const localIso = `${date}T${hh}:${mm}:00`;
    if (llmTimezone) {
      try { return icsLocalToUTC(localIso, llmTimezone); } catch { /* fall through */ }
    }
    // No timezone info — store as UTC (will be wrong for non-UTC locales, but no better option)
    return localIso + 'Z';
  }

  const hasTimezone = !!llmTimezone;
  const events: ExtractedEvent[] = [];
  const now = new Date();
  for (const ev of (parsed.events ?? [])) {
    if (!ev.title) continue;
    // Build ISO start time
    let event_start: string | null = null;
    if (ev.date && ev.startTime) {
      const startNorm = normalizeTimeStr(String(ev.startTime));
      if (startNorm) {
        // Convert "H:MM AM/PM" → 24h for Date parsing
        const m = startNorm.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (m) {
          let h = parseInt(m[1], 10);
          const min = m[2];
          const period = m[3].toUpperCase();
          if (period === 'PM' && h !== 12) h += 12;
          if (period === 'AM' && h === 12) h = 0;
          const candidate = new Date(buildUtcIso(ev.date, String(h).padStart(2, '0'), min));
          if (!isNaN(candidate.getTime()) && candidate > now) {
            event_start = candidate.toISOString();
          }
        }
      }
    } else if (ev.date) {
      const candidate = new Date(`${ev.date}T00:00:00Z`);
      if (!isNaN(candidate.getTime()) && candidate > now) {
        event_start = candidate.toISOString();
      }
    }

    let event_end: string | null = null;
    if (ev.date && ev.endTime) {
      const endNorm = normalizeTimeStr(String(ev.endTime));
      if (endNorm) {
        const m = endNorm.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (m) {
          let h = parseInt(m[1], 10);
          const min = m[2];
          const period = m[3].toUpperCase();
          if (period === 'PM' && h !== 12) h += 12;
          if (period === 'AM' && h === 12) h = 0;
          const candidate = new Date(buildUtcIso(ev.date, String(h).padStart(2, '0'), min));
          if (!isNaN(candidate.getTime())) event_end = candidate.toISOString();
        }
      }
    }

    events.push({
      title: String(ev.title).trim().slice(0, 80),
      body: ev.description ? String(ev.description).trim().slice(0, 1500) : null,
      categories: [],
      event_start,
      event_end,
      source_url: sourceUrl,
      source: 'llm_fallback',
      // With timezone: times are local→UTC converted (confidence 0.6); without: UTC-naive (0.4)
      confidence: hasTimezone ? 0.6 : 0.4,
      needs_review: true,
    });
  }

  if (parsed.warnings?.length) {
    warnings.push(...parsed.warnings.map((w: any) => String(w)));
  }

  const cost = estimateCost(inputTokens, outputTokens);
  console.log(
    '[parse-mosque-website] LLM fallback done:',
    `in=${inputTokens} out=${outputTokens} cost=$${cost.toFixed(6)} model=${LLM_MODEL}`,
    `iqama filled=${Object.values(iqamaTimes).filter(Boolean).length}`,
    `jummah=${jummahSessions.length} events=${events.length}`,
  );

  return {
    result: { iqama_times: iqamaTimes, jummah_sessions: jummahSessions, events },
    inputTokens,
    outputTokens,
    modelUsed: LLM_MODEL,
    estimatedCost: cost,
    warnings,
  };
}

// ── Tier 6: Vision-based event extraction from image flyers ──────────────────
// Some mosque sites (e.g. SBIA) advertise events exclusively as image cards —
// the date, time, and speaker are text printed inside a JPEG/PNG flyer.
// No text extractor can read those; Claude's vision API can.
// Only runs when:
//   - LLM_ENABLED + LLM_VISION_ENABLED = true
//   - LLM_BASE_URL contains "anthropic.com" (Anthropic models support vision)
//   - The page has candidate event-flyer images

// Returns public image URLs from the page that look like event flyers.
// Filters out logos, icons, tiny images, and decorative assets.
function findEventImageCandidates(html: string, baseUrl: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = m[1];

    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const src = srcMatch[1].trim();
    if (!src || src.startsWith('data:')) continue;

    // Must be a raster image (jpg/png/webp or a media upload path with no extension)
    const isRaster = /\.(jpe?g|png|webp)(\?[^"']*)?$/i.test(src);
    const isUpload = /\/(wp-content\/uploads|media|uploads|images|assets)\//i.test(src);
    if (!isRaster && !isUpload) continue;

    // Skip clearly small images
    const w = attrs.match(/\bwidth=["']?(\d+)/i);
    const h = attrs.match(/\bheight=["']?(\d+)/i);
    if (w && parseInt(w[1]) < 150) continue;
    if (h && parseInt(h[1]) < 150) continue;

    // Skip obvious non-event assets
    if (/(logo|icon|avatar|sprite|pixel|spacer|flag|arrow|star|badge|separator|background|bg[-_]|header[-_]|footer[-_]|banner-ad|tracking)/i.test(src)) continue;

    try {
      const resolved = new URL(src, baseUrl).toString();
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      candidates.push(resolved);
    } catch { /* malformed src */ }
  }

  return candidates.slice(0, MAX_VISION_IMAGES);
}

interface VisionCost {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

async function tryVisionEventExtraction(
  html: string,
  baseUrl: string,
  result: SyncResult,
): Promise<VisionCost> {
  const cost: VisionCost = { totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0 };

  if (!LLM_ENABLED || !LLM_VISION_ENABLED || !LLM_API_KEY) return cost;
  if (!LLM_BASE_URL.includes('anthropic.com')) return cost; // vision only on Anthropic

  const imageUrls = findEventImageCandidates(html, baseUrl);
  if (imageUrls.length === 0) return cost;

  console.log('[parse-mosque-website] Tier 6: vision event extraction on', imageUrls.length, 'image(s)');

  const todayIso = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const newEvents: ExtractedEvent[] = [];

  await Promise.all(imageUrls.map(async (imageUrl) => {
    try {
      const res = await fetch(`${LLM_BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         LLM_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      LLM_MODEL,
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: imageUrl } },
              {
                type: 'text',
                text:
                  `Today is ${todayIso}. Is this image a mosque event flyer or program announcement?\n\n` +
                  `If YES, return JSON:\n` +
                  `{"isEvent":true,"title":"","date":"YYYY-MM-DD or null","startTime":"H:MM AM/PM or null","endTime":"H:MM AM/PM or null","description":"brief or null","speaker":"name or null"}\n\n` +
                  `If NO (logo, photo, decoration, etc.), return: {"isEvent":false}\n\n` +
                  `Return ONLY valid JSON. No explanation.`,
              },
            ],
          }],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.log('[parse-mosque-website] Vision API', res.status, 'for', imageUrl);
        return;
      }

      const data = await res.json();
      const rawText: string = data.content?.[0]?.text ?? '';
      const inTok: number   = data.usage?.input_tokens  ?? 0;
      const outTok: number  = data.usage?.output_tokens ?? 0;

      cost.totalInputTokens  += inTok;
      cost.totalOutputTokens += outTok;
      cost.totalCost         += estimateCost(inTok, outTok);

      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      let parsed: any;
      try { parsed = JSON.parse(cleaned); } catch { return; }

      if (!parsed.isEvent || !parsed.title) return;

      // Build event_start ISO from date + time
      let event_start: string | null = null;
      if (parsed.date) {
        const startNorm = parsed.startTime ? normalizeTimeStr(String(parsed.startTime)) : null;
        if (startNorm) {
          const mTime = startNorm.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (mTime) {
            let h = parseInt(mTime[1], 10);
            const min = mTime[2];
            const period = mTime[3].toUpperCase();
            if (period === 'PM' && h !== 12) h += 12;
            if (period === 'AM' && h === 12) h = 0;
            const candidate = new Date(`${parsed.date}T${String(h).padStart(2, '0')}:${min}:00Z`);
            if (!isNaN(candidate.getTime()) && candidate > now) event_start = candidate.toISOString();
          }
        } else {
          const candidate = new Date(`${parsed.date}T00:00:00Z`);
          if (!isNaN(candidate.getTime()) && candidate > now) event_start = candidate.toISOString();
        }
      }

      const title = String(parsed.title).trim().slice(0, 80);
      const desc = [
        parsed.description ?? null,
        parsed.speaker ? `Speaker: ${parsed.speaker}` : null,
      ].filter(Boolean).join('\n') || null;

      console.log(`[parse-mosque-website] Vision: "${title}" start=${event_start} from ${imageUrl}`);

      newEvents.push({
        title,
        body:        desc,
        category:    null,
        event_start,
        event_end:   null,
        source_url:  imageUrl,
        source:      'vision',
        confidence:  0.7, // reliable for clear flyers, but dates treated as UTC → review
        needs_review: true,
      });
    } catch (e: any) {
      console.log('[parse-mosque-website] Vision failed for', imageUrl, ':', e.message);
    }
  }));

  if (newEvents.length > 0) {
    result.events.push(...newEvents);
    if (!result.sources.includes('vision')) result.sources.push('vision');
    console.log('[parse-mosque-website] Tier 6 vision total:', newEvents.length, 'event(s) from images');
  }

  return cost;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  console.log('[parse-mosque-website] invoked', req.method);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── 1. Authenticate caller ────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    console.log('[parse-mosque-website] missing Authorization header');
    return new Response('Missing Authorization header', { status: 401 });
  }

  // Internal batch sync calls are trusted if they carry either:
  //   • CRON_SECRET  — used by mosque-website-batch-sync Edge Function
  //   • SUPABASE_SERVICE_ROLE_KEY — used by the GitHub Actions Python scraper
  // Both are server-side secrets never exposed to the client.
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const isBatchCall =
    req.headers.get('X-Batch-Sync') === 'true' &&
    (
      (!!cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (!!serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`)
    );

  let callerUserId: string | null = null;

  if (!isBatchCall) {
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      console.log('[parse-mosque-website] auth failed', authError?.message);
      return new Response('Unauthorized', { status: 401 });
    }
    callerUserId = user.id;
    console.log('[parse-mosque-website] caller user id', user.id);
  } else {
    console.log('[parse-mosque-website] internal batch call — skipping user auth');
  }

  // ── 2. Parse request ──────────────────────────────────────────────────────
  const { url, mosqueId, force = false, scope = 'all', prerenderedHtml = '' } = await req.json();
  // scope: 'times' — prayer/jummah only (skip all event tiers)
  //        'events' — events only (skip iqama/jummah tiers)
  //        'all'   — everything (default)
  if (!url || !mosqueId) {
    return new Response('Missing url or mosqueId', { status: 400 });
  }

  // ── 3. Auth check: caller must own this mosque, be admin, or be batch call ─
  const { data: mosque } = await supabase
    .from('mosques')
    .select('id, owner_id, name, website_location, lat, lng, events_url')
    .eq('id', mosqueId)
    .maybeSingle();

  if (!mosque) return new Response('Mosque not found', { status: 404 });

  if (!isBatchCall && callerUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', callerUserId)
      .maybeSingle();

    if (mosque.owner_id !== callerUserId && !profile?.is_admin) {
      console.log('[parse-mosque-website] forbidden for user', callerUserId);
      return new Response('Forbidden', { status: 403 });
    }
  }

  // ── 4. Run detection pipeline ─────────────────────────────────────────────
  const result: SyncResult = {
    iqama_times: null,
    jummah_sessions: [],
    events: [],
    sources: [],
    notes: null,
    calendarTimezone: null,
  };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  // Tier 1: Mawaqit
  if (scope !== 'events' && parsedUrl.hostname.includes('mawaqit.net')) {
    try {
      await tryMawaqit(url, result);
    } catch (e: any) {
      console.log('[parse-mosque-website] Mawaqit failed:', e.message);
    }
  }

  // Tiers 2–4 need the raw HTML (fetched once, reused).
  // If the caller (e.g. the Python scraper) already rendered the page with a
  // real browser and passed the HTML in, use that directly — avoids a second
  // fetch and bypasses bot-detection that would block the Edge Function.
  let html = prerenderedHtml || '';
  if (!html) {
    try {
      const htmlRes = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (htmlRes.ok) {
        html = await htmlRes.text();
        console.log('[parse-mosque-website] HTML fetched, length:', html.length);
      }
    } catch (e: any) {
      console.log('[parse-mosque-website] HTML fetch failed:', e.message);
    }
  } else {
    console.log('[parse-mosque-website] using pre-rendered HTML from caller, length:', html.length);
  }

  // Follow same-origin iframes (e.g. a prayer-time widget uploaded as its own
  // HTML file and embedded via <iframe>) — everything below treats their
  // content as additional input alongside the main page's.
  const iframeUrls = html ? findIframeUrls(html, url) : [];
  const iframeHtmlByUrl = new Map<string, string>();
  for (const iframeUrl of iframeUrls) {
    try {
      const res = await fetch(iframeUrl, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const iframeHtml = await res.text();
      iframeHtmlByUrl.set(iframeUrl, iframeHtml);
      console.log('[parse-mosque-website] iframe fetched:', iframeUrl, 'length:', iframeHtml.length);
    } catch (e: any) {
      console.log('[parse-mosque-website] iframe fetch failed:', iframeUrl, e.message);
    }
  }
  // If the mosque owner provided a separate events/programs URL, fetch it and
  // include it as an additional HTML block so all event tiers (JSON-LD, iCal,
  // platform links, etc.) can process it automatically.
  const eventsUrlField: string | null = (mosque as any).events_url ?? null;
  let eventsHtml = '';
  if (eventsUrlField) {
    try {
      const evRes = await fetch(eventsUrlField, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (evRes.ok) {
        eventsHtml = await evRes.text();
        console.log('[parse-mosque-website] events_url fetched:', eventsUrlField, 'length:', eventsHtml.length);
      }
    } catch (e: any) {
      console.log('[parse-mosque-website] events_url fetch failed:', eventsUrlField, e.message);
    }
  }

  const htmlBlocks = [
    ...(html ? [html] : []),
    ...iframeHtmlByUrl.values(),
    ...(eventsHtml ? [eventsHtml] : []),
  ];

  // ── 4b. Change detection — hash cleaned content ───────────────────────────
  // Strip scripts/styles/tags from all fetched HTML, concatenate, and hash.
  // If the hash matches the cached value, return the cached result immediately
  // at zero parsing cost.
  const combinedCleanedText = htmlBlocks.map(stripHtml).join('\n').trim();
  const contentHash = combinedCleanedText.length > 0 ? await sha256Hex(combinedCleanedText) : '';

  // Holds previous cache row — used both for cache-hit detection and for
  // preserving fields not covered by the current scope on write-back.
  let previousCache: any = null;

  if (contentHash) {
    const { data: cached } = await supabase
      .from('mosque_sync_cache')
      .select('content_hash, extracted_data_json, extraction_method, confidence, needs_review, review_status')
      .eq('mosque_id', mosqueId)
      .maybeSingle();

    previousCache = cached;

    if (!force && cached && cached.content_hash === contentHash) {
      console.log('[parse-mosque-website] cache hit — content unchanged, returning cached result');
      await supabase
        .from('mosque_sync_cache')
        .update({ last_checked_at: new Date().toISOString() })
        .eq('mosque_id', mosqueId);

      const cachedResult = cached.extracted_data_json as SyncResult;
      return new Response(
        JSON.stringify({ ...cachedResult, _cacheStatus: 'cached', _extractionMethod: 'cached' }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    console.log('[parse-mosque-website] content changed or no cache, running full pipeline');
  }

  // Tier 1b: Masjidal — a mosque either links directly to a Masjidal widget
  // URL as "their website," or embeds one on their own site (caught above as
  // an iframe); either way it carries a masjid_id query param.
  if (scope !== 'events' && !result.iqama_times) {
    const masjidId = findMasjidalId([url, ...iframeUrls]);
    if (masjidId) {
      try {
        await tryMasjidal(masjidId, result);
      } catch (e: any) {
        console.log('[parse-mosque-website] Masjidal failed:', e.message);
      }
    }
  }

  // Tier 1d: Masjidi/UmmahSoft — detect the masjid_id from the JS widget script
  // embedded in the page HTML and fetch the widget directly.
  if (scope !== 'events' && !result.iqama_times) {
    const masjidiId = findMasjidiId(url, htmlBlocks);
    if (masjidiId) {
      try {
        await tryMasjidi(masjidiId, result);
      } catch (e: any) {
        console.log('[parse-mosque-website] Masjidi failed:', e.message);
      }
    }
  }

  // Tier 1f: AthanPlus — scan raw HTML text for widget URL (works on Google Sites
  // where the iframe URL is encoded in JSON config, not a plain <iframe src>).
  if (scope !== 'events' && !result.iqama_times) {
    const athanPlusId = findAthanPlusId(htmlBlocks);
    if (athanPlusId) {
      try {
        await tryAthanPlus(athanPlusId, result);
      } catch (e: any) {
        console.log('[parse-mosque-website] AthanPlus failed:', e.message);
      }
    }
  }

  // Tier 1c: embedded Google Sheets CSV schedule (main page + iframes) — needs
  // the raw HTML/JS text, not a stripped version, since the CSV URL lives
  // inside a <script> block.
  if (scope !== 'events' && !result.iqama_times) {
    const csvUrl = findGoogleSheetCsvUrl(htmlBlocks);
    if (csvUrl) {
      try {
        await tryGoogleSheetSchedule(csvUrl, result, (mosque as any).lat, (mosque as any).lng);
      } catch (e: any) {
        console.log('[parse-mosque-website] Google Sheet CSV failed:', e.message);
      }
    }
  }

  if (htmlBlocks.length > 0) {
    // Tier 1e: HTML table prayer parser — runs before stripHtml so row structure is intact.
    // Catches WordPress prayer-time plugins and any site with a standard Iqamah-column table.
    if (scope !== 'events' && !result.iqama_times) {
      for (const block of htmlBlocks) {
        const tableResult = extractIqamaFromHtmlTable(block);
        if (tableResult) {
          result.iqama_times = tableResult;
          if (!result.sources.includes('website')) result.sources.push('website');
          console.log('[parse-mosque-website] Tier 1e: HTML table parser found iqama times');
          break;
        }
      }
    }

    if (scope !== 'times') {
    // Tockify: extract events from window.tkf bootdata in <script> tags.
    // Runs on all HTML blocks including the events_url page.
    const tockifyEvents = htmlBlocks.flatMap(extractTockifyEvents);
    if (tockifyEvents.length > 0) {
      result.events.push(...tockifyEvents);
      if (!result.sources.includes('tockify')) result.sources.push('tockify');
    }

    // Tier 2 (pre-pass): iCal feed — run first so X-WR-TIMEZONE is available for JSON-LD below.
    // Bare local datetimes in JSON-LD (no tz offset) are mis-stored as UTC without this,
    // producing a 7-hour error for US Pacific mosques. The iCal feed from WordPress Events
    // Calendar sets X-WR-TIMEZONE, which tryIcalFeed() stores in result.calendarTimezone.
    try {
      await tryIcalFeed(parsedUrl.origin, result);
    } catch (e: any) {
      console.log('[parse-mosque-website] iCal failed:', e.message);
    }

    // If ICS didn't give us a timezone, try extracting one directly from the page HTML.
    // "The Events Calendar" (tribe) and similar WordPress plugins embed the site timezone
    // in their localized JS config blocks. Without this, bare local datetimes in JSON-LD
    // get stored as UTC — a 7-hour error for US Pacific mosques like MCA Bay Area.
    if (!result.calendarTimezone) {
      for (const block of htmlBlocks) {
        const tz = extractTimezoneFromHtml(block);
        if (tz) { result.calendarTimezone = tz; break; }
      }
    }

    // Fallback: WordPress REST API — public, no auth, works even with Divi/JS-heavy themes.
    // Returns timezone_string (IANA name) directly from WordPress site settings.
    if (!result.calendarTimezone) {
      result.calendarTimezone = await lookupTimezoneFromWordPressApi(parsedUrl.origin);
    }

    // Last resort: coordinate lookup via BigDataCloud.
    if (!result.calendarTimezone) {
      const rawLat = (mosque as any).lat;
      const rawLng = (mosque as any).lng;
      // Accept both number and numeric string (Supabase sometimes returns text columns)
      const lat = typeof rawLat === 'number' ? rawLat : typeof rawLat === 'string' ? parseFloat(rawLat) : NaN;
      const lng = typeof rawLng === 'number' ? rawLng : typeof rawLng === 'string' ? parseFloat(rawLng) : NaN;
      console.log('[parse-mosque-website] coordinate lookup: lat=', lat, 'lng=', lng);
      if (isFinite(lat) && isFinite(lng)) {
        result.calendarTimezone = await lookupTimezoneByCoords(lat, lng);
      } else {
        console.log('[parse-mosque-website] skipping coordinate lookup — no valid lat/lng on mosque row');
      }
    }
    console.log('[parse-mosque-website] calendarTimezone going into JSON-LD extraction:', result.calendarTimezone ?? 'null');

    // Tier 2: JSON-LD (main page + any iframes) — uses result.calendarTimezone if set above
    try {
      const jsonLdEvents = htmlBlocks.flatMap(b => extractJsonLdEvents(b, result.calendarTimezone));
      if (jsonLdEvents.length > 0) {
        result.events.push(...jsonLdEvents);
        result.sources.push('json-ld');
        console.log('[parse-mosque-website] JSON-LD: found', jsonLdEvents.length, 'events');
      }
    } catch (e: any) {
      console.log('[parse-mosque-website] JSON-LD failed:', e.message);
    }

    // Post-fix: WordPress "UTC-as-local display" bug.
    // When a WordPress site was originally configured with UTC timezone and admins entered
    // event times as local (e.g. "10:00 AM PDT"), those times were stored as UTC values
    // (10:00 UTC). If the site timezone was later changed to America/Los_Angeles, "The Events
    // Calendar" correctly converts stored UTC to local for JSON-LD (10:00 UTC → 03:00 PDT,
    // outputting "03:00:00-07:00"), but the website's display code still renders the raw
    // stored UTC value as "10:00 AM" — so the website looks right to the admin but the
    // JSON-LD is now 7 hours off from what was intended.
    //
    // Detection: if calendarTimezone is known and ANY json-ld event lands in pre-dawn hours
    // (0–5 AM local) — extremely unusual for mosque/community events — assume this bug.
    // Fix: take the UTC value and re-interpret it as the intended local time.
    if (result.calendarTimezone) {
      const getLocalHour = (isoUtc: string, tz: string): number => {
        try {
          const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
            .format(new Date(isoUtc));
          const n = parseInt(h === '24' ? '0' : h);
          return isNaN(n) ? -1 : n;
        } catch { return -1; }
      };

      const jsonLdOnly = result.events.filter(ev => ev.source === 'json-ld' && ev.event_start);
      const hasPreDawn = jsonLdOnly.some(ev => {
        const h = getLocalHour(ev.event_start!, result.calendarTimezone!);
        return h >= 0 && h < 6;
      });

      if (hasPreDawn) {
        console.log('[parse-mosque-website] Detected WordPress UTC-as-local bug — re-interpreting json-ld times as local in', result.calendarTimezone);
        for (const ev of result.events) {
          if (ev.source !== 'json-ld' || !ev.event_start) continue;
          // Strip trailing Z / offset to get the bare UTC digits, then treat as local
          const bareUtcStart = ev.event_start.replace(/\.\d{3}Z$|Z$/, '').slice(0, 19);
          try {
            ev.event_start = icsLocalToUTC(bareUtcStart, result.calendarTimezone!);
            ev.confidence = Math.min(ev.confidence, 0.7);
            ev.needs_review = true;
          } catch { /* keep original */ }
          if (ev.event_end) {
            const bareUtcEnd = ev.event_end.replace(/\.\d{3}Z$|Z$/, '').slice(0, 19);
            try { ev.event_end = icsLocalToUTC(bareUtcEnd, result.calendarTimezone!); } catch { }
          }
        }
      }
    }

    // Tier 3: Google Calendar embed (main page + iframes)
    for (const block of htmlBlocks) {
      if (result.events.length > 0) break;
      try {
        await tryGoogleCalendar(block, result);
      } catch (e: any) {
        console.log('[parse-mosque-website] Google Calendar failed:', e.message);
      }
    }
    } // end if (scope !== 'times')
  }

  // Tier 3.5: Event platform links (Eventbrite, Humanitix, etc.)
  // Runs even when JSON-LD/Google Calendar found events, since platform links
  // may carry additional events not listed on the main page.
  if (scope !== 'times' && html) {
    try {
      await tryEventPlatformLinks(html, result);
    } catch (e: any) {
      console.log('[parse-mosque-website] Event platform links failed:', e.message);
    }
  }

  // Tier 4.5: try extracting iqama/jummah straight from iframe HTML text —
  // catches iframes that aren't JS-rendered.
  if (scope !== 'events') for (const iframeHtml of iframeHtmlByUrl.values()) {
    if (!iqamaIsIncomplete(result.iqama_times) && result.jummah_sessions.length > 0) break;
    const text = stripHtml(iframeHtml);
    if (iqamaIsIncomplete(result.iqama_times)) {
      const iqama = extractIqamaFromText(text);
      if (iqama) {
        mergeIqamaTimes(result, iqama);
        if (!result.sources.includes('website')) result.sources.push('website');
        console.log('[parse-mosque-website] iframe HTML: filled iqama slots');
      }
    }
    if (result.jummah_sessions.length === 0) {
      const jummah = extractJummahFromText(text);
      if (jummah.length > 0) {
        result.jummah_sessions = jummah;
        if (!result.sources.includes('website')) result.sources.push('website');
        console.log('[parse-mosque-website] iframe HTML: found', jummah.length, 'jummah sessions');
      }
    }
  }

  // Tier 5: Auto-discover iqama times from common prayer-schedule sub-pages when
  // the main page yielded nothing (e.g. times are on a separate /prayer-times/ page).
  // Fetches raw HTML and runs the table parser + text heuristics directly.
  if (scope !== 'events' && iqamaIsIncomplete(result.iqama_times)) {
    const PRAYER_SUBPATHS = [
      '/prayer-times/', '/prayer-schedule/', '/salah-timetable/',
      '/salah/', '/iqama/', '/iqama-times/', '/schedule/',
      '/prayers/', '/namaz-timings/', '/timings/',
    ];
    for (const path of PRAYER_SUBPATHS) {
      if (!iqamaIsIncomplete(result.iqama_times)) break;
      try {
        const subUrl = `${parsedUrl.origin}${path}`;
        const subRes = await fetch(subUrl, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(8_000),
        });
        if (!subRes.ok) continue;
        const subHtml = await subRes.text();
        // Try structured table first, then plain-text heuristics on stripped HTML
        const tableResult = extractIqamaFromHtmlTable(subHtml);
        if (tableResult) {
          mergeIqamaTimes(result, tableResult);
          if (!result.sources.includes('website')) result.sources.push('website');
          console.log('[parse-mosque-website] Prayer sub-page table hit:', path);
          break;
        }
        const subText = stripHtml(subHtml);
        const iqama = extractIqamaFromText(subText);
        if (iqama && Object.values(iqama).some(Boolean)) {
          mergeIqamaTimes(result, iqama);
          if (!result.sources.includes('website')) result.sources.push('website');
          console.log('[parse-mosque-website] Prayer sub-page text hit:', path);
          break;
        }
      } catch { /* try next */ }
    }
  }

  if (scope !== 'times') {
  // Auto-discover events from common sub-pages if none found yet
  if (result.events.length === 0) {
    try {
      await tryEventSubpages(parsedUrl.origin, result);
    } catch (e: any) {
      console.log('[parse-mosque-website] Event subpage discovery failed:', e.message);
    }
  }

  // Auto-categorize events that have no categories yet (keyword match on title + body).
  // Returns ALL matching tags so e.g. "Kids Tafsir Club" gets ['youth', 'quran'].
  result.events = result.events.map(e => ({
    ...e,
    categories: e.categories.length > 0 ? e.categories : categorizeEvent(e.title, e.body),
  }));

  // Deduplicate events across tiers
  result.events = dedupeEvents(result.events);
  } // end if (scope !== 'times')

  // Tier 6: Vision-based event extraction from image flyers
  // Controlled server-side via LLM_VISION_ENABLED env var (default: on).
  // tryVisionEventExtraction has its own guards (Anthropic-only, image candidates required).
  let visionInputTokens = 0;
  let visionOutputTokens = 0;
  let visionCost = 0;
  if (scope !== 'times' && html) {
    try {
      const visionResult = await tryVisionEventExtraction(html, url, result);
      visionInputTokens  = visionResult.totalInputTokens;
      visionOutputTokens = visionResult.totalOutputTokens;
      visionCost         = visionResult.totalCost;
      if (visionResult.totalInputTokens > 0) {
        // Categorize any new vision events, then deduplicate
        result.events = result.events.map(e => ({
          ...e,
          categories: e.categories.length > 0 ? e.categories : categorizeEvent(e.title, e.body),
        }));
        result.events = dedupeEvents(result.events);
      }
    } catch (e: any) {
      console.log('[parse-mosque-website] Tier 6 vision failed:', e.message);
    }
  }

  if (result.sources.length === 0 && !result.iqama_times) {
    result.notes = 'No machine-readable data found on this website. Enter details manually below.';
  }

  // ── LLM fallback ──────────────────────────────────────────────────────────
  // Triggered when deterministic parsing yields low confidence (≤2 prayers found).
  let extractionMethod: 'deterministic' | 'llm_fallback' = 'deterministic';
  let llmInputTokens: number | null = null;
  let llmOutputTokens: number | null = null;
  let llmCost: number | null = null;
  let llmModel: string | null = null;
  const syncWarnings: string[] = [];

  const deterministicConfidence = evaluateConfidence(result);

  if (scope !== 'events' && deterministicConfidence === 'low' && LLM_ENABLED && LLM_API_KEY && combinedCleanedText.length > 100) {
    console.log('[parse-mosque-website] deterministic confidence=low, trying LLM fallback');
    try {
      // Pass website_location if set, otherwise fall back to the mosque name.
      // This lets the LLM pick the right section on multi-location pages.
      const locationHint = (mosque as any).website_location || (mosque as any).name || null;
      const llm = await tryLlmFallback(combinedCleanedText, url, locationHint);

      // Merge LLM iqama into result — fill only null slots (don't overwrite deterministic hits)
      if (llm.result.iqama_times) {
        mergeIqamaTimes(result, llm.result.iqama_times as Record<string, string | null>);
      }

      // Merge LLM jummah if we have none from deterministic
      if (result.jummah_sessions.length === 0 && llm.result.jummah_sessions?.length) {
        result.jummah_sessions = llm.result.jummah_sessions;
      }

      // Merge LLM events — categorize first, then dedup
      if (llm.result.events?.length) {
        result.events.push(...llm.result.events.map(e => ({
          ...e,
          categories: e.categories?.length > 0 ? e.categories : categorizeEvent(e.title, e.body),
        })));
        result.events = dedupeEvents(result.events);
      }

      if (!result.sources.includes('llm_fallback')) result.sources.push('llm_fallback');
      extractionMethod = 'llm_fallback';
      llmInputTokens = llm.inputTokens;
      llmOutputTokens = llm.outputTokens;
      llmCost = llm.estimatedCost;
      llmModel = llm.modelUsed;
      syncWarnings.push(...llm.warnings);
    } catch (e: any) {
      console.log('[parse-mosque-website] LLM fallback failed:', e.message);
      syncWarnings.push(`LLM fallback failed: ${e.message}`);
    }
  }

  // ── Preserve fields not covered by the current scope ─────────────────────
  // When running a scoped sync, merge the fields we deliberately skipped from
  // the previous cache row so the stored result always remains complete.
  if (previousCache?.extracted_data_json) {
    if (scope === 'times') {
      // Ran times tiers only — restore cached events
      result.events = previousCache.extracted_data_json.events ?? [];
    } else if (scope === 'events') {
      // Ran event tiers only — restore cached iqama + jummah
      result.iqama_times     = previousCache.extracted_data_json.iqama_times     ?? null;
      result.jummah_sessions = previousCache.extracted_data_json.jummah_sessions ?? [];
    }
  }

  // ── Write to mosque_sync_cache ────────────────────────────────────────────
  if (contentHash) {
    const finalConfidence = evaluateConfidence(result);
    const needsReview =
      finalConfidence === 'low' ||
      extractionMethod === 'llm_fallback' ||
      result.events.some(e => e.needs_review);

    try {
      await supabase
        .from('mosque_sync_cache')
        .upsert(
          {
            mosque_id:            mosqueId,
            source_url:           url,
            content_hash:         contentHash,
            extracted_data_json:  result,
            extraction_method:    extractionMethod,
            confidence:           finalConfidence,
            needs_review:         needsReview,
            review_status:        needsReview ? 'pending' : 'approved',
            warnings:             syncWarnings.length ? syncWarnings : null,
            estimated_llm_cost:   ((llmCost ?? 0) + visionCost) || null,
            input_tokens:         ((llmInputTokens ?? 0) + visionInputTokens) || null,
            output_tokens:        ((llmOutputTokens ?? 0) + visionOutputTokens) || null,
            model_used:           llmModel ?? (visionInputTokens > 0 ? LLM_MODEL : null),
            last_checked_at:      new Date().toISOString(),
            last_changed_at:      new Date().toISOString(),
          },
          { onConflict: 'mosque_id' },
        );

      // Update the top-level last_website_sync_at on the mosque row
      await supabase
        .from('mosques')
        .update({ last_website_sync_at: new Date().toISOString() })
        .eq('id', mosqueId);

      console.log('[parse-mosque-website] cache written — method:', extractionMethod, 'confidence:', finalConfidence, 'needs_review:', needsReview);
    } catch (e: any) {
      // Cache write failure is non-fatal — still return the parsed result
      console.log('[parse-mosque-website] cache write failed:', e.message);
    }
  }

  console.log('[parse-mosque-website] done — sources:', result.sources, 'events:', result.events.length);

  return new Response(
    JSON.stringify({ ...result, _extractionMethod: extractionMethod }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
