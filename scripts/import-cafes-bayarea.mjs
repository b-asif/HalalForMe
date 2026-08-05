/**
 * scripts/import-cafes-bayarea.mjs
 *
 * Imports known Muslim-owned Bay Area cafes / coffee shops / dessert spots
 * into the Supabase restaurants table with category = 'cafe'.
 *
 * Geocoding: uses OpenStreetMap Nominatim (free, no API key).
 * Deduplication: skips rows whose (name, address) already exist in the DB.
 *
 * Usage:
 *   node scripts/import-cafes-bayarea.mjs [--dry-run]
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

// ─── Known Bay Area Muslim-owned cafes ───────────────────────────────────────
// These are Yemeni coffee shops and other Muslim-owned cafes/dessert spots
// in the Bay Area. Addresses verified via Google Maps.
const CAFES = [
  { name: 'Arwa Yemeni Coffee',           address: '1155 W El Camino Real, Sunnyvale, CA 94087',      cuisine_type: 'Cafe' },
  { name: 'Qishr Coffee House',           address: '90 Skyport Dr #140, San Jose, CA 95110',          cuisine_type: 'Cafe' },
  { name: 'Qamaria Yemeni Coffee Co.',    address: '3622 Thornton Ave, Fremont, CA 94536',            cuisine_type: 'Cafe' },
  { name: 'Mohka House',                  address: '384 Grand Ave, Oakland, CA 94610',                cuisine_type: 'Cafe' },
  { name: 'Heyma Yemeni Coffee',          address: '240 Castro St, Mountain View, CA 94041',          cuisine_type: 'Cafe' },
  { name: 'Beit Al Qahwa',               address: '2130 Center St, Berkeley, CA 94704',              cuisine_type: 'Cafe' },
  { name: 'Qamaria Yemeni Coffee Co.',    address: '5353 Almaden Expy #25, San Jose, CA 95118',       cuisine_type: 'Cafe' },
  { name: 'Saba\'s Coffee',              address: '1015 Clay St, Oakland, CA 94607',                 cuisine_type: 'Cafe' },
  { name: 'Arwa Yemeni Coffee',           address: '3839 Mowry Ave, Fremont, CA 94538',              cuisine_type: 'Cafe' },
];

// ─── Nominatim geocoder ───────────────────────────────────────────────────────
async function geocode(address) {
  await new Promise(r => setTimeout(r, 1100)); // Nominatim rate limit: 1 req/sec
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HalalForMe-import/1.0 (contact@halalforme.app)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  // 1. Load existing rows
  console.log('Loading existing rows from DB...');
  const { data: existing, error: fetchErr } = await supabase
    .from('restaurants')
    .select('name, address');
  if (fetchErr) throw new Error(`DB fetch failed: ${fetchErr.message}`);

  const existingKeys = new Set(
    (existing ?? []).map(r => `${(r.name ?? '').toLowerCase().trim()}|${(r.address ?? '').toLowerCase().trim()}`)
  );
  console.log(`  ${existingKeys.size} existing rows\n`);

  // 2. Filter duplicates & geocode
  const toInsert = [];
  for (const cafe of CAFES) {
    const key = `${cafe.name.toLowerCase().trim()}|${cafe.address.toLowerCase().trim()}`;
    if (existingKeys.has(key)) {
      console.log(`  SKIP (exists): ${cafe.name}`);
      continue;
    }

    process.stdout.write(`  Geocoding: ${cafe.name} @ ${cafe.address} ... `);
    const coords = await geocode(cafe.address);
    if (!coords) {
      console.log('no result — skipping');
      continue;
    }
    console.log(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);

    toInsert.push({
      name:              cafe.name,
      address:           cafe.address,
      lat:               coords.lat,
      lng:               coords.lng,
      cuisine_type:      cafe.cuisine_type,
      category:          'cafe',
      primary_certifier: 'muslim_owned',
      certifiers:        ['muslim_owned'],
      is_verified:       true,
      zabihah_status:    null,   // cafes don't serve meat
      status:            'approved',
    });
  }

  console.log(`\nTotal to insert: ${toInsert.length}`);

  if (toInsert.length === 0) {
    console.log('Nothing new to insert.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n── DRY RUN ──');
    toInsert.forEach(r => console.log(`  ${r.name} | ${r.address} | lat:${r.lat}`));
    console.log(`\n(${toInsert.length} rows — remove --dry-run to insert)`);
    return;
  }

  // 3. Insert
  const { error } = await supabase.from('restaurants').insert(toInsert);
  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  console.log('────────────────────────────────────────');
  console.log(`Done. Inserted ${toInsert.length} cafes.`);
}

run().catch(err => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
