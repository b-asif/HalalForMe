import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator, Image, ImageBackground, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';

import { Brand, getCuisineTheme } from '../../lib/theme';
import { loadPrayerSettings } from '../../lib/prayer/settingsStore';
import { resolveGpsCoordinates, loadCachedGpsCoordinates, ResolvedCoordinates } from '../../lib/prayer/coordinates';
import { searchOsmMosquesByName, Mosque } from '../../lib/mosques/overpass';
import { fetchNearestMosquesIncludingManual, searchMosquesByName } from '../../lib/mosques/manual';
import { haversineMi } from '../../lib/geo';
import { supabase } from '../../lib/supabase';
import { isHFSAACertified } from '../../lib/certifiers';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;

// ─── category registry ────────────────────────────────────────────────────────

type CategoryItem = {
  key: string;
  label: string;
  route: string;
  bg: string;
  iconName: string;
  iconLib: 'ion' | 'mc';
  iconColor: string;
};

const TILE_BG = '#E8E4DC';

const CATEGORIES: CategoryItem[] = [
  { key: 'mosques', label: 'Mosques',    route: '/mosques',
    bg: TILE_BG, iconName: 'mosque',           iconLib: 'mc',  iconColor: DEEP_GREEN },
  { key: 'food',    label: 'Halal Food', route: '/explore/food?category=restaurant',
    bg: TILE_BG, iconName: 'restaurant',       iconLib: 'ion', iconColor: DEEP_GREEN },
  { key: 'cafe',    label: 'Cafes',      route: '/explore/food?category=cafe',
    bg: TILE_BG, iconName: 'cafe',             iconLib: 'ion', iconColor: DEEP_GREEN },
  { key: 'market',  label: 'Grocery & Butcher', route: '/explore/food?category=market',
    bg: TILE_BG, iconName: 'basket-outline',   iconLib: 'ion', iconColor: DEEP_GREEN },
  { key: 'events',  label: 'Events',     route: '/events',
    bg: TILE_BG, iconName: 'calendar-outline', iconLib: 'ion', iconColor: DEEP_GREEN },
];

// ─── hours helpers (for open/closed badge on food cards) ─────────────────────

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isOpenNow(hours: Record<string, any> | null): boolean {
  if (!hours) return false;
  const now  = new Date();
  const cur  = now.getHours() * 60 + now.getMinutes();
  const tidx = now.getDay();
  const yidx = (tidx + 6) % 7;

  const checkRanges = (dayVal: any, overnight: boolean) => {
    if (!dayVal) return false;
    const ranges = Array.isArray(dayVal) ? dayVal : [dayVal];
    return ranges.some((r: any) => {
      if (r.open === '00:00' && r.close === '00:00') return true;
      const [oh, om] = r.open.split(':').map(Number);
      const [ch, cm] = r.close.split(':').map(Number);
      const openMins  = oh * 60 + om;
      const closeMins = ch * 60 + cm;
      if (closeMins > openMins) return !overnight && cur >= openMins && cur < closeMins;
      return overnight ? cur < closeMins : cur >= openMins;
    });
  };

  return checkRanges(hours[WEEK_DAYS[tidx]], false) || checkRanges(hours[WEEK_DAYS[yidx]], true);
}

// ─── types ────────────────────────────────────────────────────────────────────

interface NearbyFood {
  kind: 'food';
  id: string;
  name: string;
  cuisine: string;
  distanceMi: number;
  image_url: string | null;
  isOpen: boolean;
  primary_certifier: string;
  zabihah_status?: 'full' | 'partial' | null;
}

type NearbyItem = (Mosque & { kind: 'mosque' }) | NearbyFood;

// ─── data helpers ─────────────────────────────────────────────────────────────

async function fetchNearbyFood(lat: number, lng: number, limit: number): Promise<NearbyFood[]> {
  // 25-mile bounding box at the DB level so we never pull the entire global
  // table. cos(50°) ≈ 0.64 → 1° lng ≈ 44 mi; divide by 50 for safe headroom.
  const RADIUS_MI = 25;
  const latDelta  = RADIUS_MI / 69;
  const lngDelta  = RADIUS_MI / 50;

  const { data } = await supabase
    .from('restaurants')
    .select('id, name, cuisine_type, image_url, opening_hours, lat, lng, primary_certifier, zabihah_status')
    .eq('category', 'restaurant')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .gte('lat', lat - latDelta)
    .lte('lat', lat + latDelta)
    .gte('lng', lng - lngDelta)
    .lte('lng', lng + lngDelta)
    .limit(60);

  if (!data) return [];

  return (data as any[])
    .filter(r => r.lat != null && r.lng != null)
    .map(r => ({
      kind:           'food' as const,
      id:             r.id,
      name:           r.name,
      cuisine:        r.cuisine_type ?? '',
      distanceMi:     haversineMi(lat, lng, r.lat, r.lng),
      image_url:      r.image_url,
      isOpen:         isOpenNow(r.opening_hours),
      primary_certifier: r.primary_certifier ?? 'unknown',
      zabihah_status: r.zabihah_status ?? null,
    }))
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, limit);
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function ExploreHub() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [searchQuery,    setSearchQuery]    = useState('');
  const [nearbyItems,    setNearbyItems]    = useState<NearbyItem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [coords,         setCoords]         = useState<ResolvedCoordinates | null>(null);
  const [searchMode,     setSearchMode]     = useState(false);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchResults,  setSearchResults]  = useState<NearbyItem[]>([]);
  const [dropdownItems,  setDropdownItems]  = useState<NearbyItem[]>([]);
  const [dropdownLoading,setDropdownLoading]= useState(false);
  const [showDropdown,   setShowDropdown]   = useState(false);
  const hasLoadedOnce = useRef(false);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setSearchQuery('');

    async function load() {
      if (!hasLoadedOnce.current) setLoading(true);

      // Resolve location — same logic as mosques.tsx / qibla screen
      const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
      const settings   = await loadPrayerSettings(regionCode);
      let loc: ResolvedCoordinates | null = null;

      if (settings.locationMode === 'manual' && settings.manualCity) {
        loc = settings.manualCity;
      } else {
        // Use cached GPS (written by the Home screen) so the Explore hub
        // loads instantly on every tab switch. Fall back to a live fix only
        // on first launch when no cache exists yet.
        loc = (await loadCachedGpsCoordinates()) ?? await resolveGpsCoordinates();
      }

      if (cancelled) return;
      setCoords(loc);

      if (!loc) { setLoading(false); return; }

      const { latitude, longitude } = loc;

      const [mosqueRes, foodRes] = await Promise.allSettled([
        fetchNearestMosquesIncludingManual(latitude, longitude, 15_000, 5),
        fetchNearbyFood(latitude, longitude, 5),
      ]);

      if (cancelled) return;

      const mosques = mosqueRes.status === 'fulfilled' ? mosqueRes.value : [];
      const foods   = foodRes.status   === 'fulfilled' ? foodRes.value   : [];

      const items: NearbyItem[] = [
        ...mosques.map(m => ({ ...m, kind: 'mosque' as const })),
        ...foods,
      ].sort((a, b) => a.distanceMi - b.distanceMi);

      setNearbyItems(items);
      hasLoadedOnce.current = true;
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []));

  // Live dropdown — debounced 300ms after each keystroke
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setShowDropdown(false); setDropdownItems([]); return; }
    if (searchMode) return; // full results already showing

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setDropdownLoading(true);
      setShowDropdown(true);
      try {
        const { data } = await supabase
          .from('restaurants')
          .select('id, name, cuisine_type, lat, lng')
          .ilike('name', `%${q}%`)
          .limit(6);

        const foods: NearbyItem[] = (data ?? []).map((r: any) => ({
          kind:              'food' as const,
          id:                r.id,
          name:              r.name,
          cuisine:           r.cuisine_type ?? '',
          distanceMi:        coords && r.lat != null && r.lng != null
                               ? haversineMi(coords.latitude, coords.longitude, r.lat, r.lng)
                               : Infinity,
          image_url:         null,
          isOpen:            false,
          primary_certifier: 'unknown',
          zabihah_status:    null,
        }));

        setDropdownItems(foods);
      } catch {
        setDropdownItems([]);
      } finally {
        setDropdownLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, searchMode]);

  const clearSearch = () => {
    setSearchQuery('');
    setSearchMode(false);
    setSearchResults([]);
    setShowDropdown(false);
    setDropdownItems([]);
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setSearchMode(true);
    setSearchLoading(true);
    setSearchResults([]);
    setShowDropdown(false);

    try {
      const lat = coords?.latitude  ?? 0;
      const lng = coords?.longitude ?? 0;

      const [mosqueRes, foodRes] = await Promise.allSettled([
        // Mosques: local DB first, then OSM with 2.5 s cap
        searchMosquesByName(q, lat, lng).then(async local => {
          if (local.length > 0) return local;
          return Promise.race([
            searchOsmMosquesByName(q, lat, lng).catch(() => [] as Mosque[]),
            new Promise<Mosque[]>(resolve => setTimeout(() => resolve([]), 2500)),
          ]);
        }),
        // Restaurants: name search against Supabase
        supabase
          .from('restaurants')
          .select('id, name, cuisine_type, image_url, opening_hours, lat, lng, primary_certifier, zabihah_status')
          .ilike('name', `%${q}%`)
          .limit(25)
          .then(({ data }) =>
            (data ?? []).map((r: any) => ({
              kind:              'food' as const,
              id:                r.id,
              name:              r.name,
              cuisine:           r.cuisine_type ?? '',
              distanceMi:        coords && r.lat != null && r.lng != null
                                   ? haversineMi(lat, lng, r.lat, r.lng)
                                   : Infinity,
              image_url:         r.image_url,
              isOpen:            isOpenNow(r.opening_hours),
              primary_certifier: r.primary_certifier ?? 'unknown',
              zabihah_status:    r.zabihah_status ?? null,
            }))
          ),
      ]);

      const mosques = mosqueRes.status === 'fulfilled'
        ? mosqueRes.value.map(m => ({ ...m, kind: 'mosque' as const }))
        : [];
      const foods = foodRes.status === 'fulfilled' ? foodRes.value : [];

      const combined: NearbyItem[] = [...mosques, ...foods].sort((a, b) => {
        if (a.distanceMi === Infinity && b.distanceMi === Infinity) return 0;
        if (a.distanceMi === Infinity) return 1;
        if (b.distanceMi === Infinity) return -1;
        return a.distanceMi - b.distanceMi;
      });

      setSearchResults(combined);
    } finally {
      setSearchLoading(false);
    }
  };

  // Shared search bar used in both browse and search modes
  const searchBar = (
    <View style={s.searchBar}>
      {searchLoading || dropdownLoading ? (
        <ActivityIndicator size="small" color={GREEN} style={{ marginRight: 8 }} />
      ) : (
        <Ionicons name="search-outline" size={18} color={TEXT_MUTED} style={{ marginRight: 8 }} />
      )}
      <TextInput
        style={s.searchInput}
        placeholder="Mosques, restaurants, events..."
        placeholderTextColor={TEXT_MUTED}
        value={searchQuery}
        onChangeText={v => { setSearchQuery(v); if (!v) { setSearchMode(false); setSearchResults([]); } }}
        returnKeyType="search"
        onSubmitEditing={handleSearch}
        autoCapitalize="none"
        editable={!searchLoading}
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity onPress={clearSearch} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={TEXT_MUTED} />
        </TouchableOpacity>
      )}
    </View>
  );

  if (searchMode) {
    return (
      <View style={s.root}>
        {/* Slim search header replaces hero entirely */}
        <View style={[s.searchHeader, { paddingTop: insets.top + 10 }]}>
          <View style={s.searchHeaderInner}>
            {searchBar}
            <TouchableOpacity onPress={clearSearch} style={s.cancelBtn}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={s.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.searchResultsScroll}
          keyboardShouldPersistTaps="handled"
        >
          {searchLoading ? (
            <View style={s.nearbyLoading}>
              <ActivityIndicator size="large" color={GREEN} />
            </View>
          ) : searchResults.length === 0 ? (
            <View style={s.nearbyEmpty}>
              <Ionicons name="search-outline" size={32} color={TEXT_MUTED} style={{ marginBottom: 8 }} />
              <Text style={s.nearbyEmptyText}>No results for "{searchQuery}"</Text>
              <Text style={[s.nearbyEmptyText, { fontSize: 12, marginTop: 4 }]}>
                Try a different spelling or browse categories below
              </Text>
            </View>
          ) : (
            <View style={s.section}>
              <Text style={s.resultsCount}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
              </Text>
              <View style={s.resultsCard}>
                {searchResults.map((item, idx) => (
                  <SearchResultRow
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    showBorder={idx < searchResults.length - 1}
                    onPress={() => {
                      if (item.kind === 'food') router.push(`/restaurant/${item.id}` as any);
                      else router.push(`/mosque/${item.id.replace('/', ':')}` as any);
                    }}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea} edges={[]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

          {/* Hero banner — extends behind status bar */}
          <ImageBackground
            source={require('../../assets/background.png')}
            style={[s.hero, { height: 220 + insets.top }]}
            imageStyle={s.heroBg}
          >
            <View style={s.heroOverlay} />
            <View style={[s.heroContent, { paddingTop: insets.top + 12 }]}>
              <Text style={s.heroTitle}>Explore</Text>
              <Text style={s.heroSub}>Discover places, events, and more near you</Text>
            </View>
          </ImageBackground>

          {/* Search bar — overlaps hero bottom edge */}
          <View style={s.searchWrap}>
            {searchBar}
          </View>

          {/* Live dropdown */}
          {showDropdown && !searchMode && (
            <View style={s.dropdown}>
              {dropdownItems.length === 0 && !dropdownLoading ? (
                <View style={s.dropdownEmpty}>
                  <Text style={s.dropdownEmptyText}>No results for "{searchQuery}"</Text>
                </View>
              ) : (
                dropdownItems.map((item, idx) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[s.dropdownRow, idx < dropdownItems.length - 1 && s.dropdownRowBorder]}
                    onPress={() => {
                      setShowDropdown(false);
                      router.push(`/restaurant/${item.id}` as any);
                    }}
                    activeOpacity={0.72}
                  >
                    <Ionicons name="restaurant-outline" size={15} color={TEXT_MUTED} />
                    <Text style={s.dropdownName} numberOfLines={1}>{item.name}</Text>
                    {item.distanceMi !== Infinity && (
                      <Text style={s.dropdownDist}>{item.distanceMi.toFixed(1)} mi</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity
                style={s.dropdownSeeAll}
                onPress={handleSearch}
              >
                <Ionicons name="search" size={14} color={GREEN} />
                <Text style={s.dropdownSeeAllText}>See all results for "{searchQuery}"</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Browse Categories */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Browse Categories</Text>
              <TouchableOpacity onPress={() => router.push('/nearby' as any)} hitSlop={8} style={s.seeAllRow}>
                <Text style={s.seeAll}>View All</Text>
                <Ionicons name="chevron-forward" size={14} color={GREEN} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.categoryScroll}
          >
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={s.categoryCell}
                onPress={() => router.push(cat.route as any)}
                activeOpacity={0.8}
              >
                <View style={[s.categoryIconBox, { backgroundColor: cat.bg }]}>
                  {cat.iconLib === 'mc'
                    ? <MaterialCommunityIcons name={cat.iconName as any} size={30} color={cat.iconColor} />
                    : <Ionicons name={cat.iconName as any} size={30} color={cat.iconColor} />
                  }
                </View>
                <Text style={s.categoryLabel}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Nearby Places */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Nearby Places</Text>
              <TouchableOpacity
                onPress={() => router.push('/nearby')}
                hitSlop={8}
                style={s.seeAllRow}
              >
                <Text style={s.seeAll}>See All</Text>
                <Ionicons name="chevron-forward" size={14} color={GREEN} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={s.nearbyLoading}>
                <ActivityIndicator size="small" color={GREEN} />
              </View>
            ) : nearbyItems.length === 0 ? (
              <View style={s.nearbyEmpty}>
                <Text style={s.nearbyEmptyText}>
                  {coords
                    ? 'No nearby places found'
                    : 'Open the Home tab to set your location'}
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.nearbyScroll}
              >
                {nearbyItems.map(item => (
                  <NearbyCard
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    onPress={() => {
                      if (item.kind === 'food') router.push(`/restaurant/${item.id}` as any);
                      else router.push(`/mosque/${item.id.replace('/', ':')}` as any);
                    }}
                  />
                ))}
              </ScrollView>
            )}
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── nearby card ──────────────────────────────────────────────────────────────

function NearbyCard({ item, onPress }: { item: NearbyItem; onPress: () => void }) {
  if (item.kind === 'mosque') {
    return (
      <TouchableOpacity style={nc.card} onPress={onPress} activeOpacity={0.85}>
        <View style={[nc.imageArea, { backgroundColor: DEEP_GREEN }]}>
          <MaterialCommunityIcons name="mosque" size={44} color="rgba(255,255,255,0.5)" />
          <View style={nc.distanceBadge}>
            <Text style={nc.distanceText}>{item.distanceMi.toFixed(1)} mi</Text>
          </View>
          <View style={[nc.typeBadge, { backgroundColor: GREEN }]}>
            <MaterialCommunityIcons name="mosque" size={13} color="#fff" />
          </View>
        </View>
        <View style={nc.info}>
          <Text style={nc.name} numberOfLines={2}>{item.name}</Text>
          <Text style={nc.type}>Mosque</Text>
          <Text style={nc.detail}>{item.distanceMi.toFixed(1)} mi away</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const { emoji, color } = getCuisineTheme(item.cuisine);

  return (
    <TouchableOpacity style={nc.card} onPress={onPress} activeOpacity={0.85}>
      <View style={nc.imageArea}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={nc.image} />
        ) : (
          <View style={[nc.imagePlaceholder, { backgroundColor: color }]}>
            <Text style={nc.emoji}>{emoji}</Text>
          </View>
        )}
        <View style={nc.distanceBadge}>
          <Text style={nc.distanceText}>{item.distanceMi.toFixed(1)} mi</Text>
        </View>
        <View style={[nc.typeBadge, { backgroundColor: '#e65c00' }]}>
          <Ionicons name="restaurant" size={13} color="#fff" />
        </View>
      </View>
      <View style={nc.info}>
        <Text style={nc.name} numberOfLines={2}>{item.name}</Text>
        <Text style={nc.type}>{item.cuisine || 'Halal Restaurant'}</Text>
        {(() => {
          const isZabihah = item.zabihah_status === 'full' || isHFSAACertified(item.primary_certifier);
          const isPartial = item.zabihah_status === 'partial' && !isHFSAACertified(item.primary_certifier);
          if (!isZabihah && !isPartial) return null;
          return (
            <View style={[nc.zabihahBadge, { backgroundColor: isZabihah ? Brand.zabihahBg : Brand.zabihahPartialBg }]}>
              <Ionicons name="checkmark-circle" size={10} color={isZabihah ? Brand.zabihah : Brand.zabihahPartial} />
              <Text style={[nc.zabihahText, { color: isZabihah ? Brand.zabihah : Brand.zabihahPartial }]}>
                {isZabihah ? 'Zabihah' : 'Partial Zabihah'}
              </Text>
            </View>
          );
        })()}
        <View style={nc.openRow}>
          <View style={[nc.openDot, { backgroundColor: item.isOpen ? '#16a34a' : '#ef4444' }]} />
          <Text style={nc.detail}>{item.isOpen ? 'Open now' : 'Closed'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── search result row ────────────────────────────────────────────────────────

function SearchResultRow({ item, showBorder, onPress }: { item: NearbyItem; showBorder: boolean; onPress: () => void }) {
  const isMosque = item.kind === 'mosque';
  const { color } = !isMosque ? getCuisineTheme((item as NearbyFood).cuisine) : { color: DEEP_GREEN };
  const distLabel = item.distanceMi !== Infinity ? `${item.distanceMi.toFixed(1)} mi` : null;

  return (
    <TouchableOpacity
      style={[sr.row, showBorder && sr.rowBorder]}
      onPress={onPress}
      activeOpacity={0.72}
    >
      <View style={[sr.iconBox, { backgroundColor: isMosque ? DEEP_GREEN : color }]}>
        {isMosque
          ? <MaterialCommunityIcons name="mosque" size={20} color="rgba(255,255,255,0.85)" />
          : (!isMosque && (item as NearbyFood).image_url)
            ? <Image source={{ uri: (item as NearbyFood).image_url! }} style={sr.iconImage} />
            : <Ionicons name="restaurant" size={20} color="rgba(255,255,255,0.85)" />
        }
      </View>
      <View style={sr.info}>
        <Text style={sr.name} numberOfLines={1}>{item.name}</Text>
        <Text style={sr.sub} numberOfLines={1}>
          {isMosque ? 'Mosque' : ((item as NearbyFood).cuisine || 'Halal Restaurant')}
          {distLabel ? ` · ${distLabel}` : ''}
          {!isMosque ? ` · ${(item as NearbyFood).isOpen ? 'Open' : 'Closed'}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
    </TouchableOpacity>
  );
}

const sr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0ece4' },
  iconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  },
  iconImage: { width: 44, height: 44, resizeMode: 'cover' },
  info:      { flex: 1 },
  name:      { fontSize: 15, fontWeight: '600', color: TEXT_DARK },
  sub:       { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
});

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: CREAM },
  safeArea:{ flex: 1 },
  flex:    { flex: 1 },
  scroll:  { paddingBottom: 40 },

  // search mode header (replaces hero)
  searchHeader: {
    backgroundColor: CREAM,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8e4dc',
  },
  searchHeaderInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchResultsScroll: { paddingBottom: 40 },

  // hero
  hero:        {},  // height set dynamically (220 + insets.top)
  heroBg:      { resizeMode: 'cover' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(31,61,43,0.48)' },
  heroContent: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 32 },
  heroTitle:   { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroSub:     { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 4, lineHeight: 18 },

  // search bar (overlaps hero bottom)
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: -22, marginBottom: 4,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 13,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  searchInput: { flex: 1, fontSize: 14, color: TEXT_DARK },

  // sections
  section:       { marginTop: 28, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: TEXT_DARK },
  seeAllRow:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAll:        { fontSize: 13, color: GREEN, fontWeight: '600' },

  // category horizontal scroll
  categoryScroll:  { paddingHorizontal: 16, paddingBottom: 4, gap: 10 },
  categoryCell:    { alignItems: 'center', width: 64 },
  categoryIconBox: {
    width: 64, height: 64, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    overflow: 'hidden',
  },
  categoryLabel: { fontSize: 11, fontWeight: '600', color: TEXT_DARK, textAlign: 'center', lineHeight: 14 },

  // nearby section
  nearbyScroll:     { paddingRight: 16, paddingBottom: 4 },
  nearbyLoading:    { height: 200, alignItems: 'center', justifyContent: 'center' },
  nearbyEmpty:      { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },
  nearbyEmptyText:  { fontSize: 13, color: TEXT_MUTED, textAlign: 'center' },

  // cancel button
  cancelBtn:  { paddingLeft: 4 },
  cancelText: { fontSize: 15, color: GREEN, fontWeight: '600' },

  // live dropdown
  dropdown: {
    marginHorizontal: 16, marginTop: -2, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 8,
    overflow: 'hidden',
  },
  dropdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  dropdownRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f0eb' },
  dropdownName:  { flex: 1, fontSize: 14, fontWeight: '500', color: TEXT_DARK },
  dropdownDist:  { fontSize: 12, color: TEXT_MUTED },
  dropdownEmpty: { paddingHorizontal: 14, paddingVertical: 14 },
  dropdownEmptyText: { fontSize: 13, color: TEXT_MUTED },
  dropdownSeeAll: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#f3f0eb',
    backgroundColor: '#fafaf8',
  },
  dropdownSeeAllText: { fontSize: 13, fontWeight: '600', color: GREEN },

  // search results
  resultsCount: { fontSize: 13, color: TEXT_MUTED, fontWeight: '500', marginBottom: 10 },
  resultsCard:  {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
});

const CARD_W       = 162;
const CARD_IMAGE_H = 112;

const nc = StyleSheet.create({
  card: {
    width: CARD_W, borderRadius: 18, backgroundColor: '#fff', marginRight: 12,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  imageArea: {
    width: CARD_W, height: CARD_IMAGE_H,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  image:           { width: CARD_W, height: CARD_IMAGE_H, resizeMode: 'cover' },
  imagePlaceholder:{ width: CARD_W, height: CARD_IMAGE_H, alignItems: 'center', justifyContent: 'center' },
  emoji:           { fontSize: 38 },
  distanceBadge:   {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.52)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  distanceText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  typeBadge:    {
    position: 'absolute', bottom: 8, left: 8,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  info:   { padding: 10, gap: 2 },
  name:   { fontSize: 13, fontWeight: '700', color: TEXT_DARK, lineHeight: 17 },
  type:   { fontSize: 11, color: TEXT_MUTED },
  openRow:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  openDot:{ width: 6, height: 6, borderRadius: 3 },
  detail: { fontSize: 11, color: TEXT_MUTED },
  zabihahBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 20, marginTop: 2 },
  zabihahText:  { fontSize: 10, fontWeight: '600' },
});
