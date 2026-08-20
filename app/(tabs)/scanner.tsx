import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Modal, Platform,
  TextInput, Linking, Share,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { lookupENumber, HalalStatus } from '../../lib/eNumbers';
import { fetchWithTimeout, formatError } from '../../lib/errors';
import { APP_VERSION } from '../../lib/appVersion';
import { Brand } from '../../lib/theme';

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

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN  = Brand.green;
const RED    = Brand.red;
const AMBER  = Brand.amber;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const CORNER = 24;
const CORNER_W = 3;
const PLACEHOLDER_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';
const FRAME_TAN = '#EDE4D2'; // soft tan backdrop behind framed product photos

// Rounded viewfinder-style corner brackets — shared visual motif across the
// idle hero, live camera overlay, and result product photo.
function ScanCorners({ color, size = CORNER, thickness = CORNER_W }: {
  color: string; size?: number; thickness?: number;
}) {
  const base = { borderColor: color, width: size, height: size, borderWidth: thickness };
  return (
    <>
      <View style={[frame.corner, frame.tl, base]} />
      <View style={[frame.corner, frame.tr, base]} />
      <View style={[frame.corner, frame.bl, base]} />
      <View style={[frame.corner, frame.br, base]} />
    </>
  );
}

const frame = StyleSheet.create({
  corner: { position: 'absolute' },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 10 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 10 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 10 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 10 },
});

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
      { headers: { 'User-Agent': `HalalForMe/${APP_VERSION}` } },
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

  // Detect whether the product has English ingredient data.
  // `languages_codes` is an object like { "en": 1, "sv": 1 } — the most
  // reliable signal from OFF. Fall back to checking for ingredients_text_en.
  const hasEnglishData =
    (p.languages_codes && typeof p.languages_codes === 'object' && 'en' in p.languages_codes)
    || !!p.ingredients_text_en;

  if (Array.isArray(p.ingredients) && p.ingredients.length > 0) {
    // Prefer English text if available; otherwise use the structured array
    // (which may be in a foreign language) but flag it.
    if (!hasEnglishData) nonEnglishText = true;
    const rawEn = p.ingredients_text_en || '';
    ingredients = rawEn
      ? parseIngredients(rawEn)
      : flattenNodes(p.ingredients as IngNode[]).filter(s => s.length > 1);
  } else {
    // Raw text path: prefer English field, fall back to default.
    const rawText = p.ingredients_text_en || p.ingredients_text || '';
    if (!hasEnglishData && rawText.length > 0) nonEnglishText = true;
    ingredients = parseIngredients(rawText);
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

function VerdictHero({ verdict, productName, brand, onBack, onScanAgain, onShare, certifiedHalal, hasPorkAllergen, nonEnglishText, isVeganOrVegetarian, communityVerified }: {
  verdict: ProductResult['verdict'];
  productName: string;
  brand: string;
  onBack: () => void;
  onScanAgain: () => void;
  onShare: () => void;
  certifiedHalal: boolean;
  hasPorkAllergen: boolean;
  nonEnglishText: boolean;
  isVeganOrVegetarian: boolean;
  communityVerified: boolean;
}) {
  const insets = useSafeAreaInsets();
  const cfg = {
    halal:   { bg: GREEN,      icon: 'checkmark-circle',   label: 'HALAL',   sub: 'No prohibited ingredients detected' },
    haram:   { bg: RED,        icon: 'close-circle',       label: 'HARAM',   sub: 'Prohibited ingredients detected' },
    unclear: { bg: AMBER,      icon: 'help-circle',        label: 'UNCLEAR', sub: 'Some ingredients need verification' },
    no_data: { bg: TEXT_MUTED, icon: 'information-circle', label: 'NO DATA', sub: nonEnglishText ? 'Ingredient list not in English — verify manually' : 'No ingredient information found' },
  }[verdict];

  return (
    <View style={[vh.block, { backgroundColor: cfg.bg, paddingTop: insets.top + 10 }]}>
      {/* nav row */}
      <View style={vh.navRow}>
        <TouchableOpacity style={vh.navBtn} onPress={onBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={vh.navBtn} onPress={onShare} hitSlop={8}>
          <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={{ width: 10 }} />
        <TouchableOpacity style={vh.navBtn} onPress={onScanAgain} hitSlop={8}>
          <Ionicons name="scan-outline" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </View>

      {/* verdict */}
      <View style={vh.center}>
        <Ionicons name={cfg.icon as any} size={72} color="rgba(255,255,255,0.95)" />
        <Text style={vh.verdict}>{cfg.label}</Text>
        <Text style={vh.sub}>{cfg.sub}</Text>
      </View>

      {/* product identity */}
      <View style={vh.product}>
        <Text style={vh.productName} numberOfLines={2}>{productName}</Text>
        {brand ? <Text style={vh.brand}>{brand}</Text> : null}
      </View>

      {/* trust badges */}
      {(communityVerified || certifiedHalal || isVeganOrVegetarian || hasPorkAllergen) && (
        <View style={vh.badges}>
          {communityVerified && (
            <View style={vh.badge}>
              <Ionicons name="shield-checkmark-outline" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={vh.badgeText}>Verified by Rihdal team</Text>
            </View>
          )}
          {certifiedHalal && (
            <View style={vh.badge}>
              <Ionicons name="ribbon-outline" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={vh.badgeText}>Halal Certified (per label)</Text>
            </View>
          )}
          {isVeganOrVegetarian && (
            <View style={vh.badge}>
              <Ionicons name="leaf-outline" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={vh.badgeText}>Vegan / Vegetarian</Text>
            </View>
          )}
          {hasPorkAllergen && (
            <View style={vh.badge}>
              <Ionicons name="warning-outline" size={12} color="rgba(255,255,255,0.9)" />
              <Text style={vh.badgeText}>Pork allergen declared on label</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const vh = StyleSheet.create({
  block:  { paddingHorizontal: 24, paddingBottom: 32 },
  navRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  navBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  center:      { alignItems: 'center', gap: 8, marginBottom: 28 },
  verdict:     { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  sub:         { fontSize: 14, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 20 },
  product:     { marginBottom: 16, gap: 2 },
  productName: { fontSize: 18, fontWeight: '700', color: '#fff', lineHeight: 24 },
  brand:       { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  badges:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
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
  dot:        { width: 5, height: 5, borderRadius: 3, backgroundColor: TEXT_MUTED, marginTop: 7 },
  normalText: { flex: 1, fontSize: 14, color: TEXT_MUTED, lineHeight: 20 },
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

function ReportModal({ visible, productName, barcode, verdict, preselectedReason, onClose }: {
  visible: boolean;
  productName: string;
  barcode: string;
  verdict: ProductResult['verdict'];
  preselectedReason?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected]   = useState<string | null>(preselectedReason ?? null);
  const [submitted, setSubmitted] = useState(false);

  // Sync preselected reason when the modal opens with a different value
  useEffect(() => {
    if (visible) setSelected(preselectedReason ?? null);
  }, [visible, preselectedReason]);

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
            <Ionicons name="close" size={18} color={TEXT_MUTED} />
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
    backgroundColor: CREAM, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 20,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: TEXT_DARK, marginBottom: 4 },
  sub:   { fontSize: 13, color: TEXT_MUTED, marginBottom: 20 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1.5,
    borderColor: HAIRLINE, marginBottom: 8, backgroundColor: CREAM,
  },
  optionSelected: { borderColor: GREEN, backgroundColor: '#f0faf6' },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: TEXT_MUTED, alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: GREEN },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN },
  optionText: { flex: 1, fontSize: 14, color: TEXT_MUTED },
  optionTextSelected: { color: GREEN, fontWeight: '600' },
  submitBtn: {
    marginTop: 8, backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  thanks: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  thanksTitle: { fontSize: 22, fontWeight: '800', color: TEXT_DARK },
  thanksSub:   { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
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
  const [reportOpen,        setReportOpen]        = useState(false);
  const [reportPreselected, setReportPreselected] = useState<string | undefined>(undefined);

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
      await saveScanHistory(entry);
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
        <Ionicons name="wifi-outline" size={52} color={TEXT_MUTED} />
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

    const handleShare = () => {
      const name = result.name || 'This product';
      const verdictLine = {
        halal:   `✅ ${name} appears to be halal — no prohibited ingredients detected.`,
        haram:   `❌ ${name} contains prohibited ingredients: ${result.flagged.filter(f => f.severity === 'haram').map(f => f.label).join(', ')}.`,
        unclear: `⚠️ ${name} has ingredients that need verification: ${result.flagged.filter(f => f.severity === 'unclear').map(f => f.label).join(', ')}.`,
        no_data: `❓ No ingredient data found for ${name} — verify manually.`,
      }[result.verdict];
      Share.share({ message: `${verdictLine}\n\nChecked with Rihdal — the Muslim lifestyle app.` });
    };

    return (
      <SafeAreaView style={s.flex} edges={[]}>
        <ScrollView
          style={s.flex}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* full-bleed verdict hero */}
          <VerdictHero
            verdict={result.verdict}
            productName={result.name}
            brand={result.brand}
            onBack={reset}
            onScanAgain={() => { setScanned(false); setResult(null); setScreenState('scanning'); }}
            onShare={handleShare}
            certifiedHalal={result.certifiedHalal}
            hasPorkAllergen={result.hasPorkAllergen}
            nonEnglishText={result.nonEnglishText}
            isVeganOrVegetarian={result.isVeganOrVegetarian}
            communityVerified={result.communityVerified}
          />

          {/* product image */}
          <View style={s.photoFrame}>
            <View style={s.photoInner}>
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
            </View>
            <ScanCorners color={DEEP_GREEN} size={22} thickness={3} />

            {(result.certifiedHalal || result.isVeganOrVegetarian || result.communityVerified || result.hasPorkAllergen) && (
              <View style={s.photoBadgeRow}>
                {result.certifiedHalal && (
                  <View style={[s.photoBadge, { backgroundColor: GREEN }]}>
                    <Ionicons name="ribbon-outline" size={14} color="#fff" />
                  </View>
                )}
                {result.isVeganOrVegetarian && (
                  <View style={[s.photoBadge, { backgroundColor: '#16a34a' }]}>
                    <Ionicons name="leaf-outline" size={14} color="#fff" />
                  </View>
                )}
                {result.communityVerified && (
                  <View style={[s.photoBadge, { backgroundColor: '#3b82f6' }]}>
                    <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
                  </View>
                )}
                {result.hasPorkAllergen && (
                  <View style={[s.photoBadge, { backgroundColor: RED }]}>
                    <Ionicons name="warning-outline" size={14} color="#fff" />
                  </View>
                )}
              </View>
            )}
          </View>

          {/* barcode */}
          <View style={s.productInfo}>
            <Text style={s.productBarcode}>Barcode: {result.barcode}</Text>
          </View>

          {/* analysis disclaimer */}
          <View style={s.eNumDisclaimer}>
            <Ionicons name="information-circle-outline" size={14} color={TEXT_MUTED} />
            <Text style={s.eNumDisclaimerText}>
              Results are based on ingredient text analysis and may not be fully accurate. E-number status can vary by manufacturer. Verify with the manufacturer for certainty.
            </Text>
          </View>

          {/* fast-path wrong verdict report */}
          <TouchableOpacity
            style={s.wrongVerdictBtn}
            onPress={() => {
              const preselect =
                result.verdict === 'halal'   ? 'Verdict should be Haram' :
                result.verdict === 'haram'   ? 'Verdict should be Halal' :
                result.verdict === 'unclear' ? 'Verdict should be Halal' :
                'Missing product information';
              setReportPreselected(preselect);
              setReportOpen(true);
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="alert-circle-outline" size={15} color={AMBER} />
            <Text style={s.wrongVerdictText}>This seems wrong?</Text>
          </TouchableOpacity>

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

            {result.nonEnglishText && result.ingredients.length > 0 && (
              <View style={s.langWarning}>
                <Ionicons name="language-outline" size={14} color={AMBER} />
                <Text style={s.langWarningText}>
                  Ingredient list is not in English — analysis is based on available text and may miss some ingredients. Verify manually.
                </Text>
              </View>
            )}

            {result.notFound ? (
              <View style={s.noDataBox}>
                <Ionicons name="cube-outline" size={32} color={TEXT_MUTED} />
                <Text style={s.noDataTitle}>Product not in database</Text>
                <Text style={s.noDataText}>
                  We couldn't find this product. Try searching by name or report it to help us improve.
                </Text>
              </View>
            ) : result.ingredients.length === 0 ? (
              <View style={s.noDataBox}>
                <Ionicons name="document-text-outline" size={32} color={TEXT_MUTED} />
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

          {/* report button — general issues, no preselection */}
          <TouchableOpacity
            style={s.reportBtn}
            onPress={() => { setReportPreselected(undefined); setReportOpen(true); }}
          >
            <Ionicons name="flag-outline" size={16} color={TEXT_MUTED} />
            <Text style={s.reportText}>Report this result</Text>
          </TouchableOpacity>
        </ScrollView>

        <ReportModal
          visible={reportOpen}
          productName={result.name}
          barcode={result.barcode}
          verdict={result.verdict}
          preselectedReason={reportPreselected}
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
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarcode}
          />

          {/* dim overlay with scan frame cut-out effect */}
          <View style={s.overlay}>
            <View style={s.scanFrame}>
              <ScanCorners color="#fff" size={28} thickness={3} />
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
        <View style={s.idleFrame}>
          <Ionicons name="scan" size={56} color={DEEP_GREEN} />
          <ScanCorners color={DEEP_GREEN} size={24} thickness={3} />
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

        {/* recent scans — shown immediately after scan button for returning users */}
        {history.length > 0 && (
          <View style={s.historyCard}>
            <Text style={s.historyTitle}>Recent Scans</Text>
            {history.map((entry, idx) => {
              const verdictColor = entry.verdict === 'halal' ? GREEN : entry.verdict === 'haram' ? RED : entry.verdict === 'unclear' ? AMBER : TEXT_MUTED;
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
                  <Ionicons name="chevron-forward" size={14} color={TEXT_MUTED} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

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
            placeholderTextColor={TEXT_MUTED}
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
  flex:   { flex: 1, backgroundColor: CREAM },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: CREAM, gap: 12 },

  // permission
  permCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 32, maxWidth: 320, gap: 0 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  permTitle: { fontSize: 20, fontWeight: '700', color: TEXT_DARK, marginBottom: 10, textAlign: 'center' },
  permText:  { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 21, marginBottom: 24 },

  // shared green button
  greenBtn: { backgroundColor: DEEP_GREEN, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  greenBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // loading
  loadingTitle:   { fontSize: 17, fontWeight: '600', color: TEXT_MUTED },
  loadingBarcode: { fontSize: 13, color: TEXT_MUTED, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // error
  errTitle: { fontSize: 18, fontWeight: '700', color: RED },
  errMsg:   { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },

  // camera
  cameraContainer: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanFrame: { width: 260, height: 180, position: 'relative' },
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

  // product photo frame
  photoFrame: {
    marginHorizontal: 16, marginTop: 4, marginBottom: 28,
    height: 220, position: 'relative',
  },
  photoInner: {
    flex: 1, borderRadius: 24, overflow: 'hidden',
    backgroundColor: FRAME_TAN, alignItems: 'center', justifyContent: 'center',
  },
  productImage: { width: '100%', height: '100%' },
  imagePlaceholder: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center',
  },
  imagePlaceholderEmoji: { fontSize: 56 },
  photoBadgeRow: {
    position: 'absolute', bottom: -14, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 10,
  },
  photoBadge: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: CREAM,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  productInfo: {
    paddingHorizontal: 20, paddingVertical: 10,
    marginBottom: 12,
  },
  productBarcode: { fontSize: 12, color: TEXT_MUTED, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  eNumDisclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: CREAM, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: HAIRLINE,
  },
  eNumDisclaimerText: { flex: 1, fontSize: 12, color: TEXT_MUTED, lineHeight: 17 },

  // flag summary chips
  flagSummary: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  chipText: { fontSize: 13, fontWeight: '600' },

  // ingredients section
  section: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: TEXT_DARK, marginBottom: 12 },
  noDataBox: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  noDataTitle: { fontSize: 16, fontWeight: '600', color: TEXT_MUTED },
  noDataText:  { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 19 },
  langWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(217,119,6,0.08)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(217,119,6,0.2)', marginBottom: 12,
  },
  langWarningText: { flex: 1, fontSize: 12, color: AMBER, lineHeight: 17 },

  // report button
  wrongVerdictBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, marginBottom: 12, paddingVertical: 11, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#EEDCB8', backgroundColor: '#FBF3E6',
  },
  wrongVerdictText: { fontSize: 13, color: AMBER, fontWeight: '600' },

  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: HAIRLINE, backgroundColor: CREAM,
  },
  reportText: { fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },

  // idle
  idleHeader: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  idleHeaderTitle: { fontSize: 22, fontWeight: '800', color: TEXT_DARK },
  idleHeaderSub:   { fontSize: 13, color: TEXT_MUTED, marginTop: 2 },
  idleContent: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24, paddingBottom: 40 },
  idleFrame: {
    width: 180, height: 140, borderRadius: 24,
    backgroundColor: FRAME_TAN, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, position: 'relative',
  },
  idleTitle: { fontSize: 22, fontWeight: '800', color: TEXT_DARK, marginBottom: 8 },
  idleText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  startBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 40,
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20,
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  startBtnSettings: { backgroundColor: TEXT_MUTED },

  // or divider
  orDivider: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 10, marginBottom: 14 },
  orLine:    { flex: 1, height: 1, backgroundColor: HAIRLINE },
  orText:    { fontSize: 12, color: TEXT_MUTED, fontWeight: '500' },

  // manual barcode entry
  manualRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '100%', marginBottom: 24,
  },
  manualInput: {
    flex: 1, borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 14,
    paddingVertical: 11, paddingHorizontal: 14,
    fontSize: 14, color: TEXT_DARK, backgroundColor: CREAM,
  },
  manualBtn: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: DEEP_GREEN, alignItems: 'center', justifyContent: 'center',
  },
  manualBtnDisabled: { opacity: 0.4 },

  // scan history
  historyCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  historyTitle: { fontSize: 13, fontWeight: '700', color: TEXT_MUTED, letterSpacing: 0.4, marginBottom: 4 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  historyRowFirst: { borderTopWidth: 0 },
  historyInfo: { flex: 1 },
  historyName:    { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  historyBarcode: { fontSize: 11, color: TEXT_MUTED, marginTop: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // info card on idle
  infoCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    padding: 16, marginBottom: 20, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  infoCardTitle: { fontSize: 13, fontWeight: '700', color: TEXT_MUTED, letterSpacing: 0.4, marginBottom: 2 },
  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoLabel: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  infoItems: { fontSize: 12, color: TEXT_MUTED, lineHeight: 18 },

  disclaimer: { fontSize: 11, color: TEXT_MUTED, textAlign: 'center', lineHeight: 17, paddingHorizontal: 8 },
});
