#!/usr/bin/env python3
"""
Mosque website scraper — runs as a GitHub Actions cron job.

For each mosque with a website:
  1. Try a plain requests.get() with real browser headers (fast, lightweight)
  2. If that returns 403 or sparse HTML, fall back to Playwright (headless Chrome)
     to render the page as a real browser would
  3. POST the HTML to the parse-mosque-website Edge Function, which runs all
     existing parsing tiers (Mawaqit API, table parser, JSON-LD, LLM, etc.)

Environment variables (set as GitHub Actions secrets):
  SUPABASE_URL         — https://<project>.supabase.co
  SUPABASE_SERVICE_KEY — service role key (admin access)
  CRON_SECRET          — matches CRON_SECRET in Edge Function secrets
  SYNC_SCOPE           — 'times' | 'events' | 'all' (default: 'times')
"""

import os
import sys
import time
import json
import requests
from supabase import create_client

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_SERVICE_KEY = os.environ['SUPABASE_SERVICE_KEY']
PARSE_FN_URL = f"{SUPABASE_URL}/functions/v1/parse-mosque-website"
SCOPE = os.environ.get('SYNC_SCOPE', 'times')

# Minimum chars of stripped HTML to consider a fetch successful.
# Below this threshold we assume the page is JS-rendered and try Playwright.
MIN_HTML_LENGTH = 2_000

# Polite delay between mosque syncs (seconds)
DELAY_BETWEEN = 2

BROWSER_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}


def fetch_html_simple(url: str) -> str | None:
    """Plain HTTP fetch with browser headers. Returns HTML or None on failure."""
    try:
        r = requests.get(url, headers=BROWSER_HEADERS, timeout=15, allow_redirects=True)
        if r.status_code == 200:
            text = r.text.strip()
            if len(text) >= MIN_HTML_LENGTH:
                return text
            print(f'    simple fetch: sparse HTML ({len(text)} chars), will try Playwright')
        else:
            print(f'    simple fetch: HTTP {r.status_code}, will try Playwright')
    except Exception as e:
        print(f'    simple fetch: error ({e}), will try Playwright')
    return None


def fetch_html_playwright(url: str) -> str | None:
    """Headless Chrome via Playwright. Handles JS-rendered pages and most 403s."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('    Playwright not installed — skipping browser fallback')
        return None

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--no-sandbox'])
            context = browser.new_context(
                user_agent=BROWSER_HEADERS['User-Agent'],
                extra_http_headers={
                    'Accept-Language': BROWSER_HEADERS['Accept-Language'],
                },
            )
            page = context.new_page()
            page.goto(url, wait_until='networkidle', timeout=30_000)
            html = page.content()
            browser.close()
            print(f'    Playwright: rendered {len(html)} chars')
            return html if len(html) >= MIN_HTML_LENGTH else None
    except Exception as e:
        print(f'    Playwright: failed ({e})')
        return None


def sync_mosque(mosque_id: str, url: str) -> dict:
    """Fetch HTML and send to the parse-mosque-website Edge Function."""
    html = fetch_html_simple(url) or fetch_html_playwright(url) or ''

    resp = requests.post(
        PARSE_FN_URL,
        headers={
            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
            'Content-Type': 'application/json',
            'X-Batch-Sync': 'true',
        },
        json={
            'url': url,
            'mosqueId': mosque_id,
            'scope': SCOPE,
            'prerenderedHtml': html,
        },
        timeout=90,
    )
    resp.raise_for_status()
    return resp.json()


def main():
    print(f'Mosque scraper starting — scope: {SCOPE}')

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    result = (
        supabase.table('mosques')
        .select('id, name, website')
        .not_.is_('website', 'null')
        .order('name')
        .execute()
    )
    mosques = result.data or []
    print(f'Found {len(mosques)} mosques with websites\n')

    summary = {'total': len(mosques), 'synced': 0, 'failed': 0, 'errors': []}

    for mosque in mosques:
        if not mosque.get('website'):
            continue

        name = mosque['name']
        print(f'Syncing: {name}')
        try:
            data = sync_mosque(mosque['id'], mosque['website'])
            method = data.get('_extractionMethod', 'unknown')
            iqama = data.get('iqama_times')
            jummah_count = len(data.get('jummah_sessions') or [])
            events_count = len(data.get('events') or [])
            print(f'  → {method} | iqama: {"yes" if iqama else "none"} | jummah: {jummah_count} | events: {events_count}')
            summary['synced'] += 1
        except Exception as e:
            print(f'  → FAILED: {e}')
            summary['failed'] += 1
            summary['errors'].append({'name': name, 'error': str(e)})

        time.sleep(DELAY_BETWEEN)

    print(f'\nDone. {summary["synced"]} synced, {summary["failed"]} failed.')
    if summary['errors']:
        print('Failures:')
        for err in summary['errors']:
            print(f'  {err["name"]}: {err["error"]}')

    if summary['failed'] > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
