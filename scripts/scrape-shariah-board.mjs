/**
 * scripts/scrape-shariah-board.mjs
 *
 * Fetches all HMS-certified listings from the Shariah Board AJAX API by
 * running requests inside the browser session (nonce stays valid).
 *
 * Output: scripts/shariah-board-listings.json
 *
 * Usage:  node scripts/scrape-shariah-board.mjs
 * Import: node scripts/import-shariah-board.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrape() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: true });
  const page    = await browser.newPage();

  // Capture the first AJAX request params (action, nonce, etc.)
  let capturedParams = null;
  let ajaxUrl = null;

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().includes('admin-ajax.php') && req.method() === 'POST') {
      if (!capturedParams) {
        ajaxUrl = req.url();
        capturedParams = req.postData() ?? '';
        console.log('Captured AJAX params:', capturedParams.slice(0, 200));
      }
    }
    req.continue();
  });

  console.log('Loading page...');
  await page.goto('https://shariahboard.org/certified-listings/', {
    waitUntil: 'networkidle2',
    timeout:   30000,
  });
  await sleep(2000);

  if (!capturedParams || !ajaxUrl) {
    console.error('Did not capture an AJAX request. Page structure may have changed.');
    await browser.close();
    process.exit(1);
  }

  // Parse params — preserve array fields correctly
  const rawParams = new URLSearchParams(capturedParams);
  const searchFields = rawParams.getAll('search_fields[]');

  // Get total pages from the first response (already loaded in browser)
  const firstResponse = await page.evaluate(async (url, params, fields) => {
    const body = new URLSearchParams(params);
    // Restore array fields
    body.delete('search_fields[]');
    for (const f of fields) body.append('search_fields[]', f);
    body.set('page', '1');
    body.set('per_page', '25');

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return res.json();
  }, ajaxUrl, Object.fromEntries(rawParams), searchFields);

  const { total, total_pages } = firstResponse?.data ?? {};
  console.log(`Total listings: ${total}, total pages: ${total_pages}`);

  if (!total || !total_pages) {
    console.error('Unexpected response shape:', JSON.stringify(firstResponse).slice(0, 300));
    await browser.close();
    process.exit(1);
  }

  const allItems = [...(firstResponse.data.items ?? [])];

  // Fetch remaining pages from inside the browser (session stays valid)
  for (let p = 2; p <= total_pages; p++) {
    process.stdout.write(`Page ${p}/${total_pages}... `);
    await sleep(300);

    const res = await page.evaluate(async (url, params, fields, pageNum) => {
      const body = new URLSearchParams(params);
      body.delete('search_fields[]');
      for (const f of fields) body.append('search_fields[]', f);
      body.set('page', String(pageNum));
      body.set('per_page', '25');

      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      return r.json();
    }, ajaxUrl, Object.fromEntries(rawParams), searchFields, p);

    const items = res?.data?.items ?? [];
    allItems.push(...items);
    console.log(`${items.length} listings (running total: ${allItems.length})`);
  }

  await browser.close();
  console.log(`\nFetched ${allItems.length} / ${total} listings`);

  // ── normalise fields ──────────────────────────────────────────────────────
  const listings = allItems.map(item => {
    let lat = null, lng = null;
    if (item.MapPosition) {
      const parts = item.MapPosition.split(',');
      lat = parseFloat(parts[0]) || null;
      lng = parseFloat(parts[1]) || null;
    }
    return {
      name:     (item.Name || item.BusinessName || '').trim(),
      address:  (item.Address || '').trim(),
      city:     (item.City    || '').trim(),
      state:    (item.State   || '').trim(),
      phone:    (item.Phone   || '').trim() || null,
      website:  (item.Website || '').trim() || null,
      category: (item.Category || '').trim(),
      status:   (item.Status   || '').trim(),
      lat,
      lng,
    };
  }).filter(l => l.name);

  const outPath = 'scripts/shariah-board-listings.json';
  fs.writeFileSync(outPath, JSON.stringify(listings, null, 2));

  const withCoords = listings.filter(l => l.lat).length;
  const categories = [...new Set(listings.map(l => l.category))].filter(Boolean);

  console.log('\n────────────────────────────────────────');
  console.log(`Saved ${listings.length} listings → ${outPath}`);
  console.log(`  With coordinates: ${withCoords}`);
  console.log(`  Without coords:   ${listings.length - withCoords}`);
  console.log(`  Categories: ${categories.join(', ')}`);
  console.log('\nNext: node scripts/import-shariah-board.mjs');
}

scrape().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
