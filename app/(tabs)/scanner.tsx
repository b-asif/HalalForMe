import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Modal, Platform,
  TextInput, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { lookupENumber, HalalStatus } from '../../lib/eNumbers';
import { fetchWithTimeout, formatError } from '../../lib/errors';

// ─── scan history ─────────────────────────────────────────────────────────────

const SCAN_HISTORY_KEY = 'scan_history';
const MAX_HISTORY = 10;

interface ScanHistoryEntry {
  barcode: string;
  name: string;
  verdict: 'halal' | 'haram' | 'unclear' | 'no_data';
  timestamp: number;
}

async function saveScanHistory(entry: ScanHistoryEntry) {
  try {
    const raw = await AsyncStorage.getItem(SCAN_HISTORY_KEY);
    const existing: ScanHistoryEntry[] = raw ? JSON.parse(raw) : [];
    // Remove any prior entry for the same barcode, then prepend new one
    const updated = [entry, ...existing.filter(e => e.barcode !== entry.barcode)].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

async function loadScanHistory(): Promise<ScanHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SCAN_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── constants ────────────────────────────────────────────────────────────────

const GREEN  = '#245737';
const RED    = '#e53e3e';
const AMBER  = '#d97706';
const CORNER = 24;
const CORNER_W = 3;
const PLACEHOLDER_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

// ─── ingredient rules ─────────────────────────────────────────────────────────
//
// Reliability notes:
//  • Rules run on each parsed ingredient string (after splitting on , ; ).
//  • Source qualifiers in parentheses are preserved by the parser, so
//    "gelatin (fish)" stays intact and we can exempt it.
//  • labels_tags / allergens_tags from Open Food Facts are checked separately
//    in lookupBarcode — they are more reliable than text-matching.

interface Rule { test: (s: string) => boolean; label: string; reason: string; skipWhenVegan?: boolean }

// Matches an explicit halal/vegetarian/plant source qualifier anywhere in the string.
const HALAL_SOURCE = /\b(fish|plant[\s-]?based|plant|vegetable|veg(an)?|microbial|fungal|bacterial|yeast)\b/i;
// Matches an explicit haram source qualifier.
const HARAM_SOURCE = /\b(pork|porcine|pig|swine|bovine|animal)\b/i;

// Returns true when a halal source qualifier is present AND no haram source is present.
// Prevents "gelatin (pork and fish)" from being incorrectly exempted.
function hasHalalSourceOnly(s: string): boolean {
  return HALAL_SOURCE.test(s) && !HARAM_SOURCE.test(s);
}

const HARAM_RULES: Rule[] = [
  {
    // Pork and direct derivatives — covers lard, suet, pork gelatin etc.
    // Fixed: \bpig\b (was pig\s — missed standalone "pig")
    test: s => /\b(pork|porcine|\bpig\b|swine|ham\b|bacon|lard|lard\s+oil|pork\s+fat|pig\s+fat|pork\s+gelatin|porcine\s+gelatin|pork\s+extract|pork\s+collagen|pork\s+rind|suet)\b/i.test(s),
    label: 'Pork / Pork Derivative',
    reason: 'Pork and its by-products are not permitted in a halal diet',
  },
  {
    // Gelatin: haram unless the ONLY source qualifier is halal (fish, plant, etc.).
    // "gelatin (pork and fish)" still flags because HARAM_SOURCE is also present.
    test: s => /\bgelatin(e)?\b/i.test(s) && !hasHalalSourceOnly(s),
    label: 'Gelatin',
    reason: 'Source not confirmed as halal-certified, fish-based, or plant-based',
  },
  {
    // Alcohol: wine vinegar is debated among scholars so it is flagged here.
    test: s => /\b(alcohol|ethanol|wine\b|beer\b|rum\b|vodka|whisky|whiskey|brandy|bourbon|spirits|sake\b|mirin)\b/i.test(s),
    label: 'Alcohol',
    reason: 'Alcohol and intoxicants are not permitted in a halal diet',
  },
  {
    // Carmine (E120) — insect-derived red dye. E-number caught by table; name catch kept for redundancy.
    test: s => /\b(carmine|cochineal|crimson\s+lake)\b/i.test(s),
    label: 'Carmine / Cochineal',
    reason: 'Derived from cochineal insects',
  },
  {
    // Blood and blood products.
    test: s => /\b(blood\b|blood\s+plasma|dried\s+blood|blood\s+meal|blood\s+serum)\b/i.test(s),
    label: 'Blood',
    reason: 'Blood and blood products are explicitly prohibited in a halal diet',
  },
  {
    // Tallow — rendered animal fat; halal status depends on slaughter, assumed non-halal without qualifier.
    test: s => /\btallow\b/i.test(s) && !hasHalalSourceOnly(s),
    label: 'Tallow',
    reason: 'Rendered animal fat; halal status depends on slaughter method',
  },
  {
    // Animal-derived digestive enzymes — commonly porcine.
    test: s => /\b(pepsin|lipase|pancreatin|pancreatic\s+enzyme)\b/i.test(s) && !hasHalalSourceOnly(s),
    label: 'Animal Enzyme',
    reason: 'Pepsin, lipase, and pancreatin are commonly derived from pork',
  },
];

const UNCLEAR_RULES: Rule[] = [
  {
    // Natural flavors: source undisclosed. Skipped for vegan/vegetarian products
    // because plant-only sourcing is guaranteed by the vegan/vegetarian label.
    test: s => /\bnatural\s+flavou?rs?\b/i.test(s) || /\bnatural\s+flavou?rings?\b/i.test(s),
    label: 'Natural Flavors',
    reason: 'May contain animal-derived ingredients; exact source not disclosed',
    skipWhenVegan: true,
  },
  {
    // Rennet: unclear unless explicitly microbial/vegetable.
    test: s => /\brennet\b/i.test(s) && !/\b(microbial|vegetable|veg|plant|fermentation[\s-]?produced)\b/i.test(s),
    label: 'Rennet',
    reason: 'May be animal-derived rather than microbial or vegetable',
  },
  {
    test: s => /\bl[-.]?\s*cysteine\b/i.test(s) || /\bE[-\s]?920\b/i.test(s),
    label: 'L-Cysteine (E920)',
    reason: 'Often derived from pork or poultry by-products',
  },
  {
    // Mono/diglycerides: unclear unless source is vegetable/plant.
    // Skipped for vegan products — plant-derived by definition.
    test: s => /\b(mono|di)[- ]?glycerides?\b/i.test(s) && !hasHalalSourceOnly(s),
    label: 'Mono/Diglycerides (E471)',
    reason: 'May be animal-derived; source not specified',
    skipWhenVegan: true,
  },
  {
    // Glycerin/glycerol: skipped for vegan products — plant/synthetic by definition.
    test: s => /\b(glycerin|glycerol|glycerine)\b/i.test(s) && !hasHalalSourceOnly(s),
    label: 'Glycerin / Glycerol',
    reason: 'May be animal-derived; source not specified',
    skipWhenVegan: true,
  },
  {
    test: s => /\banimal\s+(fat|oil|rennet|shortening)\b/i.test(s),
    label: 'Animal Fat / Oil',
    reason: 'Animal source not verified as halal-slaughtered',
  },
  {
    // Shellac (E904) — secreted by lac insects.
    test: s => /\b(shellac|lac\s+resin|lac-resin)\b/i.test(s) || /\bE[-\s]?904\b/i.test(s),
    label: 'Shellac (E904)',
    reason: 'Derived from lac insects; classified as unclear in most halal standards',
  },
  {
    // Inosinate (E630–E632) and guanylate (E633–E635) — often pork or fish-derived.
    // Vegan products use yeast or plant-based sources so the concern is lower.
    test: s => /\b(inosinate|disodium\s+inosinate|guanylate|disodium\s+guanylate|ribonucleotides)\b/i.test(s)
      || /\bE[-\s]?6(30|31|32|33|34|35)\b/i.test(s),
    label: 'Inosinate / Guanylate (E630–635)',
    reason: 'Commonly derived from pork or fish; source is rarely stated on labels',
    skipWhenVegan: true,
  },
  {
    // Stearic acid / stearates — often tallow-derived; skipped for vegan products.
    test: s => /\b(stearic\s+acid|stearate)\b/i.test(s) && !hasHalalSourceOnly(s),
    label: 'Stearic Acid / Stearate',
    reason: 'May be derived from animal tallow; source not specified',
    skipWhenVegan: true,
  },
  {
    // Bone phosphate (E542).
    test: s => /\bbone\s+(phosphate|meal|char)\b/i.test(s) || /\bE[-\s]?542\b/i.test(s),
    label: 'Bone Phosphate (E542)',
    reason: 'Derived from animal bones; halal status depends on slaughter method',
  },
  // NOTE: Whey/casein removed — dairy derivatives where the rennet concern is a
  // minor scholarly debate, not a mainstream halal concern. Flagging them caused
  // widespread false "unclear" results on common dairy products.
];

// ─── types ────────────────────────────────────────────────────────────────────

interface FlaggedItem {
  text: string;
  severity: 'haram' | 'unclear';
  label: string;
  reason: string;
}

interface ProductResult {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  ingredients: string[];
  flagged: FlaggedItem[];
  verdict: 'halal' | 'haram' | 'unclear' | 'no_data';
  notFound: boolean;
  // Derived from Open Food Facts metadata — more reliable than text-matching
  certifiedHalal: boolean;      // labels_tags contains a halal certification
  hasPorkAllergen: boolean;     // allergens_tags explicitly declares pork
  nonEnglishText: boolean;      // ingredient list is not in English — analysis skipped
  isVeganOrVegetarian: boolean; // labels_tags declares vegan or vegetarian
  communityVerified: boolean;   // verdict sourced from admin-verified products table
}

// ─── analysis ─────────────────────────────────────────────────────────────────

function parseIngredients(text: string): string[] {
  return text
    .split(/[,;]/)
    .map(s => s.trim().replace(/^[\s*•]+|[\s*•.]+$/g, '').trim())
    .filter(s => s.length > 1 && s.length < 120);
}

function analyzeIngredients(
  list: string[],
  context: { isVeganOrVegetarian?: boolean } = {},
): { flagged: FlaggedItem[]; verdict: ProductResult['verdict'] } {
  const flagged: FlaggedItem[] = [];

  for (const item of list) {
    let hit = false;

    // 0. If the ingredient contains an E-number we explicitly know is halal,
    //    skip all further rule checks for this item entirely.
    const eEntry = lookupENumber(item);
    if (eEntry?.status === 'halal') continue;

    // 1. Name-based haram rules
    for (const rule of HARAM_RULES) {
      if (rule.test(item)) {
        flagged.push({ text: item, severity: 'haram', label: rule.label, reason: rule.reason });
        hit = true;
        break;
      }
    }

    // 2. Name-based unclear rules
    if (!hit) {
      for (const rule of UNCLEAR_RULES) {
        // Skip rules that don't apply when the product is vegan/vegetarian-labelled.
        // Vegan/vegetarian certification guarantees plant or synthetic sourcing,
        // resolving ambiguity for ingredients like natural flavors and glycerin.
        if (context.isVeganOrVegetarian && rule.skipWhenVegan) continue;
        if (rule.test(item)) {
          flagged.push({ text: item, severity: 'unclear', label: rule.label, reason: rule.reason });
          hit = true;
          break;
        }
      }
    }

    // 3. E-number lookup — catches additives listed by code (e.g. "E441", "E 471")
    //    Only runs if name-based rules didn't already flag this ingredient.
    //    (eEntry was already computed in step 0 and reused here.)
    if (!hit && eEntry) {
      const severity: 'haram' | 'unclear' = eEntry.status === 'haram' ? 'haram' : 'unclear';
      flagged.push({ text: item, severity, label: eEntry.name, reason: eEntry.notes ?? '' });
    }
  }

  let verdict: ProductResult['verdict'];
  if (list.length === 0) verdict = 'no_data';
  else if (flagged.some(f => f.severity === 'haram')) verdict = 'haram';
  else if (flagged.some(f => f.severity === 'unclear')) verdict = 'unclear';
  else verdict = 'halal';

  return { flagged, verdict };
}

async function lookupBarcode(barcode: string): Promise<ProductResult> {
  // Run Open Food Facts lookup and community verified-products check in parallel.
  const [offRes, verifiedRes] = await Promise.allSettled([
    fetchWithTimeout(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { headers: { 'User-Agent': 'HalalForMe/1.0' } },
    ),
    (async () => {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase
        .from('verified_products')
        .select('verdict')
        .eq('barcode', barcode)
        .single();
      return data as { verdict: ProductResult['verdict'] } | null;
    })(),
  ]);

  if (offRes.status === 'rejected') throw new Error(offRes.reason?.message ?? 'Network error');
  if (!offRes.value.ok) throw new Error(`Network error ${offRes.value.status}`);

  const json = await offRes.value.json();
  const communityVerifiedEntry =
    verifiedRes.status === 'fulfilled' ? verifiedRes.value : null;

  if (json.status === 0 || !json.product) {
    return {
      barcode, name: 'Unknown Product', brand: null, imageUrl: null,
      ingredients: [], flagged: [], verdict: 'no_data', notFound: true,
      certifiedHalal: false, hasPorkAllergen: false, nonEnglishText: false,
      isVeganOrVegetarian: false, communityVerified: false,
    };
  }

  const p = json.product;
  const name     = p.product_name_en || p.product_name || 'Unknown Product';
  const brand    = p.brands || null;
  const imageUrl = p.image_front_url || p.image_url || null;

  // ── Reliable metadata signals ────────────────────────────────────────────────
  // labels_tags: e.g. ["en:halal", "en:kosher", "en:organic", "en:vegan"]
  const labelsTags: string[] = p.labels_tags ?? [];
  const certifiedHalal = labelsTags.some(
    t => /halal/i.test(t) && !/non[-\s]halal/i.test(t),
  );
  // Vegan/vegetarian certification guarantees plant-only sourcing, which resolves
  // ambiguity for ingredients like natural flavors, glycerin, and mono/diglycerides.
  const isVeganOrVegetarian = labelsTags.some(t => /\b(vegan|vegetarian)\b/i.test(t));

  // allergens_tags: e.g. ["en:gluten", "en:milk", "en:en:pork"]
  // OFF uses "en:pork" when the product explicitly declares pork as an allergen.
  const allergensTags: string[] = p.allergens_tags ?? [];
  const hasPorkAllergen = allergensTags.some(t => /\bpork\b|\bpig\b|\bswine\b/i.test(t));

  // ── Ingredient text analysis ─────────────────────────────────────────────────
  // Prefer the structured ingredients array (language-normalized) over raw text.
  // Each node has a `text` field; we flatten nested sub-ingredients.
  interface IngNode { text?: string; id?: string; ingredients?: IngNode[] }
  function flattenNodes(nodes: IngNode[]): string[] {
    const out: string[] = [];
    for (const n of nodes) {
      if (n.text) out.push(n.text);
      if (n.ingredients?.length) out.push(...flattenNodes(n.ingredients));
    }
    return out;
  }

  let ingredients: string[];
  let nonEnglishText = false;

  if (Array.isArray(p.ingredients) && p.ingredients.length > 0) {
    // Structured ingredients array — language-normalised by OFF, safe to analyse.
    ingredients = flattenNodes(p.ingredients as IngNode[]).filter(s => s.length > 1);
  } else {
    // Prefer the English text field. Fall back to the generic field only if needed.
    const rawText = p.ingredients_text_en || p.ingredients_text || '';
    // If there is no English-specific field and the raw text is mostly non-ASCII
    // (>40% of characters), it is likely not in English — flag it rather than
    // running English-only rules on foreign text and producing a false verdict.
    if (!p.ingredients_text_en && rawText.length > 0) {
      const nonAscii = (rawText.match(/[^\x00-\x7F]/g) ?? []).length;
      if (nonAscii / rawText.length > 0.4) {
        nonEnglishText = true;
      }
    }
    ingredients = nonEnglishText ? [] : parseIngredients(rawText);
  }

  const { flagged, verdict: textVerdict } = analyzeIngredients(ingredients, { isVeganOrVegetarian });

  // ── Verdict override logic ───────────────────────────────────────────────────
  // Priority (highest to lowest):
  //  1. communityVerifiedEntry — admin-reviewed verdict stored in Supabase
  //  2. hasPorkAllergen — regulatory allergen declaration, highly reliable
  //  3. certifiedHalal upgrade — if product carries a halal cert and the only
  //     issues are "unclear" ingredients (not outright haram), trust the cert.
  //     The certification body has already audited those ingredients.
  //  4. textVerdict — ingredient text analysis result
  let verdict: ProductResult['verdict'] = nonEnglishText ? 'no_data' : textVerdict;

  if (hasPorkAllergen) {
    verdict = 'haram';
  } else if (certifiedHalal && verdict === 'unclear') {
    // Halal certification covers ambiguous-source ingredients like natural flavors
    // and emulsifiers. Only upgrade unclear → halal; never override a haram verdict.
    verdict = 'halal';
  }

  // Community-verified entry takes final precedence (admin has reviewed this product).
  const communityVerified = !!communityVerifiedEntry;
  if (communityVerified && communityVerifiedEntry!.verdict) {
    verdict = communityVerifiedEntry!.verdict;
  }

  return {
    barcode, name, brand, imageUrl, ingredients, flagged, verdict, notFound: false,
    certifiedHalal, hasPorkAllergen, nonEnglishText, isVeganOrVegetarian, communityVerified,
  };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function VerdictBanner({ verdict, certifiedHalal, hasPorkAllergen, nonEnglishText, isVeganOrVegetarian, communityVerified }: {
  verdict: ProductResult['verdict'];
  certifiedHalal: boolean;
  hasPorkAllergen: boolean;
  nonEnglishText: boolean;
  isVeganOrVegetarian: boolean;
  communityVerified: boolean;
}) {
  const cfg = {
    halal:   { bg: GREEN,  icon: 'checkmark-circle',  heading: 'HALAL',   sub: 'No prohibited ingredients detected' },
    haram:   { bg: RED,    icon: 'close-circle',       heading: 'HARAM',   sub: 'Contains prohibited ingredients' },
    unclear: { bg: AMBER,  icon: 'help-circle',        heading: 'UNCLEAR', sub: 'Some ingredients need verification' },
    no_data: { bg: '#999', icon: 'information-circle', heading: 'NO DATA', sub: nonEnglishText ? 'Ingredient list is not in English — verify manually' : 'No ingredient information found' },
  }[verdict];

  const showBadges = certifiedHalal || hasPorkAllergen || isVeganOrVegetarian || communityVerified;

  return (
    <View style={vb.outer}>
      <View style={[vb.wrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon as any} size={40} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={vb.heading}>{cfg.heading}</Text>
          <Text style={vb.sub}>{cfg.sub}</Text>
        </View>
      </View>

      {/* Metadata badges — shown below the main verdict */}
      {showBadges && (
        <View style={vb.badges}>
          {communityVerified && (
            <View style={[vb.badge, { backgroundColor: '#eef4ff', borderColor: '#3b82f6' }]}>
              <Ionicons name="shield-checkmark-outline" size={13} color="#3b82f6" />
              <Text style={[vb.badgeText, { color: '#3b82f6' }]}>Verified by HalalForMe team</Text>
            </View>
          )}
          {certifiedHalal && (
            <View style={[vb.badge, { backgroundColor: '#e6f9f2', borderColor: GREEN }]}>
              <Ionicons name="ribbon-outline" size={13} color={GREEN} />
              <Text style={[vb.badgeText, { color: GREEN }]}>Halal Certified (per product label)</Text>
            </View>
          )}
          {isVeganOrVegetarian && (
            <View style={[vb.badge, { backgroundColor: '#f0fdf4', borderColor: '#16a34a' }]}>
              <Ionicons name="leaf-outline" size={13} color="#16a34a" />
              <Text style={[vb.badgeText, { color: '#16a34a' }]}>Vegan / Vegetarian label — plant-sourced ingredients assumed</Text>
            </View>
          )}
          {hasPorkAllergen && (
            <View style={[vb.badge, { backgroundColor: '#fff5f5', borderColor: RED }]}>
              <Ionicons name="warning-outline" size={13} color={RED} />
              <Text style={[vb.badgeText, { color: RED }]}>Pork declared as allergen on label</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const vb = StyleSheet.create({
  outer: { marginHorizontal: 16, marginBottom: 12 },
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 18, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  heading: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  sub:     { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  badges:  { gap: 6, marginTop: 8 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
  },
  badgeText: { fontSize: 12, fontWeight: '600', flex: 1 },
});

function IngredientItem({ text, flag }: { text: string; flag?: FlaggedItem }) {
  if (!flag) {
    return (
      <View style={ing.row}>
        <View style={ing.dot} />
        <Text style={ing.normalText}>{text}</Text>
      </View>
    );
  }

  const isHaram = flag.severity === 'haram';
  const accent  = isHaram ? RED : AMBER;
  const bg      = isHaram ? '#fff5f5' : '#fffbeb';

  return (
    <View style={[ing.flagRow, { backgroundColor: bg, borderLeftColor: accent }]}>
      <View style={ing.flagHeader}>
        <Ionicons
          name={isHaram ? 'close-circle' : 'warning'}
          size={15}
          color={accent}
        />
        <Text style={[ing.flagText, { color: accent }]} numberOfLines={2}>{text}</Text>
      </View>
      <Text style={[ing.reason, { color: accent }]}>{flag.reason}</Text>
    </View>
  );
}

const ing = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 5, paddingHorizontal: 4 },
  dot:        { width: 5, height: 5, borderRadius: 3, backgroundColor: '#d0d0d0', marginTop: 7 },
  normalText: { flex: 1, fontSize: 14, color: '#555', lineHeight: 20 },
  flagRow: {
    borderLeftWidth: 3, borderRadius: 10,
    padding: 10, marginBottom: 6,
  },
  flagHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 3 },
  flagText:   { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 18 },
  reason:     { fontSize: 12, marginLeft: 21, lineHeight: 17, opacity: 0.9 },
});

const REPORT_OPTIONS = [
  'Ingredients list is incorrect',
  'Verdict should be Halal',
  'Verdict should be Haram',
  'Wrong product matched to barcode',
  'Missing product information',
  'Other',
];

function ReportModal({ visible, productName, barcode, verdict, onClose }: {
  visible: boolean;
  productName: string;
  barcode: string;
  verdict: ProductResult['verdict'];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected]   = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!selected) return;
    try {
      const { supabase } = await import('../../lib/supabase');
      await supabase.from('scan_reports').insert({
        barcode,
        product_name: productName,
        report_reason: selected,
        verdict_shown: verdict,
      });
    } catch {
      // Fire-and-forget — don't block the thank-you on network errors
    }
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setSelected(null);
      onClose();
    }, 1800);
  };

  const handleClose = () => {
    setSelected(null);
    setSubmitted(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={rm.overlay}>
        <View style={[rm.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={rm.handle} />
          <TouchableOpacity style={rm.closeBtn} onPress={handleClose}>
            <Ionicons name="close" size={18} color="#999" />
          </TouchableOpacity>

          {submitted ? (
            <View style={rm.thanks}>
              <Ionicons name="checkmark-circle" size={48} color={GREEN} />
              <Text style={rm.thanksTitle}>Thank you!</Text>
              <Text style={rm.thanksSub}>Your report helps improve accuracy for everyone.</Text>
            </View>
          ) : (
            <>
              <Text style={rm.title}>Report a Problem</Text>
              <Text style={rm.sub}>{productName}</Text>

              {REPORT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[rm.option, selected === opt && rm.optionSelected]}
                  onPress={() => setSelected(opt)}
                >
                  <View style={[rm.radio, selected === opt && rm.radioSelected]}>
                    {selected === opt && <View style={rm.radioDot} />}
                  </View>
                  <Text style={[rm.optionText, selected === opt && rm.optionTextSelected]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[rm.submitBtn, !selected && rm.submitBtnDisabled]}
                onPress={submit}
                disabled={!selected}
              >
                <Text style={rm.submitText}>Submit Report</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 20,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 4 },
  sub:   { fontSize: 13, color: '#999', marginBottom: 20 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1.5,
    borderColor: '#ebebeb', marginBottom: 8, backgroundColor: '#fafafa',
  },
  optionSelected: { borderColor: GREEN, backgroundColor: '#f0faf6' },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: '#ccc', alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: GREEN },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN },
  optionText: { flex: 1, fontSize: 14, color: '#555' },
  optionTextSelected: { color: GREEN, fontWeight: '600' },
  submitBtn: {
    marginTop: 8, backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  thanks: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  thanksTitle: { fontSize: 22, fontWeight: '800', color: '#111' },
  thanksSub:   { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 20 },
});

// ─── screen ───────────────────────────────────────────────────────────────────

type ScreenState = 'idle' | 'scanning' | 'loading' | 'result' | 'error';

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [screenState, setScreenState]   = useState<ScreenState>('idle');
  const [scanned,     setScanned]       = useState(false);
  const [result,      setResult]        = useState<ProductResult | null>(null);
  const [errorMsg,    setErrorMsg]      = useState<string | null>(null);
  const [lastBarcode, setLastBarcode]   = useState<string | null>(null);
  const [reportOpen,  setReportOpen]    = useState(false);

  // scan history
  const [history,     setHistory]       = useState<ScanHistoryEntry[]>([]);

  // manual barcode entry
  const [manualBarcode, setManualBarcode] = useState('');
  const manualInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadScanHistory().then(setHistory);
  }, []);


  const runLookup = useCallback(async (barcode: string) => {
    setLastBarcode(barcode);
    setScreenState('loading');

    try {
      const product = await lookupBarcode(barcode);
      setResult(product);
      setScreenState('result');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const entry: ScanHistoryEntry = {
        barcode,
        name: product.name,
        verdict: product.verdict,
        timestamp: Date.now(),
      };
      saveScanHistory(entry);
      setHistory(prev => [entry, ...prev.filter(e => e.barcode !== barcode)].slice(0, MAX_HISTORY));
    } catch (e: any) {
      setErrorMsg(formatError(e));
      setScreenState('error');
    }
  }, []);

  const handleBarcode = useCallback(async ({ data }: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    await runLookup(data);
  }, [scanned, runLookup]);

  const handleManualSubmit = () => {
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    setManualBarcode('');
    setScanned(true);
    runLookup(trimmed);
  };

  const reset = () => {
    setScanned(false);
    setResult(null);
    setErrorMsg(null);
    setLastBarcode(null);
    setScreenState('idle');
  };

  // ── loading ───────────────────────────────────────────────────
  if (screenState === 'loading') {
    return (
      <SafeAreaView style={s.center} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={s.loadingTitle}>Looking up product…</Text>
        {lastBarcode && (
          <Text style={s.loadingBarcode}>{lastBarcode}</Text>
        )}
      </SafeAreaView>
    );
  }

  // ── error ─────────────────────────────────────────────────────
  if (screenState === 'error') {
    return (
      <SafeAreaView style={s.center} edges={['top', 'left', 'right']}>
        <Ionicons name="wifi-outline" size={52} color="#ddd" />
        <Text style={s.errTitle}>Lookup Failed</Text>
        <Text style={s.errMsg}>{errorMsg}</Text>
        <TouchableOpacity style={s.greenBtn} onPress={reset}>
          <Text style={s.greenBtnText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── result ────────────────────────────────────────────────────
  if (screenState === 'result' && result) {
    const flagMap = new Map(result.flagged.map(f => [f.text.toLowerCase(), f]));
    const haramCount   = result.flagged.filter(f => f.severity === 'haram').length;
    const unclearCount = result.flagged.filter(f => f.severity === 'unclear').length;

    return (
      <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
        {/* sticky header */}
        <View style={s.resultHeader}>
          <TouchableOpacity style={s.backBtn} onPress={reset}>
            <Ionicons name="arrow-back" size={20} color="#111" />
          </TouchableOpacity>
          <Text style={s.resultHeaderTitle} numberOfLines={1}>{result.name}</Text>
          <TouchableOpacity
            style={s.scanAgainBtn}
            onPress={() => { setScanned(false); setResult(null); setScreenState('scanning'); }}
          >
            <Ionicons name="scan-outline" size={16} color={GREEN} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.flex}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* product image */}
          {result.imageUrl ? (
            <Image
              source={result.imageUrl}
              style={s.productImage}
              contentFit="contain"
              placeholder={PLACEHOLDER_BLURHASH}
              transition={300}
            />
          ) : (
            <View style={s.imagePlaceholder}>
              <Text style={s.imagePlaceholderEmoji}>🛒</Text>
            </View>
          )}

          {/* product info */}
          <View style={s.productInfo}>
            <Text style={s.productName}>{result.name}</Text>
            {result.brand && <Text style={s.productBrand}>{result.brand}</Text>}
            <Text style={s.productBarcode}>Barcode: {result.barcode}</Text>
          </View>

          {/* verdict */}
          <VerdictBanner
            verdict={result.verdict}
            certifiedHalal={result.certifiedHalal}
            hasPorkAllergen={result.hasPorkAllergen}
            nonEnglishText={result.nonEnglishText}
            isVeganOrVegetarian={result.isVeganOrVegetarian}
            communityVerified={result.communityVerified}
          />

          {/* e-number disclaimer */}
          <View style={s.eNumDisclaimer}>
            <Ionicons name="information-circle-outline" size={14} color="#aaa" />
            <Text style={s.eNumDisclaimerText}>
              E-number status can vary by manufacturer. When in doubt, contact the brand directly.
            </Text>
          </View>

          {/* flag summary chips */}
          {(haramCount > 0 || unclearCount > 0) && (
            <View style={s.flagSummary}>
              {haramCount > 0 && (
                <View style={[s.chip, { backgroundColor: '#fff5f5' }]}>
                  <Ionicons name="close-circle" size={13} color={RED} />
                  <Text style={[s.chipText, { color: RED }]}>
                    {haramCount} haram ingredient{haramCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              {unclearCount > 0 && (
                <View style={[s.chip, { backgroundColor: '#fffbeb' }]}>
                  <Ionicons name="warning" size={13} color={AMBER} />
                  <Text style={[s.chipText, { color: AMBER }]}>
                    {unclearCount} unclear ingredient{unclearCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ingredients */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Ingredients</Text>

            {result.notFound ? (
              <View style={s.noDataBox}>
                <Ionicons name="cube-outline" size={32} color="#ddd" />
                <Text style={s.noDataTitle}>Product not in database</Text>
                <Text style={s.noDataText}>
                  This barcode isn't in the Open Food Facts database yet.{'\n'}
                  You can add it at openfoodfacts.org
                </Text>
              </View>
            ) : result.ingredients.length === 0 ? (
              <View style={s.noDataBox}>
                <Ionicons name="document-text-outline" size={32} color="#ddd" />
                <Text style={s.noDataTitle}>No ingredient data</Text>
                <Text style={s.noDataText}>
                  This product was found but has no ingredient list in the database.
                </Text>
              </View>
            ) : (
              result.ingredients.map((item, i) => {
                const key = item.toLowerCase();
                const flag = flagMap.get(key) ??
                  // fuzzy match: only apply if the flagged key is a meaningful phrase
                  // (≥8 chars) contained within this ingredient, preventing short fragments
                  // like "mono" or "di" from incorrectly highlighting unrelated ingredients.
                  [...flagMap.entries()].find(([k]) => k.length >= 8 && key.includes(k))?.[1];
                return <IngredientItem key={i} text={item} flag={flag} />;
              })
            )}
          </View>

          {/* report button */}
          <TouchableOpacity
            style={s.reportBtn}
            onPress={() => setReportOpen(true)}
          >
            <Ionicons name="flag-outline" size={16} color="#999" />
            <Text style={s.reportText}>Report this result</Text>
          </TouchableOpacity>
        </ScrollView>

        <ReportModal
          visible={reportOpen}
          productName={result.name}
          barcode={result.barcode}
          verdict={result.verdict}
          onClose={() => setReportOpen(false)}
        />
      </SafeAreaView>
    );
  }

  // ── scanning: guard against permission being revoked ──────────
  if (screenState === 'scanning' && permission && !permission.granted) {
    reset();
  }

  // ── scanning (camera active) ──────────────────────────────────
  if (screenState === 'scanning') {
    return (
      <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
        <View style={s.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarcode}
          />

          {/* dim overlay with scan frame cut-out effect */}
          <View style={s.overlay}>
            <View style={s.scanFrame}>
              <View style={[s.corner, s.tl]} />
              <View style={[s.corner, s.tr]} />
              <View style={[s.corner, s.bl]} />
              <View style={[s.corner, s.br]} />
            </View>
            <Text style={s.scanHint}>
              {scanned ? 'Detected! Loading…' : 'Point at a product barcode or QR code'}
            </Text>
          </View>

          {/* close button */}
          <TouchableOpacity style={s.stopBtn} onPress={reset}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── idle ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <View style={s.idleHeader}>
        <Text style={s.idleHeaderTitle}>Halal Scanner</Text>
        <Text style={s.idleHeaderSub}>Check if a product is halal</Text>
      </View>

      <ScrollView
        style={s.flex}
        contentContainerStyle={s.idleContent}
        showsVerticalScrollIndicator={false}
      >
        {/* hero */}
        <View style={s.idleIcon}>
          <Ionicons name="scan" size={64} color={GREEN} />
        </View>
        <Text style={s.idleTitle}>Ready to Scan</Text>
        <Text style={s.idleText}>
          Point your camera at any product barcode to instantly check its
          ingredients for haram or unclear substances.
        </Text>

        <TouchableOpacity
          style={[s.startBtn, !permission?.canAskAgain && !permission?.granted && s.startBtnSettings]}
          onPress={async () => {
            setScanned(false);
            if (!permission?.granted) {
              if (permission?.canAskAgain) {
                const result = await requestPermission();
                if (result.granted) setScreenState('scanning');
              } else {
                Linking.openSettings();
              }
            } else {
              setScreenState('scanning');
            }
          }}
        >
          <Ionicons name="camera-outline" size={20} color="#fff" />
          <Text style={s.startBtnText}>
            {!permission?.granted && !permission?.canAskAgain
              ? 'Enable Camera in Settings'
              : 'Start Scanning'}
          </Text>
        </TouchableOpacity>

        {/* or divider */}
        <View style={s.orDivider}>
          <View style={s.orLine} />
          <Text style={s.orText}>or enter barcode manually</Text>
          <View style={s.orLine} />
        </View>

        {/* manual barcode entry */}
        <View style={s.manualRow}>
          <TextInput
            ref={manualInputRef}
            style={s.manualInput}
            placeholder="Enter barcode manually…"
            placeholderTextColor="#bbb"
            value={manualBarcode}
            onChangeText={setManualBarcode}
            keyboardType="number-pad"
            returnKeyType="search"
            onSubmitEditing={handleManualSubmit}
          />
          <TouchableOpacity
            style={[s.manualBtn, !manualBarcode.trim() && s.manualBtnDisabled]}
            onPress={handleManualSubmit}
            disabled={!manualBarcode.trim()}
          >
            <Ionicons name="search" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* recent scans */}
        {history.length > 0 && (
          <View style={s.historyCard}>
            <Text style={s.historyTitle}>Recent Scans</Text>
            {history.map((entry, idx) => {
              const verdictColor = entry.verdict === 'halal' ? GREEN : entry.verdict === 'haram' ? RED : entry.verdict === 'unclear' ? AMBER : '#aaa';
              const verdictIcon  = entry.verdict === 'halal' ? 'checkmark-circle' : entry.verdict === 'haram' ? 'close-circle' : entry.verdict === 'unclear' ? 'warning' : 'help-circle-outline';
              return (
                <TouchableOpacity
                  key={entry.barcode + entry.timestamp}
                  style={[s.historyRow, idx === 0 && s.historyRowFirst]}
                  onPress={() => { setScanned(true); runLookup(entry.barcode); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={verdictIcon as any} size={18} color={verdictColor} />
                  <View style={s.historyInfo}>
                    <Text style={s.historyName} numberOfLines={1}>{entry.name}</Text>
                    <Text style={s.historyBarcode}>{entry.barcode}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#ccc" />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* what we check */}
        <View style={s.infoCard}>
          <Text style={s.infoCardTitle}>What we flag</Text>
          {[
            { icon: 'close-circle', color: RED,   label: 'Haram',   items: 'Pork, lard, alcohol, carmine, gelatin (non-fish)' },
            { icon: 'warning',      color: AMBER,  label: 'Unclear', items: 'Natural flavors, rennet, L-Cysteine, mono/diglycerides' },
            { icon: 'checkmark-circle', color: GREEN, label: 'Halal', items: 'No flagged ingredients detected' },
          ].map(row => (
            <View key={row.label} style={s.infoRow}>
              <Ionicons name={row.icon as any} size={18} color={row.color} />
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: row.color }]}>{row.label}</Text>
                <Text style={s.infoItems}>{row.items}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={s.disclaimer}>
          Results are based on ingredient text from Open Food Facts and automated analysis.
          Always verify with the manufacturer for certified halal assurance.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: '#f7f7f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f7f7f7', gap: 12 },

  // permission
  permCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 32, maxWidth: 320, gap: 0 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  permTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 10, textAlign: 'center' },
  permText:  { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 21, marginBottom: 24 },

  // shared green button
  greenBtn: { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  greenBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // loading
  loadingTitle:   { fontSize: 17, fontWeight: '600', color: '#555' },
  loadingBarcode: { fontSize: 13, color: '#aaa', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // error
  errTitle: { fontSize: 18, fontWeight: '700', color: '#c0392b' },
  errMsg:   { fontSize: 14, color: '#777', textAlign: 'center', lineHeight: 20 },

  // camera
  cameraContainer: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanFrame: { width: 260, height: 180, position: 'relative' },
  corner: {
    position: 'absolute', width: CORNER, height: CORNER,
    borderColor: '#fff', borderWidth: CORNER_W,
  },
  tl: { top: 0,    left: 0,  borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 0,    right: 0, borderLeftWidth: 0,  borderBottomWidth: 0 },
  bl: { bottom: 0, left: 0,  borderRightWidth: 0, borderTopWidth: 0    },
  br: { bottom: 0, right: 0, borderLeftWidth: 0,  borderTopWidth: 0    },
  scanHint: {
    color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 24,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
    textAlign: 'center', paddingHorizontal: 32,
  },
  stopBtn: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
  },

  // result header
  resultHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
  },
  resultHeaderTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111' },
  scanAgainBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },

  // product
  productImage: { width: '100%', height: 200, backgroundColor: '#fafafa' },
  imagePlaceholder: {
    height: 140, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5',
  },
  imagePlaceholderEmoji: { fontSize: 56 },
  productInfo: {
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    marginBottom: 12,
  },
  productName:    { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 4 },
  productBrand:   { fontSize: 14, color: '#777', marginBottom: 4 },
  productBarcode: { fontSize: 12, color: '#bbb', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  eNumDisclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#fafafa', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  eNumDisclaimerText: { flex: 1, fontSize: 12, color: '#aaa', lineHeight: 17 },

  // flag summary chips
  flagSummary: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  chipText: { fontSize: 13, fontWeight: '600' },

  // ingredients section
  section:      { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 12 },
  noDataBox: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  noDataTitle: { fontSize: 16, fontWeight: '600', color: '#ccc' },
  noDataText:  { fontSize: 13, color: '#bbb', textAlign: 'center', lineHeight: 19 },

  // report button
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#ebebeb', backgroundColor: '#fafafa',
  },
  reportText: { fontSize: 14, color: '#999', fontWeight: '500' },

  // idle
  idleHeader: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  idleHeaderTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
  idleHeaderSub:   { fontSize: 13, color: '#aaa', marginTop: 2 },
  idleContent: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24, paddingBottom: 40 },
  idleIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  idleTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 8 },
  idleText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  startBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 40,
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20,
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  startBtnSettings: { backgroundColor: '#888' },

  // or divider
  orDivider: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 10, marginBottom: 14 },
  orLine:    { flex: 1, height: 1, backgroundColor: '#ebebeb' },
  orText:    { fontSize: 12, color: '#bbb', fontWeight: '500' },

  // manual barcode entry
  manualRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '100%', marginBottom: 24,
  },
  manualInput: {
    flex: 1, borderWidth: 1.5, borderColor: '#ebebeb', borderRadius: 14,
    paddingVertical: 11, paddingHorizontal: 14,
    fontSize: 14, color: '#111', backgroundColor: '#fafafa',
  },
  manualBtn: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
  },
  manualBtnDisabled: { opacity: 0.4 },

  // scan history
  historyCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  historyTitle: { fontSize: 13, fontWeight: '700', color: '#aaa', letterSpacing: 0.4, marginBottom: 4 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  historyRowFirst: { borderTopWidth: 0 },
  historyInfo: { flex: 1 },
  historyName:    { fontSize: 14, fontWeight: '600', color: '#111' },
  historyBarcode: { fontSize: 11, color: '#bbb', marginTop: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // info card on idle
  infoCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    padding: 16, marginBottom: 20, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  infoCardTitle: { fontSize: 13, fontWeight: '700', color: '#aaa', letterSpacing: 0.4, marginBottom: 2 },
  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoLabel: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  infoItems: { fontSize: 12, color: '#999', lineHeight: 18 },

  disclaimer: { fontSize: 11, color: '#ccc', textAlign: 'center', lineHeight: 17, paddingHorizontal: 8 },
});
