
// scripts/importToSupabase.js
require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // use service key for admin imports
);

async function importRestaurants(filename, autoApprove = false) {
  const restaurants = JSON.parse(fs.readFileSync(filename, 'utf8'));

  console.log(`Importing ${restaurants.length} restaurants from ${filename}...`);

  // Import in batches of 50 to avoid timeouts
  const batchSize = 50;
  let imported = 0;

  for (let i = 0; i < restaurants.length; i += batchSize) {
    const batch = restaurants.slice(i, i + batchSize).map(r => ({
      ...r,
      status: autoApprove ? 'community_verified' : 'pending_review',
      created_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('restaurants')
      .upsert(batch, { onConflict: 'osm_id', ignoreDuplicates: true });

    if (error) {
      console.error('Batch error:', error.message);
    } else {
      imported += batch.length;
      console.log(`Imported ${imported}/${restaurants.length}`);
    }
  }

  console.log('Done.');
}

// confirmed halal → auto approve
// likely halal → stays as pending for your manual review
importRestaurants('./confirmed_halal.json', true);
importRestaurants('./likely_halal.json', false);
