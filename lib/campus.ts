/**
 * Campus Hub — query utilities
 *
 * All reads go through the Supabase anon client so RLS is enforced.
 * Public data (universities, MSA profiles, published events/announcements,
 * active prayer spaces/times/jummah/resources) is readable by anyone.
 * Draft/unpublished content is invisible to non-members at the DB level.
 */

import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface University {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  website: string | null;
  logo_url: string | null;
  msa_logo_url: string | null; // from first MSA's logo_url — used for Campus Hub card image
  is_verified: boolean;
}

export interface Msa {
  id: string;
  university_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  email: string | null;
  website: string | null;
  instagram_handle: string | null;
  is_verified: boolean;
}

export interface CampusPrayerSpace {
  id: string;
  msa_id: string;
  name: string;
  building: string | null;
  room_number: string | null;
  floor: string | null;
  capacity: number | null;
  wudu_available: boolean;
  sisters_space: boolean;
  hours_text: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
}

export interface CampusPrayerTime {
  id: string;
  msa_id: string;
  prayer: 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
  time: string;
  location: string | null;
  notes: string | null;
}

export interface CampusJummah {
  id: string;
  msa_id: string;
  khateeb: string | null;
  time: string;
  location: string | null;
  building: string | null;
  language: string;
  notes: string | null;
  position: number;
  is_active: boolean;
}

export interface CampusEvent {
  id: string;
  msa_id: string;
  created_by: string | null;
  title: string;
  body: string | null;
  event_start: string | null;
  event_end: string | null;
  location: string | null;
  category: string | null;
  image_url: string | null;
  rsvp_url: string | null;
  is_published: boolean;
  notify_followers: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampusAnnouncement {
  id: string;
  msa_id: string;
  created_by: string | null;
  title: string;
  body: string | null;
  is_published: boolean;
  notify_followers: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampusResource {
  id: string;
  msa_id: string;
  title: string;
  description: string | null;
  category: string | null;
  url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  position: number;
}

export interface CampusDiningUpdate {
  id: string;
  msa_id: string;
  created_by: string | null;
  dining_hall: string;
  date: string;       // ISO date string, e.g. "2026-08-20"
  items: string;      // free-text list of halal items
  notes: string | null;
  is_published: boolean;
  notify_followers: boolean;
  created_at: string;
  updated_at: string;
}

/** Full campus page data — university + MSA + all related content */
export interface CampusDetail {
  university: University;
  msa: Msa | null;
  prayerSpaces: CampusPrayerSpace[];
  prayerTimes: CampusPrayerTime[];
  jummah: CampusJummah[];
  events: CampusEvent[];
  announcements: CampusAnnouncement[];
  resources: CampusResource[];
  diningUpdates: CampusDiningUpdate[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Universities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full-text search across university names.
 * Returns up to `limit` results ordered alphabetically.
 */
/** Flatten the nested msas array into a single msa_logo_url field. */
function flattenMsaLogo(row: any): University {
  const msas: any[] = Array.isArray(row.msas) ? row.msas : [];
  const msa_logo_url = msas.find(m => m.logo_url)?.logo_url ?? null;
  const { msas: _, ...rest } = row;
  return { ...rest, msa_logo_url } as University;
}

export async function searchUniversities(
  query: string,
  limit = 20,
): Promise<University[]> {
  const trimmed = query.trim();
  const SELECT = 'id, name, slug, city, state, country, lat, lng, website, logo_url, is_verified, msas(logo_url)';

  if (!trimmed) {
    const { data, error } = await supabase
      .from('universities')
      .select(SELECT)
      .eq('is_verified', true)
      .order('name')
      .limit(limit);
    if (error || !data) return [];
    return (data as any[]).map(flattenMsaLogo);
  }

  const { data, error } = await supabase
    .from('universities')
    .select(SELECT)
    .ilike('name', `%${trimmed}%`)
    .order('name')
    .limit(limit);

  if (error || !data) return [];
  return (data as any[]).map(flattenMsaLogo);
}

/**
 * Fetch a single university by slug.
 * Returns null if the slug doesn't match any row.
 */
export async function fetchUniversityBySlug(slug: string): Promise<University | null> {
  const { data, error } = await supabase
    .from('universities')
    .select('id, name, slug, city, state, country, lat, lng, website, logo_url, is_verified, msas(logo_url)')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  return flattenMsaLogo(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// MSA
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch the MSA for a given university. Most universities have one. */
export async function fetchMsaByUniversityId(universityId: string): Promise<Msa | null> {
  const { data, error } = await supabase
    .from('msas')
    .select('id, university_id, name, description, logo_url, email, website, instagram_handle, is_verified')
    .eq('university_id', universityId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Msa;
}

// ─────────────────────────────────────────────────────────────────────────────
// Campus content — all scoped by msa_id
// ─────────────────────────────────────────────────────────────────────────────

/** Active prayer spaces for a campus (publicly visible). */
export async function fetchCampusPrayerSpaces(msaId: string): Promise<CampusPrayerSpace[]> {
  const { data, error } = await supabase
    .from('campus_prayer_spaces')
    .select('id, msa_id, name, building, room_number, floor, capacity, wudu_available, sisters_space, hours_text, notes, lat, lng, is_active')
    .eq('msa_id', msaId)
    .eq('is_active', true)
    .order('name');

  if (error || !data) return [];
  return data as CampusPrayerSpace[];
}

/** Prayer times for a campus in canonical prayer order. */
export async function fetchCampusPrayerTimes(msaId: string): Promise<CampusPrayerTime[]> {
  const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

  const { data, error } = await supabase
    .from('campus_prayer_times')
    .select('id, msa_id, prayer, time, location, notes')
    .eq('msa_id', msaId);

  if (error || !data) return [];

  // Sort into canonical prayer order
  return (data as CampusPrayerTime[]).sort(
    (a, b) => PRAYER_ORDER.indexOf(a.prayer) - PRAYER_ORDER.indexOf(b.prayer),
  );
}

/** Active Jummah sessions for a campus, ordered by position. */
export async function fetchCampusJummah(msaId: string): Promise<CampusJummah[]> {
  const { data, error } = await supabase
    .from('campus_jummah')
    .select('id, msa_id, khateeb, time, location, building, language, notes, position, is_active')
    .eq('msa_id', msaId)
    .eq('is_active', true)
    .order('position');

  if (error || !data) return [];
  return data as CampusJummah[];
}

/**
 * Upcoming published events for a campus.
 * Only returns events with event_start >= now, ordered soonest first.
 */
export async function fetchCampusEvents(msaId: string, limit = 20): Promise<CampusEvent[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('campus_events')
    .select('id, msa_id, created_by, title, body, event_start, event_end, location, category, image_url, rsvp_url, is_published, notify_followers, created_at, updated_at')
    .eq('msa_id', msaId)
    .eq('is_published', true)
    .gte('event_start', now)
    .order('event_start', { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data as CampusEvent[];
}

/**
 * Published announcements for a campus, newest first.
 */
export async function fetchCampusAnnouncements(msaId: string, limit = 10): Promise<CampusAnnouncement[]> {
  const { data, error } = await supabase
    .from('campus_announcements')
    .select('id, msa_id, created_by, title, body, is_published, notify_followers, created_at, updated_at')
    .eq('msa_id', msaId)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as CampusAnnouncement[];
}

/** Active resources for a campus, ordered by position. */
export async function fetchCampusResources(msaId: string): Promise<CampusResource[]> {
  const { data, error } = await supabase
    .from('campus_resources')
    .select('id, msa_id, title, description, category, url, address, lat, lng, is_active, position')
    .eq('msa_id', msaId)
    .eq('is_active', true)
    .order('position');

  if (error || !data) return [];
  return data as CampusResource[];
}

/** Fetch only today's published dining updates for an MSA. Stale (yesterday's) updates are never shown to students. */
export async function fetchCampusDiningUpdates(msaId: string): Promise<CampusDiningUpdate[]> {
  const todayISO = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('campus_dining_updates')
    .select('id, msa_id, created_by, dining_hall, date, items, notes, is_published, notify_followers, created_at, updated_at')
    .eq('msa_id', msaId)
    .eq('is_published', true)
    .eq('date', todayISO)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as CampusDiningUpdate[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Full campus page — single fetch aggregating all sections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches everything needed to render the public campus page for a given slug.
 * Returns null if the slug doesn't match any university.
 * All content queries run in parallel after the university + MSA are resolved.
 */
export async function fetchCampusDetail(slug: string): Promise<CampusDetail | null> {
  const university = await fetchUniversityBySlug(slug);
  if (!university) return null;

  const msa = await fetchMsaByUniversityId(university.id);

  if (!msa) {
    // University exists but no MSA claimed yet — return with empty sections
    return {
      university,
      msa: null,
      prayerSpaces: [],
      prayerTimes: [],
      jummah: [],
      events: [],
      announcements: [],
      resources: [],
      diningUpdates: [],
    };
  }

  const [prayerSpaces, prayerTimes, jummah, events, announcements, resources, diningUpdates] =
    await Promise.all([
      fetchCampusPrayerSpaces(msa.id),
      fetchCampusPrayerTimes(msa.id),
      fetchCampusJummah(msa.id),
      fetchCampusEvents(msa.id),
      fetchCampusAnnouncements(msa.id),
      fetchCampusResources(msa.id),
      fetchCampusDiningUpdates(msa.id),
    ]);

  return { university, msa, prayerSpaces, prayerTimes, jummah, events, announcements, resources, diningUpdates };
}

// ─────────────────────────────────────────────────────────────────────────────
// Campus following (authenticated users only)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if the current user follows this university. */
export async function getCampusFollowStatus(universityId: string): Promise<boolean> {
  const { data } = await supabase
    .from('campus_follows')
    .select('id')
    .eq('university_id', universityId)
    .maybeSingle();

  return !!data;
}

const NOTIF_CATEGORIES = ['events', 'announcements', 'jummah', 'prayer', 'dining'] as const;
export type NotifCategory = typeof NOTIF_CATEGORIES[number];

export interface CampusNotifPrefs {
  events: boolean;
  announcements: boolean;
  jummah: boolean;
  prayer: boolean;
  dining: boolean;
}

/** Follow a university and seed default notification preferences (all enabled). */
export async function followCampus(universityId: string): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in' };

  const { error } = await supabase
    .from('campus_follows')
    .insert({ user_id: user.id, university_id: universityId });

  if (error && error.code !== '23505') {
    return { error: error.message };
  }

  // Seed all notification categories as enabled (ignore conflicts — already set)
  await supabase.from('campus_notification_preferences').upsert(
    NOTIF_CATEGORIES.map(category => ({
      user_id: user.id,
      university_id: universityId,
      category,
      enabled: true,
    })),
    { onConflict: 'user_id,university_id,category', ignoreDuplicates: true },
  );

  return { error: null };
}

/** Unfollow a university (notification prefs are left in place for if they re-follow). */
export async function unfollowCampus(universityId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('campus_follows')
    .delete()
    .eq('university_id', universityId);

  if (error) return { error: error.message };
  return { error: null };
}

/** Fetch notification preferences for a followed university. */
export async function getCampusNotifPrefs(universityId: string): Promise<CampusNotifPrefs> {
  const defaults: CampusNotifPrefs = { events: true, announcements: true, jummah: true, prayer: true, dining: true };

  const { data } = await supabase
    .from('campus_notification_preferences')
    .select('category, enabled')
    .eq('university_id', universityId);

  if (!data) return defaults;

  const prefs = { ...defaults };
  for (const row of data) {
    if (row.category in prefs) {
      (prefs as any)[row.category] = row.enabled;
    }
  }
  return prefs;
}

/** Toggle a single notification category for the current user. */
export async function setCampusNotifPref(
  universityId: string,
  category: NotifCategory,
  enabled: boolean,
): Promise<{ error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in' };

  const { error } = await supabase
    .from('campus_notification_preferences')
    .upsert(
      { user_id: user.id, university_id: universityId, category, enabled },
      { onConflict: 'user_id,university_id,category' },
    );

  return { error: error?.message ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// MSA Admin — write operations (RLS enforces membership server-side)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the calling user's role and status for a given MSA, or null if not a member. */
export async function getUserMsaRole(
  msaId: string,
): Promise<{ role: 'admin' | 'editor'; status: string } | null> {
  const { data, error } = await supabase.rpc('get_user_msa_role', { p_msa_id: msaId });
  if (error || !data || data.length === 0) return null;
  return data[0] as { role: 'admin' | 'editor'; status: string };
}
