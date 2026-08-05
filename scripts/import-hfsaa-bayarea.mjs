/**
 * scripts/import-hfsaa-bayarea.mjs
 *
 * Imports HFSAA Bay Area certified listings from their Elfsight store-locator
 * widget into the Supabase restaurants table.
 *
 * Deduplication: skips any row whose (name, address) already exists in the DB.
 * Category assignment: inferred from business name keywords.
 *
 * Usage:
 *   node scripts/import-hfsaa-bayarea.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const DRY_RUN      = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Elfsight widget ID for HFSAA Bay Area store locator ──────────────────────
const WIDGET_ID = 'daba628e-a2c7-4c9c-b209-be021ce76e8f';
const BOOT_URL  = `https://core.service.elfsight.com/p/boot/?w=${WIDGET_ID}`;

// ─── Category inference ───────────────────────────────────────────────────────
function inferCategory(name = '') {
  const n = name.toLowerCase();
  if (/butcher|meat|market|mart|grocery|store/i.test(n)) return 'grocery'; // covers both grocery & butcher
  return 'restaurant';
}

// ─── Cuisine guesser ──────────────────────────────────────────────────────────
function guessCuisine(name = '') {
  const n = name.toLowerCase();
  if (/pizza/i.test(n))                                         return 'Italian';
  if (/burger|grill|wings|bbq|fried chicken/i.test(n))         return 'American';
  if (/chinese|wok/i.test(n))                                   return 'Chinese';
  if (/indian|curry|biryani|desi|masala|tandoor|charminar|deccan|swaad|chowrasta|karimi|lahori|peshawari/i.test(n)) return 'Indian';
  if (/pakistani/i.test(n))                                     return 'Pakistani';
  if (/falafel|shawarma|gyro|mediterranean|arabian|kabab|kabob|afghan|peri peri/i.test(n)) return 'Middle Eastern';
  if (/turkish/i.test(n))                                       return 'Turkish';
  if (/mexican|taco|burrito/i.test(n))                         return 'Mexican';
  if (/thai/i.test(n))                                          return 'Thai';
  if (/sushi|japanese/i.test(n))                                return 'Japanese';
  if (/korean/i.test(n))                                        return 'Korean';
  if (/african|ethiopian|somali/i.test(n))                      return 'African';
  if (/bakery|bread|pastry|sweets/i.test(n))                    return 'Bakery';
  if (/cafe|coffee|tea/i.test(n))                               return 'Cafe';
  if (/seafood|fish/i.test(n))                                  return 'Seafood';
  if (/butcher|meat|market|mart|grocery/i.test(n))              return 'Grocery / Butcher';
  return 'Halal Restaurant';
}

// ─── Normalize name: strip bracketed notes like "[Butcher Dept Only]" ─────────
function cleanName(name = '') {
  return name.replace(/\[.*?\]/g, '').replace(/\(.*?ONLY.*?\)/gi, '').trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  // 1. Fetch Elfsight widget data
  console.log('Fetching HFSAA Bay Area listings from Elfsight...');
  const res = await fetch(BOOT_URL, {
    headers: {
      'Origin': 'https://www.hfsaa.org',
      'Referer': 'https://www.hfsaa.org/',
    },
  });
  if (!res.ok) throw new Error(`Elfsight fetch failed: ${res.status}`);
  const json = await res.json();
  const locations = json?.data?.widgets?.[WIDGET_ID]?.data?.settings?.locations ?? [];
  console.log(`Fetched ${locations.length} locations from HFSAA Bay Area\n`);

  // 2. Map to DB rows
  const rows = locations.map(loc => ({
    name:              cleanName(loc.name ?? loc.place?.name ?? 'Unknown'),
    address:           loc.place?.address ?? null,
    lat:               loc.place?.coordinates?.lat ?? null,
    lng:               loc.place?.coordinates?.lng ?? null,
    phone:             loc.phone || null,
    website:           loc.website || null,
    category:          inferCategory(loc.name ?? ''),
    cuisine_type:      guessCuisine(loc.name ?? ''),
    primary_certifier: 'HFSAA',
    certifiers:        ['HFSAA'],
    is_verified:       true,
    zabihah_status:    'full',
    status:            'approved',
  }));

  // 3. Load existing (name, address) pairs from DB
  console.log('Loading existing restaurant names + addresses from DB...');
  const { data: existing, error: fetchErr } = await supabase
    .from('restaurants')
    .select('name, address');
  if (fetchErr) throw new Error(`DB fetch failed: ${fetchErr.message}`);

  const existingKeys = new Set(
    (existing ?? []).map(r => `${(r.name ?? '').toLowerCase().trim()}|${(r.address ?? '').toLowerCase().trim()}`)
  );
  console.log(`  ${existingKeys.size} existing rows loaded\n`);

  // 4. Filter out duplicates
  const toInsert = rows.filter(r => {
    const key = `${r.name.toLowerCase().trim()}|${(r.address ?? '').toLowerCase().trim()}`;
    return !existingKeys.has(key);
  });
  const skipped = rows.length - toInsert.length;

  console.log(`Total from HFSAA:  ${rows.length}`);
  console.log(`Already in DB:     ${skipped}`);
  console.log(`To insert:         ${toInsert.length}\n`);

  if (toInsert.length === 0) {
    console.log('Nothing new to insert.');
    return;
  }

  if (DRY_RUN) {
    console.log('── DRY RUN — rows that would be inserted ──');
    toInsert.forEach(r =>
      console.log(`  [${r.category}] ${r.name} | ${r.address} | ${r.cuisine_type}`)
    );
    console.log(`\n(${toInsert.length} rows — remove --dry-run to insert)`);
    return;
  }

  // 5. Insert in batches
  let inserted = 0;
  let errors   = 0;
  const BATCH  = 50;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await supabase.from('restaurants').insert(batch);
    if (error) {
      console.error(`Batch error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  console.log('────────────────────────────────────────');
  console.log(`Done.`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  With coords: ${toInsert.filter(r => r.lat).length}/${toInsert.length}`);
}

run().catch(err => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
