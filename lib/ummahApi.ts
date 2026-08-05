/**
 * Typed client for UmmahAPI (https://ummahapi.com).
 * No auth required; 5,000 req / 15 min anonymous rate limit.
 * All endpoints return { success: boolean; data: T }.
 *
 * Caching strategy:
 *   daily dua     — date-keyed key, stored raw (key expiry = new day)
 *   dua categories — 24-hour TTL envelope
 *   duas by cat   — 24-hour TTL envelope
 *   surah list    — 7-day TTL envelope
 *   surah detail  — 7-day TTL envelope
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from './errors';

const BASE = 'https://ummahapi.com/api';
const TIMEOUT = 12_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DuaCategory {
  category: string;
  label: string;
  count: number;
}

export interface Dua {
  id: number;
  title: string;
  arabic: string;
  transliteration: string;
  translation: string;
  reference: string;
  category: string;
}

export interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: 'Meccan' | 'Medinan';
}

export interface Ayah {
  number: number;
  text: string;
  transliteration: string;
  translations: { en: { text: string } };
}

export interface SurahDetail extends Surah {
  ayahs: Ayah[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TTL_24H  = 24 * 60 * 60 * 1000;
const TTL_7D   = 7  * 24 * 60 * 60 * 1000;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {}, TIMEOUT);
  if (!res.ok) throw new Error(`UmmahAPI ${res.status}: ${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(`UmmahAPI returned success=false for ${path}`);
  return json.data as T;
}

async function readCache<T>(key: string, ttl: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { timestamp, data } = JSON.parse(raw);
    if (Date.now() - timestamp > ttl) return null;
    return data as T;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  } catch {
    // cache write failure is non-fatal
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns a random dua, cached for today (new key each calendar day).
 * Also cleans up yesterday's key to keep storage bounded.
 */
export async function fetchRandomDua(): Promise<Dua> {
  const key = `daily_dua_v1:${today()}`;

  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Dua;
  } catch {
    // fall through to fetch
  }

  const dua = await get<Dua>('/duas/random');

  // store raw (no envelope — TTL is the date in the key itself)
  try {
    await AsyncStorage.setItem(key, JSON.stringify(dua));
  } catch {
    // non-fatal
  }

  // fire-and-forget: remove yesterday's key
  const yesterday = new Date(Date.now() - 86_400_000);
  const yk = `daily_dua_v1:${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  AsyncStorage.removeItem(yk).catch(() => {});

  return dua;
}

export async function fetchDuaCategories(): Promise<DuaCategory[]> {
  // v3: bumped from v2 which cached the raw un-normalized array ({ id, name }
  // instead of the expected { category, label } shape)
  const key = 'duas_categories_v3';
  const cached = await readCache<DuaCategory[]>(key, TTL_24H);
  if (cached && Array.isArray(cached) && cached.length > 0) return cached;

  const raw = await get<unknown>('/duas/categories');
  let arr: DuaCategory[];
  if (Array.isArray(raw)) {
    // Ideal: top-level array of { category, label, count }
    arr = raw as DuaCategory[];
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // API returns { total: N, categories: { slug: { label, count }, … } }
    const cats = obj.categories;
    if (Array.isArray(cats)) {
      // API returns { id, name, description, count } per item — normalize to DuaCategory
      arr = (cats as Array<Record<string, unknown>>).map(item => ({
        category: (item.id ?? item.category ?? '') as string,
        label:    (item.name ?? item.label ?? item.id ?? '') as string,
        count:    (item.count ?? 0) as number,
      }));
    } else if (cats && typeof cats === 'object') {
      // Keyed object fallback: { slug: { label, count }, … }
      arr = Object.entries(cats as Record<string, { label?: string; count?: number }>).map(
        ([category, v]) => ({ category, label: v?.label ?? category, count: v?.count ?? 0 }),
      );
    } else {
      arr = [];
    }
  } else {
    arr = [];
  }

  if (arr.length > 0) await writeCache(key, arr);
  return arr;
}

export async function fetchDuasByCategory(category: string): Promise<Dua[]> {
  const key = `duas_category_v2:${category}`;
  const cached = await readCache<Dua[]>(key, TTL_24H);
  if (cached && Array.isArray(cached) && cached.length > 0) return cached;

  const raw = await get<unknown>(`/duas/category/${encodeURIComponent(category)}`);
  let arr: Dua[];
  if (Array.isArray(raw)) {
    arr = raw as Dua[];
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Try common wrapper keys: duas, data, items, results
    const inner = obj.duas ?? obj.data ?? obj.items ?? obj.results;
    arr = Array.isArray(inner) ? (inner as Dua[]) : [];
  } else {
    arr = [];
  }

  if (arr.length > 0) await writeCache(key, arr);
  return arr;
}

function normalizeSurah(s: Record<string, unknown>): Surah {
  const place = s.revelation_place as string | undefined;
  return {
    number:                 (s.number ?? 0) as number,
    name:                   (s.name_arabic ?? s.name ?? '') as string,
    englishName:            (s.name_english ?? s.englishName ?? '') as string,
    englishNameTranslation: (s.name_translation ?? s.englishNameTranslation ?? '') as string,
    numberOfAyahs:          (s.verses_count ?? s.numberOfAyahs ?? 0) as number,
    revelationType:         (place === 'makkah' ? 'Meccan' : place === 'madinah' ? 'Medinan' : (s.revelationType ?? 'Meccan')) as 'Meccan' | 'Medinan',
  };
}

function normalizeAyah(a: Record<string, unknown>, index: number): Ayah {
  // translations is an object keyed by translator name:
  // { sahih_international: "...", pickthall: "...", yusuf_ali: "...", … }
  let enText = '';
  if (a.translations && typeof a.translations === 'object' && !Array.isArray(a.translations)) {
    const t = a.translations as Record<string, unknown>;
    enText = (t.sahih_international ?? t.pickthall ?? t.yusuf_ali ?? '') as string;
  } else if (Array.isArray(a.translations)) {
    enText = ((a.translations[0] as Record<string, unknown>)?.text ?? '') as string;
  } else if (typeof a.translation === 'string') {
    enText = a.translation;
  }
  return {
    number:          (a.ayah ?? a.verse_number ?? a.number ?? index + 1) as number,
    text:            (a.arabic ?? a.text_uthmani ?? a.text_arabic ?? a.text ?? '') as string,
    transliteration: (a.transliteration ?? '') as string,
    translations:    { en: { text: enText } },
  };
}

export async function fetchSurahs(): Promise<Surah[]> {
  // v3: normalizes API field names (name_arabic → name, verses_count → numberOfAyahs, etc.)
  const key = 'quran_surahs_v3';
  const cached = await readCache<Surah[]>(key, TTL_7D);
  if (cached && Array.isArray(cached) && cached.length > 0) return cached;

  const raw = await get<unknown>('/quran/surahs');

  // API returns { total: N, surahs: [{ number, name_arabic, name_english, … }] }
  let rawList: Array<Record<string, unknown>>;
  if (Array.isArray(raw)) {
    rawList = raw as Array<Record<string, unknown>>;
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const inner = obj.surahs ?? obj.chapters ?? obj.data;
    rawList = Array.isArray(inner) ? (inner as Array<Record<string, unknown>>) : [];
  } else {
    rawList = [];
  }

  const arr = rawList.map(normalizeSurah);
  if (arr.length > 0) await writeCache(key, arr);
  return arr;
}

export async function fetchSurah(number: number): Promise<SurahDetail> {
  // v3: correct ayah field names (ayah, arabic, translations keyed by translator)
  const key = `quran_surah_v3:${number}`;
  const cached = await readCache<SurahDetail>(key, TTL_7D);
  if (cached && Array.isArray(cached.ayahs)) return cached;

  const raw = await get<unknown>(`/quran/surah/${number}`);
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  // Metadata lives under raw.surah, or raw itself if flat
  const meta = (obj.surah && typeof obj.surah === 'object'
    ? obj.surah
    : obj) as Record<string, unknown>;

  // Verses may be at raw.verses, raw.ayahs, meta.verses, or meta.ayahs
  const versesRaw =
    (obj.verses ?? obj.ayahs ??
     (meta as Record<string, unknown>).verses ??
     (meta as Record<string, unknown>).ayahs ?? []) as Array<Record<string, unknown>>;

  const ayahs = versesRaw.map(normalizeAyah);
  const detail: SurahDetail = { ...normalizeSurah(meta), ayahs };

  if (ayahs.length > 0) await writeCache(key, detail);
  return detail;
}
