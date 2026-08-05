/**
 * scripts/import-shariah-board.mjs
 *
 * Imports Shariah Board / HMS certified listings into Supabase.
 * Only imports restaurant-type categories — skips slaughterhouses,
 * processors, distributors, etc.
 *
 * Run after: node scripts/scrape-shariah-board.mjs
 *
 * Usage: node scripts/import-shariah-board.mjs [--all] [--dry-run]
 *   --all      also import Misc, Caterers, Retail Store (not just Restaurants)
 *   --dry-run  print rows without inserting
 */

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const DRY_RUN      = process.argv.includes('--dry-run');
const INCLUDE_ALL  = process.argv.includes('--all');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── category filter ──────────────────────────────────────────────────────────
// Only import food-service businesses by default.
const RESTAURANT_CATEGORIES = new Set([
  'Restaurants',
  'Misc',
  'Caterers',
  'Retail Store',
]);

const SKIP_CATEGORIES = new Set([
  'Slaughter House',
  'Processors',
  'Distributor',
  'Further Processor',
]);

// ─── cuisine guesser ─────────────────────────────────────────────────────────

function guessCuisine(name = '', category = '') {
  const t = `${name} ${category}`.toLowerCase();
  if (/pizza|italian/i.test(t))                        return 'Italian';
  if (/burger|american|bbq|grill|wings|fried chicken/i.test(t)) return 'American';
  if (/chinese|wok|dim sum|panda/i.test(t))            return 'Chinese';
  if (/indian|curry|biryani|desi|masala|tandoor/i.test(t)) return 'Indian';
  if (/pakistani/i.test(t))                            return 'Pakistani';
  if (/mediterranean|greek|falafel|shawarma|gyro/i.test(t)) return 'Mediterranean';
  if (/turkish|kebab|kabob/i.test(t))                  return 'Turkish';
  if (/mexican|taco|burrito|quesadilla/i.test(t))      return 'Mexican';
  if (/thai/i.test(t))                                 return 'Thai';
  if (/sushi|japanese/i.test(t))                       return 'Japanese';
  if (/korean/i.test(t))                               return 'Korean';
  if (/african|ethiopian|somali|nigerian/i.test(t))    return 'African';
  if (/arabic|yemeni|lebanese|arab/i.test(t))          return 'Middle Eastern';
  if (/bengali|bangladeshi/i.test(t))                  return 'Bangladeshi';
  if (/bakery|bread|pastry|sweets|mithai/i.test(t))    return 'Bakery';
  if (/cafe|coffee|tea/i.test(t))                      return 'Cafe';
  if (/seafood|fish/i.test(t))                         return 'Seafood';
  if (/catering|caterer/i.test(category.toLowerCase())) return 'Catering';
  if (/retail|grocery|market/i.test(category.toLowerCase())) return 'Grocery / Butcher';
  return 'Halal Restaurant';
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  const inputPath = 'scripts/shariah-board-listings.json';
  if (!fs.existsSync(inputPath)) {
    console.error(`${inputPath} not found — run scrape-shariah-board.mjs first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  console.log(`Loaded ${raw.length} listings from ${inputPath}`);

  // Filter by category
  const filtered = raw.filter(l => {
    if (SKIP_CATEGORIES.has(l.category)) return false;
    if (INCLUDE_ALL) return true;
    return RESTAURANT_CATEGORIES.has(l.category);
  });

  // Filter out non-active status
  const active = filtered.filter(l => {
    const s = (l.status ?? '').toLowerCase();
    return s === 'certified' || s === 'active' || s === '';
  });

  const skippedCategory = raw.length - filtered.length;
  const skippedStatus   = filtered.length - active.length;
  console.log(`Filtered out: ${skippedCategory} non-restaurant categories, ${skippedStatus} expired/inactive`);
  console.log(`Importing: ${active.length} listings`);

  // Category breakdown
  const catCounts = {};
  for (const l of active) catCounts[l.category] = (catCounts[l.category] ?? 0) + 1;
  console.log('Category breakdown:', catCounts);

  // Map to restaurants table schema
  const rows = active.map(l => ({
    name:              l.name?.trim() || 'Unknown',
    address:           l.address?.trim() || null,
    cuisine_type:      guessCuisine(l.name, l.category),
    primary_certifier: 'HMS',
    certifiers:        ['HMS'],
    is_verified:       true,
    phone:             l.phone || null,
    website:           l.website || null,
    lat:               l.lat ?? null,
    lng:               l.lng ?? null,
    zabihah_status:    'full',  // HMS / Shariah Board requires hand-slaughter
    status:            'approved',
  }));

  // Deduplicate by name + address
  const seen = new Set();
  const deduped = rows.filter(r => {
    const key = `${r.name}|${r.address}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`After deduplication: ${deduped.length} rows`);

  if (DRY_RUN) {
    console.log('\n── DRY RUN — first 10 rows ──');
    deduped.slice(0, 10).forEach(r =>
      console.log(`  ${r.name} | ${r.address} | ${r.cuisine_type} | lat:${r.lat ?? 'none'}`)
    );
    console.log(`\n(${deduped.length} total rows — remove --dry-run to insert)`);
    return;
  }

  // Insert in batches of 50
  let inserted = 0;
  let errors   = 0;
  const BATCH  = 50;

  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH);
    const { error } = await supabase
      .from('restaurants')
      .insert(batch);

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`\rInserted ${inserted}/${deduped.length}...`);
    }
  }

  console.log('\n\n────────────────────────────────────────');
  console.log(`Done.`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  With coords: ${deduped.filter(r => r.lat).length}/${deduped.length}`);
}

run().catch(err => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
