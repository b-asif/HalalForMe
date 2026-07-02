const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('./scripts/sj.geojson', 'utf8'));

const HALAL_CONFIRMED = [
  'halal', 'zabiha', 'islamic', 'muslim', 'zabihah', 'bismillah'
];

const HALAL_LIKELY = [
  'turkish', 'pakistani', 'bangladeshi', 'somali',
  'lebanese', 'afghan', 'moroccan', 'middle eastern',
  'persian', 'egyptian', 'iraqi', 'yemeni', 'malaysian',
  'indonesian'
];

const DISQUALIFIED = [
  'pork', 'bacon', 'brewery', 'pub'
];

const NEEDS_REVIEW = [
  'bar', 'wine', 'beer', 'cocktail'
];

const results = {
  confirmed: [],
  likely: [],
  needs_review: [],
  disqualified: []
};

(raw.features || []).forEach(feature => {
  const props = feature.properties || {};
  const geometry = feature.geometry || {};

  const name = (props.name || '').toLowerCase();
  const cuisine = (props.cuisine || '').toLowerCase();
  const dietHalal = (props['diet:halal'] || '').toLowerCase();

  if (!props.name) return;

  let lng = null;
  let lat = null;

  if (
    geometry.type === 'Point' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2
  ) {
    lng = geometry.coordinates[0];
    lat = geometry.coordinates[1];
  }

  if (lat == null || lng == null) return;

  const restaurant = {
    osm_id: String(props['@id'] || props.id || props.osm_id || ''),
    name: props.name,
    lat,
    lng,
    cuisine: props.cuisine || null,
    phone: props.phone || props['contact:phone'] || null,
    website: props.website || props['contact:website'] || null,
    address: [
      props['addr:housenumber'],
      props['addr:street'],
      props['addr:city']
    ].filter(Boolean).join(' ') || null,
    source: 'osm_import',
    status: 'pending_review'
  };

  if (DISQUALIFIED.some(d => name.includes(d) || cuisine.includes(d))) {
    results.disqualified.push({
      ...restaurant,
      reason: 'disqualified_keyword'
    });
    return;
  }

  if (NEEDS_REVIEW.some(k => name.includes(k) || cuisine.includes(k))) {
    results.needs_review.push({
      ...restaurant,
      confidence: 'low',
      reason: 'mixed_signal_possible_alcohol'
    });
    return;
  }

  if (dietHalal === 'only') {
    results.confirmed.push({
      ...restaurant,
      confidence: 'high',
      reason: 'diet:halal=only'
    });
    return;
  }

  if (dietHalal === 'yes') {
    results.likely.push({
      ...restaurant,
      confidence: 'medium',
      reason: 'diet:halal=yes'
    });
    return;
  }

  if (HALAL_CONFIRMED.some(h => name.includes(h) || cuisine.includes(h))) {
    results.likely.push({
      ...restaurant,
      confidence: 'medium',
      reason: 'halal_keyword_match'
    });
    return;
  }

  if (HALAL_LIKELY.some(h => cuisine.includes(h))) {
    results.likely.push({
      ...restaurant,
      confidence: 'low',
      reason: 'likely_halal_cuisine'
    });
    return;
  }
});

fs.writeFileSync('./confirmed_halal.json', JSON.stringify(results.confirmed, null, 2));
fs.writeFileSync('./likely_halal.json', JSON.stringify(results.likely, null, 2));
fs.writeFileSync('./needs_review.json', JSON.stringify(results.needs_review, null, 2));

console.log(`Total restaurants scanned: ${(raw.features || []).length}`);
console.log(`Confirmed halal: ${results.confirmed.length}`);
console.log(`Likely halal: ${results.likely.length}`);
console.log(`Needs review: ${results.needs_review.length}`);
console.log(`Disqualified: ${results.disqualified.length}`);
console.log('\nFiles saved: confirmed_halal.json, likely_halal.json, needs_review.json');
