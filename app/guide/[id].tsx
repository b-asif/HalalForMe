import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, ScrollView, Linking, Share, Modal, Pressable, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { InstagramIcon } from '../../components/InstagramIcon';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';
import RestaurantCard, { Restaurant } from '../../components/RestaurantCard';
import MosqueGuideCard, { MosqueGuideCardData } from '../../components/MosqueGuideCard';
import PrayerRoomGuideCard, { PrayerRoomGuideCardData } from '../../components/PrayerRoomGuideCard';
import { Brand } from '../../lib/theme';
import { haversineMi } from '../../lib/geo';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

// ─── Types ────────────────────────────────────────────────────────────────────

interface GuideDetail {
  id: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  cover_focus_y: number | null;
  category: string;
  tags: string[];
  is_featured: boolean;
  instagram_handle: string | null;
  campus_lat: number | null;
  campus_lng: number | null;
}

interface GuideItemRow {
  position: number;
  curator_note: string | null;
  restaurants: {
    id: string;
    name: string;
    address: string;
    lat: number | null;
    lng: number | null;
    cuisine_type: string | null;
    primary_certifier: string;
    image_url: string | null;
    categorized_photos: Record<string, string[]> | null;
    opening_hours: OpeningHours | null;
    avg_rating: number | null;
    review_count: number | null;
    category: string | null;
    zabihah_status: 'full' | 'partial' | null;
    has_prayer_room: boolean | null;
  } | null;
  mosques: MosqueGuideCardData | null;
  prayer_rooms: PrayerRoomGuideCardData | null;
}

type HoursRange   = { open: string; close: string };
type OpeningHours = Record<string, HoursRange | HoursRange[]> | null;

type FilterKey = 'all' | 'restaurant' | 'cafe' | 'grocery' | 'mosque' | 'prayer_room';

type UnifiedItem =
  | { kind: 'restaurant';  position: number; card: Restaurant & { lat: number | null; lng: number | null }; note: string | null }
  | { kind: 'mosque';      position: number; mosque: MosqueGuideCardData;      note: string | null }
  | { kind: 'prayer_room'; position: number; room: PrayerRoomGuideCardData;    note: string | null };

const FILTER_META: Record<FilterKey, { label: string; icon: string }> = {
  all:          { label: 'All',          icon: 'apps-outline'       },
  restaurant:   { label: 'Food',         icon: 'restaurant-outline' },
  cafe:         { label: 'Café',         icon: 'cafe-outline'       },
  grocery:      { label: 'Grocery',      icon: 'cart-outline'       },
  mosque:       { label: 'Mosque',       icon: 'business-outline'   },
  prayer_room:  { label: 'Prayer Room',  icon: 'leaf-outline'       },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isOpenNow(hours: OpeningHours): boolean {
  if (!hours) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const todayIdx     = now.getDay();
  const yesterdayIdx = (todayIdx + 6) % 7;

  const checkRanges = (dayVal: any, overnight: boolean): boolean => {
    if (!dayVal) return false;
    const ranges: HoursRange[] = Array.isArray(dayVal) ? dayVal : [dayVal];
    return ranges.some(r => {
      if (r.open === '00:00' && r.close === '00:00') return true;
      const [oh, om] = r.open.split(':').map(Number);
      const [ch, cm] = r.close.split(':').map(Number);
      const openMins  = oh * 60 + om;
      const closeMins = ch * 60 + cm;
      if (closeMins > openMins) return !overnight && cur >= openMins && cur < closeMins;
      return overnight ? cur < closeMins : cur >= openMins;
    });
  };

  return checkRanges(hours[WEEK_DAYS[todayIdx]], false)
      || checkRanges(hours[WEEK_DAYS[yesterdayIdx]], true);
}

function to12h(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function getTodayHours(hours: OpeningHours): string | null {
  if (!hours) return null;
  const day = WEEK_DAYS[new Date().getDay()];
  const val = hours[day];
  if (!val) return null;
  const ranges: HoursRange[] = Array.isArray(val) ? val : [val];
  if (ranges[0]?.open === '00:00' && ranges[0]?.close === '00:00') return 'Open 24 hours';
  return ranges.map(r => `${to12h(r.open)} – ${to12h(r.close)}`).join(', ');
}

function travelTimes(distMi: number) {
  const walk  = Math.round(distMi * 20);
  const bike  = Math.round(distMi * 5);
  const drive = Math.max(1, Math.round(distMi * 3));
  const fmt = (m: number, label: string) => m < 1 ? `< 1 min ${label}` : `${m} min ${label}`;
  return { walk: fmt(walk, 'walk'), bike: fmt(bike, 'bike'), drive: fmt(drive, 'drive') };
}

// Returns the fastest practical transport for a given distance
function fastestTravel(distMi: number): { detail: string; detailIcon: 'walk' | 'bike' | 'car' } {
  const walkMins  = Math.round(distMi * 20);
  const bikeMins  = Math.round(distMi * 5);
  const driveMins = Math.max(1, Math.round(distMi * 3));
  const fmt = (m: number) => m < 1 ? '< 1 min' : `${m} min`;
  if (walkMins <= 6)  return { detail: `${fmt(walkMins)} walk`,  detailIcon: 'walk' };
  if (bikeMins <= 10) return { detail: `${fmt(bikeMins)} bike`,  detailIcon: 'bike' };
  return             { detail: `${fmt(driveMins)} drive`, detailIcon: 'car'  };
}

function rowToCard(item: { restaurants: NonNullable<GuideItemRow['restaurants']> }): Restaurant & { lat: number | null; lng: number | null } {
  const r = item.restaurants;
  return {
    id:               r.id,
    name:             r.name,
    cuisine:          r.cuisine_type ?? '',
    rating:           r.avg_rating   ?? 0,
    reviewCount:      r.review_count ?? 0,
    distance:         '',
    isOpen:           isOpenNow(r.opening_hours),
    primaryCertifier: r.primary_certifier,
    address:          r.address,
    image_url:        r.image_url,
    categorized_photos: r.categorized_photos,
    todayHours:       getTodayHours(r.opening_hours),
    zabihah_status:   r.zabihah_status,
    has_prayer_room:  r.has_prayer_room,
    category:         (r.category as any) ?? 'restaurant',
    lat:              r.lat,
    lng:              r.lng,
  };
}

// Normalize DB category values ('butcher' → 'grocery') to a FilterKey
function toFilterKey(cat: string | null): FilterKey {
  if (cat === 'cafe')    return 'cafe';
  if (cat === 'grocery' || cat === 'butcher') return 'grocery';
  return 'restaurant';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GuideDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const { user } = useAuth();

  const [guide,          setGuide]          = useState<GuideDetail | null>(null);
  const [allItems,       setAllItems]       = useState<UnifiedItem[]>([]);
  const [activeFilter,   setActiveFilter]   = useState<FilterKey>('all');
  const [openNowOnly,    setOpenNowOnly]    = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [selectedRoom,   setSelectedRoom]   = useState<PrayerRoomGuideCardData | null>(null);
  const [coverContentTop, setCoverContentTop] = useState<number>(0);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [guideRes, itemsRes, savedRes] = await Promise.all([
        supabase
          .from('guides')
          .select('id, title, subtitle, cover_image_url, cover_focus_y, category, tags, is_featured, instagram_handle, campus_lat, campus_lng')
          .eq('id', id)
          .single(),
        supabase
          .from('guide_items')
          .select(`
            position, curator_note,
            restaurants (
              id, name, address, lat, lng, cuisine_type, primary_certifier,
              image_url, categorized_photos, opening_hours,
              avg_rating, review_count, category, zabihah_status, has_prayer_room
            ),
            mosques (
              id, osm_id, name, address, iqama_times, jummah_sessions, website
            ),
            prayer_rooms (
              id, building_name, room_number, wudu_available, hours, lat, lng
            )
          `)
          .eq('guide_id', id)
          .order('position'),
        user
          ? supabase
              .from('saved_guides')
              .select('guide_id')
              .eq('user_id', user.id)
              .eq('guide_id', id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (guideRes.error) throw new Error(guideRes.error.message);
      if (guideRes.data) setGuide(guideRes.data as GuideDetail);

      if (itemsRes.data) {
        const unified: UnifiedItem[] = (itemsRes.data as unknown as GuideItemRow[])
          .map(row => {
            if (row.restaurants) {
              return { kind: 'restaurant' as const, position: row.position, card: rowToCard(row as any), note: row.curator_note };
            } else if (row.mosques) {
              return { kind: 'mosque' as const, position: row.position, mosque: row.mosques, note: row.curator_note };
            } else if (row.prayer_rooms) {
              return { kind: 'prayer_room' as const, position: row.position, room: row.prayer_rooms, note: row.curator_note };
            }
            return null;
          })
          .filter((x): x is UnifiedItem => x !== null);
        unified.sort((a, b) => a.position - b.position);
        setAllItems(unified);
      }
      setSaved(!!(savedRes as any).data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load guide.');
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Filter logic ──────────────────────────────────────────────────────────

  const availableFilters = useMemo<FilterKey[]>(() => {
    const keys = new Set<FilterKey>();
    for (const item of allItems) {
      if (item.kind === 'mosque')           keys.add('mosque');
      else if (item.kind === 'prayer_room') keys.add('prayer_room');
      else keys.add(toFilterKey(item.card.category ?? null));
    }
    if (keys.size <= 1) return [];
    return (['all', 'restaurant', 'cafe', 'grocery', 'mosque', 'prayer_room'] as FilterKey[]).filter(
      k => k === 'all' || keys.has(k),
    );
  }, [allItems]);

  const hasOpenNowData = useMemo(
    () => allItems.some(i => i.kind === 'restaurant' && (i.card as any).opening_hours != null),
    [allItems],
  );

  const openNowCount = useMemo(
    () => allItems.filter(i =>
      i.kind !== 'restaurant' || isOpenNow((i.card as any).opening_hours)
    ).length,
    [allItems],
  );

  const visibleItems = useMemo(() => {
    // "All" only shows restaurant-type cards — mosque/prayer_room chips must be
    // selected explicitly since those cards look different from restaurant cards.
    let result = activeFilter === 'all'
      ? allItems.filter(item => item.kind === 'restaurant')
      : allItems.filter(item => {
          if (item.kind === 'mosque')      return activeFilter === 'mosque';
          if (item.kind === 'prayer_room') return activeFilter === 'prayer_room';
          return toFilterKey(item.card.category ?? null) === activeFilter;
        });

    if (openNowOnly) {
      result = result.filter(item =>
        item.kind !== 'restaurant' || isOpenNow((item.card as any).opening_hours)
      );
    }
    return result;
  }, [allItems, activeFilter, openNowOnly]);

  const hasPrayerRooms = useMemo(() =>
    allItems.some(i => i.kind === 'prayer_room'),
    [allItems],
  );

  // Quick Picks: up to 3 highlighted items for campus guides
  const quickPicks = useMemo(() => {
    if (!guide || guide.category !== 'universities') return [];

    type Pick = {
      label: string; name: string; detail: string; detailIcon: 'walk' | 'bike' | 'car' | 'pin';
      kind: UnifiedItem['kind']; targetId: string;
      color: string; iconBg: string; icon: string;
    };
    const picks: Pick[] = [];

    const sorted = (items: UnifiedItem[]) => {
      if (guide.campus_lat == null || guide.campus_lng == null) return items;
      return [...items].sort((a, b) => {
        const distA = a.kind === 'restaurant' && a.card.lat != null && a.card.lng != null
          ? haversineMi(guide.campus_lat!, guide.campus_lng!, a.card.lat, a.card.lng) : 999;
        const distB = b.kind === 'restaurant' && b.card.lat != null && b.card.lng != null
          ? haversineMi(guide.campus_lat!, guide.campus_lng!, b.card.lat, b.card.lng) : 999;
        return distA - distB;
      });
    };

    const restaurants = allItems.filter(i => i.kind === 'restaurant' && toFilterKey(i.card.category ?? null) === 'restaurant');
    const cafes       = allItems.filter(i => i.kind === 'restaurant' && toFilterKey(i.card.category ?? null) === 'cafe');
    const prayerRooms = allItems.filter((i): i is UnifiedItem & { kind: 'prayer_room' } => i.kind === 'prayer_room');

    const travelFmt = (item: UnifiedItem) => {
      if (item.kind !== 'restaurant') return null;
      if (guide.campus_lat == null || guide.campus_lng == null || item.card.lat == null || item.card.lng == null) return null;
      return fastestTravel(haversineMi(guide.campus_lat, guide.campus_lng, item.card.lat, item.card.lng));
    };

    const closestFood = sorted(restaurants)[0];
    if (closestFood?.kind === 'restaurant') {
      const t = travelFmt(closestFood);
      picks.push({ label: 'Closest Halal Food', name: closestFood.card.name, detail: t?.detail ?? '', detailIcon: t?.detailIcon ?? 'walk', kind: 'restaurant', targetId: closestFood.card.id, color: '#2d6a4f', iconBg: '#d8f3dc', icon: 'restaurant-outline' });
    }

    const closestCafe = sorted(cafes)[0];
    if (closestCafe?.kind === 'restaurant') {
      const t = travelFmt(closestCafe);
      picks.push({ label: 'Best Study Café', name: closestCafe.card.name, detail: t?.detail ?? '', detailIcon: t?.detailIcon ?? 'walk', kind: 'restaurant', targetId: closestCafe.card.id, color: '#92400e', iconBg: '#fef3c7', icon: 'cafe-outline' });
    }

    const room = prayerRooms[0];
    if (room) {
      const loc = room.room.room_number ? `${room.room.building_name}, Room ${room.room.room_number}` : room.room.building_name;
      picks.push({ label: 'Prayer on Campus', name: room.room.room_number ? 'Prayer Room' : room.room.building_name, detail: loc, detailIcon: 'pin', kind: 'prayer_room', targetId: room.room.id, color: '#6d28d9', iconBg: '#ede9fe', icon: 'leaf-outline' });
    }

    return picks;
  }, [guide, allItems]);

  // ── Bookmark toggle ───────────────────────────────────────────────────────

  const toggleSave = async () => {
    if (!user) {
      setGuestLoginIntent(true);
      router.push('/(auth)/login');
      return;
    }
    if (savingBookmark) return;
    setSavingBookmark(true);
    if (saved) {
      const { error } = await supabase.from('saved_guides').delete().eq('user_id', user.id).eq('guide_id', id);
      if (!error) setSaved(false);
    } else {
      const { error } = await supabase.from('saved_guides').insert({ user_id: user.id, guide_id: id });
      if (!error) setSaved(true);
    }
    setSavingBookmark(false);
  };

  const shareGuide = async () => {
    try {
      await Share.share({
        message: `Check out "${guide!.title}" on Rihdal – curated halal spots & prayer spaces.\nhttps://rihdalapp.com/guide/${id}`,
      });
    } catch {}
  };

  const handleInstagram = () => {
    if (!guide?.instagram_handle) return;
    const handle = guide.instagram_handle.replace(/^@/, '');
    Linking.canOpenURL(`instagram://user?username=${handle}`)
      .then(supported =>
        Linking.openURL(
          supported
            ? `instagram://user?username=${handle}`
            : `https://www.instagram.com/${handle}`,
        ),
      )
      .catch(() => Linking.openURL(`https://www.instagram.com/${handle}`));
  };

  const handleSuggest = () => {
    if (!user) {
      setGuestLoginIntent(true);
      router.push('/(auth)/login');
      return;
    }
    router.push(`/guide/suggest?guideId=${id}&guideTitle=${encodeURIComponent(guide!.title)}`);
  };

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.navBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
        </View>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !guide) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.navBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
        </View>
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={48} color="#d0d0d0" />
          <Text style={s.errorText}>{error ?? 'Guide not found.'}</Text>
          {error && (
            <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.flex}>
      <FlatList
        data={visibleItems}
        keyExtractor={item =>
          item.kind === 'restaurant' ? item.card.id
          : item.kind === 'mosque'   ? `mosque-${item.mosque.id}`
          : `pr-${item.room.id}`
        }
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}

        ListHeaderComponent={
          <>
            {guide.category === 'universities' ? (
              /* ── Campus hero header ── */
              <>
                <View style={s.campusHero}>
                  {/* Cover image + overlay */}
                  {guide.cover_image_url ? (
                    <>
                      <Image
                        source={{ uri: guide.cover_image_url }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        contentPosition={{ top: -(guide.cover_focus_y ?? 0.5) * 80 }}
                        transition={300}
                      />
                      <View style={s.campusHeroOverlay} />
                    </>
                  ) : null}

                  {/* Nav */}
                  <View style={s.campusNav}>
                    <TouchableOpacity
                      style={[s.campusNavBtn, guide.cover_image_url && s.campusNavBtnOnImage]}
                      onPress={() => router.back()}
                    >
                      <Ionicons name="arrow-back" size={20} color={guide.cover_image_url ? '#fff' : DEEP_GREEN} />
                    </TouchableOpacity>
                    <View style={s.campusNavRight}>
                      <TouchableOpacity
                        style={[s.campusNavBtn, guide.cover_image_url && s.campusNavBtnOnImage]}
                        onPress={shareGuide}
                      >
                        <Ionicons name="share-social-outline" size={20} color={guide.cover_image_url ? '#fff' : DEEP_GREEN} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.campusNavBtn, guide.cover_image_url && s.campusNavBtnOnImage]}
                        onPress={toggleSave}
                      >
                        <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={guide.cover_image_url ? '#fff' : DEEP_GREEN} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Hero content */}
                  <View style={s.campusHeroLeft}>
                    <Text style={[s.campusGuideLabel, guide.cover_image_url && { color: 'rgba(255,255,255,0.8)' }]}>
                      Muslim Student Guide
                    </Text>
                    <Text style={[s.campusHeroTitle, guide.cover_image_url && { color: '#fff' }]}>
                      {guide.title.replace(/^Muslim Student Guide(\s*[:\-–]\s*|\s+to\s+)/i, '').trim() || guide.title}
                    </Text>
                    {guide.subtitle ? (
                      <Text style={[s.campusHeroSubtitle, guide.cover_image_url && { color: 'rgba(255,255,255,0.75)' }]}>
                        {guide.subtitle}
                      </Text>
                    ) : null}
                  </View>

                  {/* Action buttons */}
                  <View style={s.campusActions}>
                    {guide.instagram_handle ? (
                      <TouchableOpacity style={s.campusInstaBtn} activeOpacity={0.75} onPress={handleInstagram}>
                        <InstagramIcon size={13} color="#C13584" />
                        <Text style={s.campusInstaText}>@{guide.instagram_handle.replace(/^@/, '')}</Text>
                        <Ionicons name="open-outline" size={11} color="#C13584" />
                      </TouchableOpacity>
                    ) : null}
                    {hasPrayerRooms ? (
                      <TouchableOpacity
                        style={[s.campusPrayerBtn, guide.cover_image_url && s.campusPrayerBtnOnImage]}
                        activeOpacity={0.75}
                        onPress={() => setActiveFilter('prayer_room')}
                      >
                        <MaterialCommunityIcons name="hands-pray" size={13} color={guide.cover_image_url ? '#fff' : DEEP_GREEN} />
                        <Text style={[s.campusPrayerText, guide.cover_image_url && { color: '#fff' }]}>Campus Prayer Info</Text>
                        <Ionicons name="chevron-forward" size={12} color={guide.cover_image_url ? '#fff' : DEEP_GREEN} />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[s.campusPrayerBtn, guide.cover_image_url && s.campusPrayerBtnOnImage]}
                      activeOpacity={0.75}
                      onPress={handleSuggest}
                    >
                      <Ionicons name="add-circle-outline" size={13} color={guide.cover_image_url ? '#fff' : DEEP_GREEN} />
                      <Text style={[s.campusPrayerText, guide.cover_image_url && { color: '#fff' }]}>Suggest a place</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Quick Picks */}
                {quickPicks.length > 0 && (
                  <View style={s.quickSection}>
                    <View style={s.quickHeader}>
                      <Text style={s.quickTitle}>Quick Picks</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={s.quickRow}
                    >
                      {quickPicks.map((pick, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={s.quickCard}
                          activeOpacity={0.8}
                          onPress={() => {
                            if (pick.kind === 'restaurant') {
                              router.push(`/restaurant/${pick.targetId}`);
                            } else if (pick.kind === 'prayer_room') {
                              setActiveFilter('prayer_room');
                            }
                          }}
                        >
                          <View style={[s.quickIconCircle, { backgroundColor: pick.iconBg }]}>
                            <Ionicons name={pick.icon as any} size={22} color={pick.color} />
                          </View>
                          <Text style={s.quickLabel} numberOfLines={1}>{pick.label}</Text>
                          <Text style={s.quickName} numberOfLines={2}>{pick.name}</Text>
                          {pick.detail ? (
                            <View style={s.quickDetail}>
                              {pick.detailIcon === 'walk' ? <Ionicons name="walk-outline"     size={11} color={TEXT_MUTED} />
                               : pick.detailIcon === 'bike' ? <Ionicons name="bicycle-outline"  size={11} color={TEXT_MUTED} />
                               : pick.detailIcon === 'car'  ? <Ionicons name="car-outline"      size={11} color={TEXT_MUTED} />
                               : <Ionicons name="location-outline" size={11} color={TEXT_MUTED} />}
                              <Text style={s.quickDetailText} numberOfLines={1}>{pick.detail}</Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            ) : (
              <>
                {/* ── Cover image + floating nav ── */}
                <View style={s.coverWrap}>
                  {guide.cover_image_url ? (
                    <Image
                      source={{ uri: guide.cover_image_url }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      contentPosition={{ top: coverContentTop }}
                      transition={300}
                      onLoad={(e) => {
                        const { width: natW, height: natH } = e.source;
                        const screenW = Dimensions.get('window').width;
                        const containerH = 260;
                        const scale = Math.max(screenW / natW, containerH / natH);
                        const maxOffset = Math.max(0, natH * scale - containerH);
                        setCoverContentTop(-(guide.cover_focus_y ?? 0.5) * maxOffset);
                      }}
                    />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, s.coverFallback]} />
                  )}
                  <View style={s.coverOverlay} />
                  <View style={s.coverNav}>
                    <TouchableOpacity style={s.floatBtn} onPress={() => router.back()}>
                      <Ionicons name="arrow-back" size={20} color="#fff" />
                    </TouchableOpacity>
                    <View style={s.coverNavRight}>
                      <TouchableOpacity style={s.floatBtn} onPress={shareGuide}>
                        <Ionicons name="share-social-outline" size={20} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.floatBtn} onPress={toggleSave}>
                        <Ionicons
                          name={saved ? 'bookmark' : 'bookmark-outline'}
                          size={20}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* ── Guide meta ── */}
                <View style={s.meta}>
                  <Text style={s.title}>{guide.title}</Text>
                  {guide.subtitle ? (
                    <Text style={s.subtitle}>{guide.subtitle}</Text>
                  ) : null}
                  {guide.tags?.length > 0 && (
                    <View style={s.tags}>
                      {guide.tags.map(tag => (
                        <View key={tag} style={s.tag}>
                          <Text style={s.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {guide.instagram_handle ? (
                    <TouchableOpacity
                      style={s.instaRow}
                      activeOpacity={0.75}
                      onPress={handleInstagram}
                    >
                      <View style={s.instaIcon}>
                        <InstagramIcon size={16} color="#C13584" />
                      </View>
                      <Text style={s.instaHandle}>
                        @{guide.instagram_handle.replace(/^@/, '')}
                      </Text>
                      <Ionicons name="open-outline" size={13} color={TEXT_MUTED} />
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity style={s.suggestLink} onPress={handleSuggest} activeOpacity={0.75}>
                    <Ionicons name="add-circle-outline" size={14} color={GREEN} />
                    <Text style={s.suggestLinkText}>Suggest a place for this guide</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── Open Now toggle ── */}
            {hasOpenNowData && (
              <TouchableOpacity
                style={[s.openNowChip, openNowOnly && s.openNowChipActive]}
                onPress={() => setOpenNowOnly(v => !v)}
                activeOpacity={0.75}
              >
                <Ionicons name="time-outline" size={13} color={openNowOnly ? '#fff' : GREEN} />
                <Text style={[s.openNowText, openNowOnly && s.openNowTextActive]}>Open Now</Text>
                <View style={[s.filterCount, openNowOnly && s.filterCountActive]}>
                  <Text style={[s.filterCountText, openNowOnly && s.filterCountTextActive]}>
                    {openNowCount}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* ── Filter bar (only when guide has multiple categories) ── */}
            {availableFilters.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.filterRow}
                style={s.filterScroll}
              >
                {availableFilters.map(key => {
                  const meta     = FILTER_META[key];
                  const selected = activeFilter === key;
                  const count    = key === 'all'
                    ? allItems.length
                    : allItems.filter(item => {
                        if (item.kind === 'mosque')      return key === 'mosque';
                        if (item.kind === 'prayer_room') return key === 'prayer_room';
                        return toFilterKey(item.card.category ?? null) === key;
                      }).length;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[s.filterChip, selected && s.filterChipActive]}
                      onPress={() => setActiveFilter(key)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={meta.icon as any}
                        size={14}
                        color={selected ? '#fff' : TEXT_MUTED}
                      />
                      <Text style={[s.filterChipText, selected && s.filterChipTextActive]}>
                        {meta.label}
                      </Text>
                      <View style={[s.filterCount, selected && s.filterCountActive]}>
                        <Text style={[s.filterCountText, selected && s.filterCountTextActive]}>
                          {count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* ── Place count ── */}
            {visibleItems.length > 0 && (
              <Text style={s.placeCount}>
                {visibleItems.length} {visibleItems.length === 1 ? 'place' : 'places'}
              </Text>
            )}
          </>
        }

        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="location-outline" size={48} color="#d0d0d0" />
            <Text style={s.emptyText}>
              {allItems.length === 0
                ? 'No places in this guide yet.'
                : openNowOnly
                ? 'No places open right now.'
                : `No ${FILTER_META[activeFilter].label.toLowerCase()} spots in this guide.`}
            </Text>
          </View>
        }

        renderItem={({ item }: { item: UnifiedItem }) => {
          const note = item.note;
          const noteEl = note ? (
            <View style={s.noteRow}>
              <Ionicons name="information-circle-outline" size={14} color={GREEN} />
              <Text style={s.noteText}>{note}</Text>
            </View>
          ) : null;

          if (item.kind === 'mosque') {
            return (
              <View>
                {noteEl}
                <MosqueGuideCard
                  mosque={item.mosque}
                  onPress={() =>
                    router.push(`/mosque/${item.mosque.osm_id.replace('/', ':')}` as any)
                  }
                />
              </View>
            );
          }

          if (item.kind === 'prayer_room') {
            return (
              <View>
                {noteEl}
                <PrayerRoomGuideCard room={item.room} onPress={() => setSelectedRoom(item.room)} />
              </View>
            );
          }

          // Restaurant
          const showTravel =
            guide.category === 'universities' &&
            guide.campus_lat != null && guide.campus_lng != null &&
            item.card.lat != null && item.card.lng != null;
          const travel = showTravel
            ? travelTimes(haversineMi(guide.campus_lat!, guide.campus_lng!, item.card.lat!, item.card.lng!))
            : null;
          return (
            <View>
              {noteEl}
              <RestaurantCard
                restaurant={item.card}
                onPress={card => router.push(`/restaurant/${card.id}`)}
                travel={travel}
              />
            </View>
          );
        }}
      />

      {/* ── Prayer room detail modal ── */}
      <Modal
        visible={!!selectedRoom}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedRoom(null)}
      >
        <Pressable style={s.modalBackdrop} onPress={() => setSelectedRoom(null)}>
          <Pressable style={s.modalSheet} onPress={e => e.stopPropagation()}>
            {selectedRoom && (
              <>
                {/* Handle bar */}
                <View style={s.modalHandle} />

                {/* Header */}
                <View style={s.modalHeader}>
                  <View style={s.modalIconWrap}>
                    <MaterialCommunityIcons name="hands-pray" size={22} color={GREEN} />
                  </View>
                  <View style={s.modalTitleWrap}>
                    <Text style={s.modalTitle}>{selectedRoom.building_name}</Text>
                    {selectedRoom.room_number ? (
                      <Text style={s.modalSubtitle}>Room {selectedRoom.room_number}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRoom(null)} hitSlop={12}>
                    <Ionicons name="close" size={22} color={TEXT_MUTED} />
                  </TouchableOpacity>
                </View>

                {/* Info rows */}
                <View style={s.modalBody}>
                  <View style={s.modalRow}>
                    <MaterialCommunityIcons
                      name="water-outline"
                      size={18}
                      color={selectedRoom.wudu_available ? GREEN : TEXT_MUTED}
                    />
                    <View>
                      <Text style={s.modalRowLabel}>Wudu Facilities</Text>
                      <Text style={[s.modalRowValue, { color: selectedRoom.wudu_available ? GREEN : TEXT_MUTED }]}>
                        {selectedRoom.wudu_available ? 'Available' : 'Not available'}
                      </Text>
                    </View>
                  </View>

                  {selectedRoom.hours ? (() => {
                    let sections: { label: string; time: string }[] | null = null;
                    try {
                      const parsed = JSON.parse(selectedRoom.hours);
                      if (Array.isArray(parsed)) sections = parsed;
                    } catch {}
                    return (
                      <View style={s.modalRow}>
                        <Ionicons name="time-outline" size={18} color={TEXT_MUTED} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.modalRowLabel}>Hours</Text>
                          {sections ? sections.map((sec, i) => (
                            <View key={i} style={{ flexDirection: 'row', gap: 6, marginTop: i === 0 ? 0 : 4 }}>
                              {sec.label ? <Text style={[s.modalRowValue, { fontWeight: '600', minWidth: 70 }]}>{sec.label}</Text> : null}
                              <Text style={s.modalRowValue}>{sec.time}</Text>
                            </View>
                          )) : (
                            <Text style={s.modalRowValue}>{selectedRoom.hours}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })() : null}

                  {selectedRoom.lat != null && selectedRoom.lng != null ? (
                    <TouchableOpacity
                      style={s.modalMapsBtn}
                      activeOpacity={0.8}
                      onPress={() => Linking.openURL(`https://maps.apple.com/?q=${selectedRoom.lat},${selectedRoom.lng}`)}
                    >
                      <Ionicons name="navigate-outline" size={16} color="#fff" />
                      <Text style={s.modalMapsBtnText}>Get Directions</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  topBar: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: CREAM,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  errorText: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn:  { backgroundColor: DEEP_GREEN, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Cover
  coverWrap: { height: 260, overflow: 'hidden' },
  coverFallback: { backgroundColor: DEEP_GREEN },
  coverOverlay:  { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,30,18,0.4)' },
  coverNav: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16,
  },
  coverNavRight: { flexDirection: 'row', gap: 8 },
  floatBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Meta
  meta: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4, gap: 8 },
  title:    { fontSize: 24, fontWeight: '800', color: DEEP_GREEN, lineHeight: 30 },
  subtitle: { fontSize: 15, color: TEXT_MUTED, lineHeight: 22 },
  tags:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: '#eef5f0', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tagText: { fontSize: 12, fontWeight: '600', color: GREEN },

  instaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#fff0f6', borderRadius: 20,
    paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#f0c0d8',
  },
  instaIcon: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  instaHandle: { fontSize: 13, fontWeight: '700', color: '#C13584' },

  suggestLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingVertical: 4,
  },
  suggestLinkText: { fontSize: 13, fontWeight: '600', color: GREEN },

  // ── Open Now toggle
  openNowChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 12, marginBottom: 2,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#e6f9f2', borderWidth: 1.5, borderColor: GREEN,
  },
  openNowChipActive:  { backgroundColor: GREEN, borderColor: GREEN },
  openNowText:        { fontSize: 13, fontWeight: '600', color: GREEN },
  openNowTextActive:  { color: '#fff' },

  // ── Filter bar
  filterScroll:  { flexGrow: 0, marginTop: 8 },
  filterRow:     { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: HAIRLINE,
  },
  filterChipActive:     { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  filterChipText:       { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  filterChipTextActive: { color: '#fff' },
  filterCount: {
    backgroundColor: CREAM, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center',
  },
  filterCountActive:     { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterCountText:       { fontSize: 11, fontWeight: '700', color: TEXT_MUTED },
  filterCountTextActive: { color: '#fff' },

  // ── Place count label
  placeCount: {
    fontSize: 11, fontWeight: '700', color: TEXT_MUTED,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },

  // ── Curator note
  noteRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginHorizontal: 16, marginBottom: 4, marginTop: 6,
    backgroundColor: '#f0f9f3', borderRadius: 8, padding: 10,
  },
  noteText: { flex: 1, fontSize: 12, color: GREEN, lineHeight: 17 },

  listContent: { paddingBottom: 40 },

  // ── Campus hero header
  campusHero: {
    backgroundColor: DEEP_GREEN,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
    overflow: 'hidden',
    minHeight: 220,
    justifyContent: 'space-between',
  },
  campusHeroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  campusNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
    zIndex: 2,
  },
  campusNavRight: { flexDirection: 'row', gap: 8 },
  campusNavBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  campusNavBtnOnImage: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    shadowOpacity: 0,
  },
  campusHeroLeft: {
    paddingHorizontal: 20, paddingBottom: 8,
  },
  campusGuideLabel: {
    fontSize: 13, fontWeight: '600', color: DEEP_GREEN,
    marginBottom: 2, letterSpacing: 0.3,
  },
  campusHeroTitle: {
    fontSize: 34, fontWeight: '800', color: DEEP_GREEN,
    lineHeight: 38, marginBottom: 6,
  },
  campusHeroSubtitle: {
    fontSize: 14, color: TEXT_MUTED, lineHeight: 20,
  },
  campusActions: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16,
    paddingTop: 10, paddingBottom: 16, flexWrap: 'wrap',
  },
  campusInstaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fff0f6', borderRadius: 20,
    borderWidth: 1, borderColor: '#f0c0d8',
    paddingVertical: 7, paddingHorizontal: 12,
  },
  campusInstaText: { fontSize: 13, fontWeight: '700', color: '#C13584' },
  campusPrayerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fff', borderRadius: 20,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  campusPrayerBtnOnImage: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  campusPrayerText: { fontSize: 13, fontWeight: '600', color: DEEP_GREEN },
  // ── Quick Picks
  quickSection: { paddingTop: 16, paddingBottom: 4 },
  quickHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 10,
  },
  quickTitle: { fontSize: 17, fontWeight: '800', color: TEXT_DARK },
  quickRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  quickCard: {
    width: 140, backgroundColor: '#fff',
    borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    gap: 5,
  },
  quickIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  quickLabel: { fontSize: 11, color: TEXT_MUTED, fontWeight: '500' },
  quickName: { fontSize: 14, fontWeight: '700', color: TEXT_DARK, lineHeight: 18 },
  quickDetail: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  quickDetailText: { fontSize: 11, color: TEXT_MUTED, flex: 1 },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, color: TEXT_MUTED, fontWeight: '500', textAlign: 'center' },

  // ── Prayer room modal
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  modalIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitleWrap: { flex: 1 },
  modalTitle:    { fontSize: 17, fontWeight: '700', color: TEXT_DARK },
  modalSubtitle: { fontSize: 13, color: TEXT_MUTED, marginTop: 2 },

  modalBody: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  modalRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modalRowLabel: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500', marginBottom: 2 },
  modalRowValue: { fontSize: 15, fontWeight: '600', color: TEXT_DARK },

  modalMapsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 14, marginTop: 8,
  },
  modalMapsBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
