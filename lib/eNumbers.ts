// Static E-number halal status lookup table.
// Source: curated from MUIS, E-Code Halal Check, and established Islamic dietary scholarship.
// This file never needs a network call — embed it at build time.

export type HalalStatus = 'halal' | 'haram' | 'unclear';

export interface EEntry {
  name: string;
  status: HalalStatus;
  notes?: string;
}

// Keys are normalised E-numbers: 'E' followed by digits (no spaces/dashes).
// lookupENumber() handles denormalised inputs like "E 120" or "E-120".
export const E_NUMBERS: Record<string, EEntry> = {
  // ── Explicitly halal common additives ────────────────────────────────────
  // Listed so they are never caught by a false positive match elsewhere.
  'E330': { name: 'Citric Acid',         status: 'halal', notes: 'Derived from fermentation of carbohydrates' },
  'E331': { name: 'Sodium Citrate',      status: 'halal', notes: 'Salt of citric acid — halal' },
  'E332': { name: 'Potassium Citrate',   status: 'halal', notes: 'Salt of citric acid — halal' },
  'E333': { name: 'Calcium Citrate',     status: 'halal', notes: 'Salt of citric acid — halal' },
  'E300': { name: 'Ascorbic Acid (Vitamin C)', status: 'halal', notes: 'Synthetic or plant-derived' },
  'E301': { name: 'Sodium Ascorbate',    status: 'halal', notes: 'Synthetic — halal' },
  'E302': { name: 'Calcium Ascorbate',   status: 'halal', notes: 'Synthetic — halal' },
  'E306': { name: 'Tocopherols (Vitamin E)', status: 'halal', notes: 'Plant-derived antioxidant' },
  'E322': { name: 'Lecithin',            status: 'halal', notes: 'Usually soy or sunflower-derived; halal unless explicitly animal-sourced' },
  'E407': { name: 'Carrageenan',         status: 'halal', notes: 'Derived from seaweed' },
  'E410': { name: 'Locust Bean Gum',     status: 'halal', notes: 'Plant-derived' },
  'E412': { name: 'Guar Gum',            status: 'halal', notes: 'Plant-derived' },
  'E415': { name: 'Xanthan Gum',         status: 'halal', notes: 'Microbial fermentation' },
  'E440': { name: 'Pectin',              status: 'halal', notes: 'Plant-derived (citrus peel / apple)' },
  'E500': { name: 'Sodium Carbonates',   status: 'halal', notes: 'Mineral / synthetic' },
  'E501': { name: 'Potassium Carbonates',status: 'halal', notes: 'Mineral / synthetic' },
  'E503': { name: 'Ammonium Carbonates', status: 'halal', notes: 'Synthetic' },
  'E621': { name: 'Monosodium Glutamate (MSG)', status: 'halal', notes: 'Fermentation-derived; halal' },

  // ── Colours ───────────────────────────────────────────────────────────────
  'E120': { name: 'Carmine / Cochineal', status: 'haram',   notes: 'Derived from cochineal insects' },
  'E161': { name: 'Xanthophylls',        status: 'unclear', notes: 'May be derived from animal sources' },

  // ── Preservatives ─────────────────────────────────────────────────────────
  // E200–E299: generally from synthetic or plant sources — mostly halal
  'E270': { name: 'Lactic Acid',         status: 'unclear', notes: 'Usually plant/microbial; animal-derived forms exist' },

  // ── Antioxidants ──────────────────────────────────────────────────────────
  // E300–E321: mostly synthetic — generally halal; no entries needed

  // ── Thickeners / Stabilisers / Emulsifiers ────────────────────────────────
  'E422': { name: 'Glycerol / Glycerin', status: 'unclear', notes: 'May be animal-derived; source not specified' },
  'E430': { name: 'Polyoxyethylene (8) stearate',  status: 'unclear', notes: 'Stearate may be animal-derived' },
  'E431': { name: 'Polyoxyethylene (40) stearate', status: 'unclear', notes: 'Stearate may be animal-derived' },
  'E432': { name: 'Polysorbate 20',      status: 'unclear', notes: 'Derived from sorbitol and fatty acids; source of fatty acid unclear' },
  'E433': { name: 'Polysorbate 80',      status: 'unclear', notes: 'Derived from sorbitol and fatty acids; source of fatty acid unclear' },
  'E434': { name: 'Polysorbate 40',      status: 'unclear', notes: 'Derived from sorbitol and fatty acids; source of fatty acid unclear' },
  'E435': { name: 'Polysorbate 60',      status: 'unclear', notes: 'Derived from sorbitol and fatty acids; source of fatty acid unclear' },
  'E436': { name: 'Polysorbate 65',      status: 'unclear', notes: 'Derived from sorbitol and fatty acids; source of fatty acid unclear' },
  'E441': { name: 'Gelatin',             status: 'haram',   notes: 'Source not confirmed as halal-certified, fish-based, or plant-based' },
  'E470': { name: 'Fatty Acid Salts',    status: 'unclear', notes: 'May be animal-derived' },
  'E471': { name: 'Mono- and Diglycerides of Fatty Acids', status: 'unclear', notes: 'May be animal-derived; source not specified' },
  'E472': { name: 'Esters of Mono- and Diglycerides',      status: 'unclear', notes: 'May be animal-derived' },
  'E472a': { name: 'Acetic Acid Esters of Mono- and Diglycerides', status: 'unclear', notes: 'May be animal-derived' },
  'E472b': { name: 'Lactic Acid Esters of Mono- and Diglycerides', status: 'unclear', notes: 'May be animal-derived' },
  'E472c': { name: 'Citric Acid Esters of Mono- and Diglycerides', status: 'unclear', notes: 'May be animal-derived' },
  'E472d': { name: 'Tartaric Acid Esters of Mono- and Diglycerides', status: 'unclear', notes: 'May be animal-derived' },
  'E472e': { name: 'Diacetyl Tartaric Acid Esters of Mono- and Diglycerides', status: 'unclear', notes: 'May be animal-derived' },
  'E472f': { name: 'Mixed Acetic and Tartaric Acid Esters of Mono- and Diglycerides', status: 'unclear', notes: 'May be animal-derived' },
  'E473': { name: 'Sucrose Esters of Fatty Acids', status: 'unclear', notes: 'Fatty acid source may be animal-derived' },
  'E474': { name: 'Sucroglycerides',     status: 'unclear', notes: 'May be animal-derived' },
  'E475': { name: 'Polyglycerol Esters of Fatty Acids', status: 'unclear', notes: 'May be animal-derived' },
  'E476': { name: 'Polyglycerol Polyricinoleate', status: 'unclear', notes: 'Usually castor oil-derived but verify' },
  'E477': { name: 'Propane-1,2-diol Esters of Fatty Acids', status: 'unclear', notes: 'Fatty acid source may be animal-derived' },
  'E479': { name: 'Thermally Oxidised Soya Bean Oil', status: 'unclear', notes: 'Interacted with mono/diglycerides which may be animal-derived' },
  'E481': { name: 'Sodium Stearoyl-2-Lactylate', status: 'unclear', notes: 'Stearate may be animal-derived' },
  'E482': { name: 'Calcium Stearoyl-2-Lactylate', status: 'unclear', notes: 'Stearate may be animal-derived' },
  'E483': { name: 'Stearyl Tartrate',    status: 'unclear', notes: 'Stearate may be animal-derived' },
  'E491': { name: 'Sorbitan Monostearate', status: 'unclear', notes: 'Stearate may be animal-derived' },
  'E492': { name: 'Sorbitan Tristearate', status: 'unclear', notes: 'Stearate may be animal-derived' },
  'E493': { name: 'Sorbitan Monolaurate', status: 'unclear', notes: 'Laurate may be animal-derived' },
  'E494': { name: 'Sorbitan Monooleate', status: 'unclear', notes: 'Oleate may be animal-derived' },
  'E495': { name: 'Sorbitan Monopalmitate', status: 'unclear', notes: 'Palmitate may be animal-derived' },

  // ── Flavour Enhancers ─────────────────────────────────────────────────────
  'E627': { name: 'Disodium Guanylate',  status: 'unclear', notes: 'Commonly derived from pork or fish; source rarely stated' },
  'E628': { name: 'Dipotassium Guanylate', status: 'unclear', notes: 'Commonly derived from pork or fish; source rarely stated' },
  'E629': { name: 'Calcium Guanylate',   status: 'unclear', notes: 'Commonly derived from pork or fish; source rarely stated' },
  'E630': { name: 'Inosinic Acid',       status: 'unclear', notes: 'Commonly derived from pork or fish; source rarely stated' },
  'E631': { name: 'Disodium Inosinate',  status: 'unclear', notes: 'Commonly derived from pork or fish; source rarely stated' },
  'E632': { name: 'Dipotassium Inosinate', status: 'unclear', notes: 'Commonly derived from pork or fish; source rarely stated' },
  'E633': { name: 'Calcium Inosinate',   status: 'unclear', notes: 'Commonly derived from pork or fish; source rarely stated' },
  'E634': { name: 'Calcium 5-Ribonucleotides', status: 'unclear', notes: 'Commonly derived from pork or fish; source rarely stated' },
  'E635': { name: 'Disodium 5-Ribonucleotides', status: 'unclear', notes: 'Commonly derived from pork or fish; source rarely stated' },

  // ── Glazing Agents ────────────────────────────────────────────────────────
  'E901': { name: 'Beeswax',             status: 'unclear', notes: 'Insect-derived; debated among scholars' },
  'E904': { name: 'Shellac',             status: 'unclear', notes: 'Secreted by lac insects; classified as unclear in most halal standards' },

  // ── Enzymes / Other ───────────────────────────────────────────────────────
  'E920': { name: 'L-Cysteine',          status: 'unclear', notes: 'Often derived from pork or poultry by-products' },

  // ── Minerals / Bone-derived ───────────────────────────────────────────────
  'E542': { name: 'Bone Phosphate',      status: 'unclear', notes: 'Derived from animal bones; halal status depends on slaughter method' },

  // ── Acids (generally halal but a few are unclear) ─────────────────────────
  'E570': { name: 'Fatty Acids',         status: 'unclear', notes: 'May be animal-derived; source not specified' },
};

// ─── lookup helper ────────────────────────────────────────────────────────────

// Extracts the first E-number from an ingredient string (handles "E120", "E 120", "E-120")
// and returns the matching entry, or null if not found or not in the table.
export function lookupENumber(ingredient: string): EEntry | null {
  const match = ingredient.match(/\bE[-\s]?(\d{3,4}[a-z]?)\b/i);
  if (!match) return null;
  const key = `E${match[1].toLowerCase()}`;
  // Try exact key first, then uppercase variant
  return E_NUMBERS[key] ?? E_NUMBERS[key.toUpperCase()] ?? null;
}
