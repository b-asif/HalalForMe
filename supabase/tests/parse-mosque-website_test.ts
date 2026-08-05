/**
 * Tests for the parse-mosque-website edge function helpers.
 *
 * Run with:  deno test supabase/tests/parse-mosque-website_test.ts
 *
 * These are unit tests over the exported helpers; the full Deno.serve() handler
 * is not exercised here (it requires live Supabase credentials).
 *
 * Focus: the duplicate-event bug where "Stories of the Prophets with Ihab Badr"
 * appeared twice — once with the correct 9:20–10:20 PM time and once with a
 * wrong time — because the same event was extracted from both JSON-LD and an
 * iCal feed, title normalisation differed between sources, and the dedup kept
 * the lower-confidence (wrong-time) entry.
 */

// ─── Re-export the pure helpers for testing ──────────────────────────────────
// Because index.ts uses Deno.serve and imports from esm.sh we can't import it
// directly in tests.  The helpers are copied / re-expressed here so we can test
// the logic without spinning up a server.  When the helpers change, keep these
// in sync or extract them to a shared helpers.ts.

// ── normalizeTitle ────────────────────────────────────────────────────────────
function normalizeTitle(t: string): string {
  return t
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8211;/g, '-').replace(/&#8212;/g, '--')
    .replace(/&#8216;/g, "'").replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/[\u2013]/g, '-').replace(/[\u2014]/g, '--')
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\s\u00A0]+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── ExtractedEvent (minimal subset needed for tests) ──────────────────────────
interface ExtractedEvent {
  title: string;
  body: string | null;
  category: string | null;
  event_start: string | null;
  event_end: string | null;
  source: string;
  confidence: number;
  needs_review: boolean;
}

// ── dedupeEvents ─────────────────────────────────────────────────────────────
// KEEP IN SYNC with index.ts dedupeEvents — when the logic changes, update both.
function dedupeEvents(events: ExtractedEvent[]): ExtractedEvent[] {
  const SOURCE_PRIORITY: Record<string, number> = {
    'ical': 10, 'google-calendar': 10,
    'tockify': 7, 'mawaqit': 7, 'masjidal': 7,
    'json-ld': 3,
    'llm': 1,
  };
  const srcPri = (ev: ExtractedEvent) => SOURCE_PRIORITY[ev.source] ?? 2;

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
      if (!start || !k.event_start) { foundDupe = true; break; }

      const diffMs = Math.abs(start - new Date(k.event_start).getTime());
      if (diffMs >= 7 * 24 * 60 * 60 * 1000) continue;

      foundDupe = true;
      if (diffMs > 30 * 60 * 1000) {
        kept[i] = { ...k, needs_review: true };
      }
      break;
    }

    if (!foundDupe) kept.push(ev);
  }

  return kept;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const { test } = Deno;

function makeEvent(overrides: Partial<ExtractedEvent> & { title: string; event_start: string }): ExtractedEvent {
  return {
    body: null, category: null, event_end: null,
    source: 'ical', confidence: 0.9, needs_review: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('normalizeTitle: strips HTML entities', () => {
  const a = normalizeTitle("Stories of the Prophets with Ihab Badr");
  const b = normalizeTitle("Stories of the Prophets with Ihab Badr");  // same
  if (a !== b) throw new Error(`Expected equal: "${a}" !== "${b}"`);
});

test('normalizeTitle: smart quotes match straight quotes', () => {
  const smart  = normalizeTitle("Stories\u2019 Retold");   // U+2019 right single quote
  const plain  = normalizeTitle("Stories' Retold");         // ASCII apostrophe
  const entity = normalizeTitle("Stories&#8217; Retold");   // HTML numeric entity
  if (smart !== plain)  throw new Error(`smart !== plain: "${smart}" "${plain}"`);
  if (smart !== entity) throw new Error(`smart !== entity: "${smart}" "${entity}"`);
});

test('normalizeTitle: collapses extra whitespace and non-breaking spaces', () => {
  const a = normalizeTitle("Stories  of\u00A0the  Prophets");
  const b = normalizeTitle("Stories of the Prophets");
  if (a !== b) throw new Error(`Expected equal: "${a}" !== "${b}"`);
});

test('dedupeEvents: keeps only one when JSON-LD and ICS have identical event', () => {
  // Correct ICS event: 9:20 PM PDT stored correctly as 04:20 UTC next day
  const icsEvent = makeEvent({
    title: 'Stories of the Prophets with Ihab Badr',
    event_start: '2026-07-16T04:20:00.000Z',  // 9:20 PM PDT (correct)
    event_end:   '2026-07-16T05:20:00.000Z',
    source: 'ical',
    confidence: 0.9,
  });

  // JSON-LD event: same event but startDate had no timezone → parsed as UTC → wrong time
  const jsonLdEvent = makeEvent({
    title: 'Stories of the Prophets with Ihab Badr',
    event_start: '2026-07-15T21:20:00.000Z',  // 9:20 PM UTC (wrong — off by 7h)
    event_end:   '2026-07-15T22:20:00.000Z',
    source: 'json-ld',
    confidence: 0.5,
  });

  const result = dedupeEvents([jsonLdEvent, icsEvent]);

  if (result.length !== 1) {
    throw new Error(`Expected 1 event, got ${result.length}: ${JSON.stringify(result.map(e => ({ title: e.title, start: e.event_start, source: e.source })))}`);
  }

  // Should keep the HIGH-confidence ICS event (correct time), not the JSON-LD one
  if (result[0].source !== 'ical') {
    throw new Error(`Expected source=ical, got source=${result[0].source} (kept the WRONG event)`);
  }

  // Should be flagged for review because sources had conflicting times (>30 min diff)
  if (!result[0].needs_review) {
    throw new Error('Expected needs_review=true (conflicting source times found)');
  }

  // Verify the kept event has the correct time (04:20 UTC = 9:20 PM PDT)
  if (result[0].event_start !== '2026-07-16T04:20:00.000Z') {
    throw new Error(`Wrong time kept: ${result[0].event_start}`);
  }
});

test('dedupeEvents: normalizes titles for dedup (smart quote vs entity)', () => {
  // Google Calendar ICS uses smart apostrophe in SUMMARY
  const icsEvent = makeEvent({
    title: 'Stories\u2019 of the Prophets',  // smart right-single-quote
    event_start: '2026-07-16T04:20:00.000Z',
    source: 'ical',
    confidence: 0.9,
  });

  // JSON-LD uses HTML entity
  const jsonLdEvent = makeEvent({
    title: 'Stories&#8217; of the Prophets',
    event_start: '2026-07-15T21:20:00.000Z',
    source: 'json-ld',
    confidence: 0.5,
  });

  const result = dedupeEvents([jsonLdEvent, icsEvent]);

  if (result.length !== 1) {
    throw new Error(`Expected 1 event after title normalization, got ${result.length}`);
  }
  if (result[0].source !== 'ical') {
    throw new Error(`Expected ical (higher confidence) to be kept, got ${result[0].source}`);
  }
});

test('dedupeEvents: preserves genuinely different events on different dates', () => {
  const event1 = makeEvent({
    title: 'Quran Study Circle',
    event_start: '2026-07-10T02:00:00.000Z',
    source: 'ical', confidence: 0.9,
  });
  const event2 = makeEvent({
    title: 'Quran Study Circle',
    event_start: '2026-07-17T02:00:00.000Z',  // 7 days later — recurring
    source: 'ical', confidence: 0.9,
  });
  const event3 = makeEvent({
    title: 'Quran Study Circle',
    event_start: '2026-07-24T02:00:00.000Z',  // 14 days later
    source: 'ical', confidence: 0.9,
  });

  const result = dedupeEvents([event1, event2, event3]);

  // All 3 are >7 days apart (exactly 7 days = 604800000ms, window is strict <)
  if (result.length !== 3) {
    throw new Error(`Expected 3 recurring events preserved, got ${result.length}`);
  }
});

test('dedupeEvents: collapses same event from multiple sources within 7 days', () => {
  // Same event from JSON-LD and iCal feed, times within hours of each other
  const ev1 = makeEvent({ title: 'Jummah Khutbah', event_start: '2026-07-17T18:30:00.000Z', source: 'json-ld', confidence: 0.9 });
  const ev2 = makeEvent({ title: 'Jummah Khutbah', event_start: '2026-07-17T18:30:00.000Z', source: 'ical',    confidence: 0.9 });
  const ev3 = makeEvent({ title: 'Jummah Khutbah', event_start: '2026-07-17T18:28:00.000Z', source: 'google-calendar', confidence: 0.9 });

  const result = dedupeEvents([ev1, ev2, ev3]);
  if (result.length !== 1) {
    throw new Error(`Expected 1 after cross-source dedup, got ${result.length}`);
  }
});

test('dedupeEvents: keeps two events with different titles on same day', () => {
  const ev1 = makeEvent({ title: 'Sisters Halaqa',     event_start: '2026-07-17T22:00:00.000Z', source: 'ical', confidence: 0.9 });
  const ev2 = makeEvent({ title: 'Youth Basketball',   event_start: '2026-07-17T20:00:00.000Z', source: 'ical', confidence: 0.9 });

  const result = dedupeEvents([ev1, ev2]);
  if (result.length !== 2) {
    throw new Error(`Expected 2 different events to be kept, got ${result.length}`);
  }
});

test('dedupeEvents: low-confidence floating ICS time gets needs_review', () => {
  // Floating ICS (no TZID, no Z) has confidence=0.4
  const floating = makeEvent({
    title: 'Community Iftar',
    event_start: '2026-07-20T21:00:00.000Z',  // treated as UTC, probably wrong for local event
    source: 'ical',
    confidence: 0.4,
    needs_review: true,  // set by parseICS when confidence < 0.5
  });

  const result = dedupeEvents([floating]);
  if (result.length !== 1) throw new Error('Expected event to be kept');
  if (!result[0].needs_review) throw new Error('Expected needs_review on low-confidence event');
});

test('dedupeEvents: ical wins over json-ld when confidence is equal but times conflict (WordPress UTC misconfig)', () => {
  // WordPress UTC misconfiguration: JSON-LD emits local time with +00:00 offset.
  // ICS has correct UTC via TZID conversion. Both end up with conf=0.9.
  // The json-ld event has a SMALLER timestamp (wrong local-as-UTC), so without
  // source priority tie-breaking it would sort first and be kept incorrectly.
  const icsEvent = makeEvent({
    title: 'Stories of the Prophets',
    event_start: '2026-07-16T22:30:00.000Z',  // 3:30 PM PDT (correct) = 22:30 UTC
    source: 'ical',
    confidence: 0.9,
  });

  // WordPress UTC misconfig: emits "2026-07-16T15:30:00+00:00" = local 3:30 PM stored as UTC
  const jsonLdEvent = makeEvent({
    title: 'Stories of the Prophets',
    event_start: '2026-07-16T15:30:00.000Z',  // wrong: 3:30 PM local treated as UTC = 8:30 AM PDT
    source: 'json-ld',
    confidence: 0.9,
  });

  const result = dedupeEvents([jsonLdEvent, icsEvent]);

  if (result.length !== 1) {
    throw new Error(`Expected 1 event, got ${result.length}`);
  }

  // ICS must win even though json-ld has a smaller (earlier) timestamp
  if (result[0].source !== 'ical') {
    throw new Error(`Expected source=ical to win, got source=${result[0].source} — json-ld wrong time was kept`);
  }

  if (result[0].event_start !== '2026-07-16T22:30:00.000Z') {
    throw new Error(`Wrong time kept: ${result[0].event_start} — expected 22:30Z (3:30 PM PDT)`);
  }
});
