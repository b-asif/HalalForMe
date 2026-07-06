import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Alert, Animated, Dimensions, FlatList, PanResponder, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { formatError } from '../../lib/errors';
import { useAuth } from '../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';
import RestaurantCard, { Restaurant } from '../../components/RestaurantCard';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN       = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const RED        = Brand.red;
const SCREEN_H    = Dimensions.get('window').height;
const DISTANCE_OPTIONS = [5, 10, 25, 50, 100]; // miles

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── certifier options shown in filter sheet ──────────────────────────────────

const THIRD_PARTY_CERTS = ['ISNA', 'IFANCA', 'HMA', 'HFA', 'HFSAA', 'HMS', 'MUI'];

const CERT_OPTIONS: { key: string; label: string }[] = [
  { key: 'ISNA',           label: 'ISNA'           },
  { key: 'IFANCA',         label: 'IFANCA'         },
  { key: 'HMA',            label: 'HMA'            },
  { key: 'HFA',            label: 'HFA'            },
  { key: 'HFSAA',          label: 'HFSAA'          },
  { key: 'HMS',            label: 'HMS'            },
  { key: 'MUI',            label: 'MUI'            },
  { key: 'self_certified', label: 'Self Certified' },
  { key: 'uncertified',    label: 'Not Certified'  },
];

// ─── types ────────────────────────────────────────────────────────────────────

interface DbRow {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  cuisine_type: string;
  primary_certifier: string;
  certifiers: string[] | null;
  is_verified: boolean;
  image_url: string | null;
  categorized_photos: Record<string, string[]> | null;
  opening_hours: Record<string, any> | null;
  avg_rating?: number | null;
  reviews?: { count: number }[];
}

// ─── hours helpers ────────────────────────────────────────────────────────────

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${p}` : `${h12}:${String(m).padStart(2, '0')} ${p}`;
}

function isOpenNow(hours: DbRow['opening_hours']): boolean {
  if (!hours) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const todayIdx     = now.getDay();
  const yesterdayIdx = (todayIdx + 6) % 7;

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

  return checkRanges(hours[WEEK_DAYS[todayIdx]], false)
      || checkRanges(hours[WEEK_DAYS[yesterdayIdx]], true);
}

function todayHoursStr(hours: DbRow['opening_hours']): string | null {
  if (!hours) return null;
  const today = WEEK_DAYS[new Date().getDay()];
  const val = hours[today];
  if (!val) return 'Closed today';
  const ranges = Array.isArray(val) ? val : [val];
  if (ranges.length === 0) return 'Closed today';
  if (ranges.length === 1 && ranges[0].open === '00:00' && ranges[0].close === '00:00') return 'Today: Open 24 Hours';
  return 'Today: ' + ranges.map((r: any) => `${fmt12(r.open)}–${fmt12(r.close)}`).join(', ');
}



// ─── toCard ───────────────────────────────────────────────────────────────────

function toCard(r: DbRow, distanceMi?: number): Restaurant {
  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine_type ?? '',
    rating: r.avg_rating ?? 0,
    reviewCount: r.reviews?.[0]?.count ?? 0,
    distance: distanceMi != null ? `${distanceMi < 10 ? distanceMi.toFixed(1) : Math.round(distanceMi)} mi` : '',
    isOpen: isOpenNow(r.opening_hours),
    primaryCertifier: r.primary_certifier ?? 'unknown',
    address: r.address,
    image_url: r.image_url,
    categorized_photos: r.categorized_photos,
    todayHours: todayHoursStr(r.opening_hours),
  };
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();

  // filter sheet animation
  const filterSlideAnim    = useRef(new Animated.Value(SCREEN_H)).current;
  const filterPanY         = useRef(new Animated.Value(0)).current;
  const filterBackdropAnim = useRef(new Animated.Value(0)).current;

  // search
  const [query, setQuery] = useState('');

  // location search
  const [locationQuery, setLocationQuery]   = useState('');
  const [locationInput, setLocationInput]   = useState('');
  const [searchLat,     setSearchLat]       = useState<number | null>(null);
  const [searchLng,     setSearchLng]       = useState<number | null>(null);
  const [geoLoading,    setGeoLoading]      = useState(false);
  const [geoError,      setGeoError]        = useState<string | null>(null);

  // quick filter toggles
  const [filterOpenNow,    setFilterOpenNow]    = useState(false);
  const [filterTopRated,   setFilterTopRated]   = useState(false);
  const [filterThirdParty, setFilterThirdParty] = useState(false);

  // distance
  const [radiusMi, setRadiusMi] = useState(25);

  // advanced filters (cuisine + certification)
  const [filterCuisines, setFilterCuisines] = useState<string[]>([]);
  const [filterCerts,    setFilterCerts]    = useState<string[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // data
  const [rows,    setRows]    = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);


  // ── location search ──────────────────────────────────────────
  const handleLocationSearch = useCallback(async () => {
    const q = locationInput.trim();
    if (!q) {
      setLocationQuery('');
      setSearchLat(null);
      setSearchLng(null);
      setGeoError(null);
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length === 0) {
        setGeoError('Location not found. Try a different city or zip code.');
        setSearchLat(null);
        setSearchLng(null);
      } else {
        setSearchLat(results[0].latitude);
        setSearchLng(results[0].longitude);
        setLocationQuery(q);
        setGeoError(null);
      }
    } catch {
      setGeoError('Could not search that location. Try again.');
    }
    setGeoLoading(false);
  }, [locationInput]);

  const clearLocation = useCallback(() => {
    setLocationInput('');
    setLocationQuery('');
    setSearchLat(null);
    setSearchLng(null);
    setGeoError(null);
  }, []);

  // ── fetch ─────────────────────────────────────────────────────
  const fetchRestaurants = useCallback(async () => {
    setLoading(true);
    setError(null);

    const baseCols = 'id, name, address, lat, lng, cuisine_type, primary_certifier, certifiers, is_verified, image_url, categorized_photos, opening_hours';

    const { data, error: err } = await supabase
      .from('restaurants')
      .select(baseCols)
      .order('name')
      .limit(200);

    if (err) {
      setError(formatError(err));
      setLoading(false);
      return;
    }

    const restaurantRows = (data as DbRow[]) ?? [];

    // Ratings are computed here from the `reviews` table directly (same
    // source the restaurant detail screen uses) rather than trusting a
    // restaurants.avg_rating column or a reviews(count) embed, since neither
    // is guaranteed to exist / be embeddable depending on the schema.
    const ids = restaurantRows.map(r => r.id);
    if (ids.length > 0) {
      const { data: reviewRows } = await supabase
        .from('reviews')
        .select('restaurant_id, rating')
        .eq('status', 'approved')
        .in('restaurant_id', ids);

      const stats = new Map<string, { sum: number; count: number }>();
      for (const rv of (reviewRows as { restaurant_id: string; rating: number }[]) ?? []) {
        const entry = stats.get(rv.restaurant_id) ?? { sum: 0, count: 0 };
        entry.sum += rv.rating;
        entry.count += 1;
        stats.set(rv.restaurant_id, entry);
      }
      for (const r of restaurantRows) {
        const entry = stats.get(r.id);
        r.avg_rating = entry ? entry.sum / entry.count : null;
        r.reviews = [{ count: entry?.count ?? 0 }];
      }
    }

    setRows(restaurantRows);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchRestaurants(); }, [fetchRestaurants]));

  // ── derived ───────────────────────────────────────────────────

  // unique cuisine types from loaded data
  const cuisineOptions = useMemo(
    () => [...new Set(rows.map(r => r.cuisine_type).filter(Boolean))].sort(),
    [rows],
  );

  // count of active advanced filters (for badge on button)
  const activeFilterCount = [filterOpenNow, filterTopRated, filterThirdParty, radiusMi !== 25].filter(Boolean).length
    + filterCuisines.length + filterCerts.length;

  const results = useMemo(() => {
    let filtered = rows;

    // location filter (city / zip)
    if (searchLat !== null && searchLng !== null) {
      filtered = filtered.filter(r =>
        r.lat != null && r.lng != null &&
        haversineMi(searchLat, searchLng, r.lat, r.lng) <= radiusMi,
      );
    }

    // text search
    const q = query.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.cuisine_type ?? '').toLowerCase().includes(q),
      );
    }

    // quick toggles
    if (filterOpenNow)    filtered = filtered.filter(r => isOpenNow(r.opening_hours));
    if (filterTopRated)   filtered = filtered.filter(r => (r.avg_rating ?? 0) >= 4.0);
    if (filterThirdParty) filtered = filtered.filter(r => THIRD_PARTY_CERTS.includes(r.primary_certifier));

    // advanced
    if (filterCuisines.length > 0) {
      filtered = filtered.filter(r => filterCuisines.includes(r.cuisine_type));
    }
    if (filterCerts.length > 0) {
      filtered = filtered.filter(r => filterCerts.includes(r.primary_certifier));
    }

    if (filterTopRated) {
      filtered = [...filtered].sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0));
    } else if (searchLat !== null && searchLng !== null) {
      filtered = [...filtered].sort((a, b) => {
        const da = a.lat != null && a.lng != null ? haversineMi(searchLat, searchLng, a.lat, a.lng) : Infinity;
        const db = b.lat != null && b.lng != null ? haversineMi(searchLat, searchLng, b.lat, b.lng) : Infinity;
        return da - db;
      });
    }

    const hasLocationSearch = searchLat !== null && searchLng !== null;
    return filtered.map(r => {
      const distanceMi = hasLocationSearch && r.lat != null && r.lng != null
        ? haversineMi(searchLat!, searchLng!, r.lat, r.lng)
        : undefined;
      return toCard(r, distanceMi);
    });
  }, [rows, query, searchLat, searchLng, radiusMi, filterOpenNow, filterTopRated, filterThirdParty, filterCuisines, filterCerts]);

  const openFilterSheet = useCallback(() => {
    filterPanY.setValue(0);
    setFilterSheetOpen(true);
    Animated.parallel([
      Animated.spring(filterSlideAnim,    { toValue: 0, tension: 68, friction: 12, useNativeDriver: true }),
      Animated.timing(filterBackdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [filterSlideAnim, filterPanY, filterBackdropAnim]);

  const closeFilterSheet = useCallback(() => {
    // Fallback timeout ensures the sheet closes even if the animation callback
    // never fires (e.g. interrupted gesture on slow Android devices).
    const fallback = setTimeout(() => { setFilterSheetOpen(false); filterPanY.setValue(0); }, 350);
    Animated.parallel([
      Animated.timing(filterSlideAnim,    { toValue: SCREEN_H, duration: 260, useNativeDriver: true }),
      Animated.timing(filterBackdropAnim, { toValue: 0,        duration: 200, useNativeDriver: true }),
    ]).start(() => { clearTimeout(fallback); setFilterSheetOpen(false); filterPanY.setValue(0); });
  }, [filterSlideAnim, filterPanY, filterBackdropAnim]);

  const filterPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) filterPanY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          closeFilterSheet();
        } else {
          Animated.spring(filterPanY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const handleCardPress = useCallback((card: Restaurant) => {
    router.push(`/restaurant/${card.id}`);
  }, [router]);

  const clearAllFilters = () => {
    setFilterOpenNow(false);
    setFilterTopRated(false);
    setFilterThirdParty(false);
    setRadiusMi(25);
    setFilterCuisines([]);
    setFilterCerts([]);
  };

  const toggleCuisine = (c: string) =>
    setFilterCuisines(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const toggleCert = (c: string) =>
    setFilterCerts(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  // ─────────────────────────────────────────────────────────────
  return (
    <View style={st.root}>
      <SafeAreaView style={st.safeArea} edges={['top']}>

        <View style={st.header}>
          <Text style={st.title}>Explore</Text>
        </View>

        {/* Search bar */}
        <View style={st.searchRow}>
          <Ionicons name="search-outline" size={18} color={TEXT_MUTED} style={st.searchIcon} />
          <TextInput
            style={st.input}
            placeholder="Search restaurants, cuisines..."
            placeholderTextColor={TEXT_MUTED}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={st.clearBtn}>
              <Ionicons name="close-circle" size={18} color={TEXT_MUTED} />
            </TouchableOpacity>
          )}
        </View>

        {/* Location search */}
        <View style={st.locationRow}>
          <Ionicons name="location-outline" size={18} color={TEXT_MUTED} style={st.searchIcon} />
          <TextInput
            style={st.input}
            placeholder="City or zip code..."
            placeholderTextColor={TEXT_MUTED}
            value={locationInput}
            onChangeText={setLocationInput}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={handleLocationSearch}
          />
          {geoLoading ? (
            <ActivityIndicator size="small" color={GREEN} style={{ marginRight: 4 }} />
          ) : locationQuery ? (
            <TouchableOpacity onPress={clearLocation} style={st.clearBtn}>
              <Ionicons name="close-circle" size={18} color={GREEN} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleLocationSearch} style={st.clearBtn}>
              <Ionicons name="arrow-forward-circle" size={22} color={GREEN} />
            </TouchableOpacity>
          )}
        </View>
        {geoError && (
          <Text style={st.geoError}>{geoError}</Text>
        )}
        {locationQuery ? (
          <Text style={st.locationActive}>
            <Ionicons name="location" size={12} color={GREEN} /> Showing within {radiusMi} mi of "{locationQuery}"
          </Text>
        ) : null}

        {/* Verified Only prominent toggle */}
        <TouchableOpacity
          style={[st.verifiedToggle, filterThirdParty && st.verifiedToggleActive]}
          onPress={() => setFilterThirdParty(v => !v)}
          activeOpacity={0.8}
        >
          <View style={[st.verifiedToggleIcon, filterThirdParty && st.verifiedToggleIconActive]}>
            <Ionicons name="shield-checkmark" size={18} color={filterThirdParty ? '#fff' : GREEN} />
          </View>
          <View style={st.verifiedToggleBody}>
            <Text style={[st.verifiedToggleTitle, filterThirdParty && st.verifiedToggleTitleActive]}>
              Verified Only
            </Text>
            <Text style={[st.verifiedToggleSub, filterThirdParty && st.verifiedToggleSubActive]}>
              {filterThirdParty
                ? `${results.length} certified restaurant${results.length !== 1 ? 's' : ''}`
                : 'Show certified restaurants only'}
            </Text>
          </View>
          <View style={[st.verifiedTogglePill, filterThirdParty && st.verifiedTogglePillActive]}>
            <Ionicons
              name={filterThirdParty ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={filterThirdParty ? '#fff' : TEXT_MUTED}
            />
          </View>
        </TouchableOpacity>

        {/* Filter chips */}
        <View style={st.filtersWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.filtersContent}
        >
          <QuickChip
            label="Open Now"
            icon="time-outline"
            active={filterOpenNow}
            onPress={() => setFilterOpenNow(v => !v)}
          />
          <QuickChip
            label="4+ Stars"
            icon="star-outline"
            active={filterTopRated}
            onPress={() => setFilterTopRated(v => !v)}
          />
          <TouchableOpacity
            style={[st.filterChip, activeFilterCount > 0 && st.filterChipActive]}
            onPress={openFilterSheet}
            activeOpacity={0.75}
          >
            <Ionicons
              name="options-outline"
              size={14}
              color={activeFilterCount > 0 ? '#fff' : TEXT_MUTED}
            />
            <Text style={[st.filterText, activeFilterCount > 0 && st.filterTextActive]}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        </View>

        {/* Results */}
        {loading ? (
          <View style={st.centered}>
            <ActivityIndicator size="large" color={GREEN} />
          </View>
        ) : error ? (
          <View style={st.centered}>
            <Ionicons name="alert-circle-outline" size={36} color={TEXT_MUTED} />
            <Text style={st.errorText}>{error}</Text>
            <TouchableOpacity style={st.retryBtn} onPress={fetchRestaurants}>
              <Text style={st.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : results.length === 0 ? (
          <View style={st.empty}>
            <Ionicons name="search-outline" size={48} color={TEXT_MUTED} />
            <Text style={st.emptyTitle}>No results</Text>
            <Text style={st.emptyText}>
              {activeFilterCount > 0
                ? 'Try removing some filters'
                : query
                  ? 'Try a different search'
                  : 'No restaurants found'}
            </Text>
            {activeFilterCount > 0 && (
              <TouchableOpacity style={st.clearFiltersBtn} onPress={clearAllFilters}>
                <Text style={st.clearFiltersText}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            style={st.flatList}
            data={results}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <RestaurantCard restaurant={item} onPress={handleCardPress} />
            )}
            contentContainerStyle={st.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View>
                <TouchableOpacity
                  style={st.communityBanner}
                  onPress={() => {
                  if (!user) {
                    Alert.alert(
                      'Sign in to add a restaurant',
                      'Create a free account to submit halal restaurants for the community.',
                      [
                        { text: 'Not now', style: 'cancel' },
                        { text: 'Sign In', onPress: () => { setGuestLoginIntent(true); router.push('/(auth)/login'); } },
                      ],
                    );
                    return;
                  }
                  router.push('/submit-restaurant');
                }}
                  activeOpacity={0.85}
                >
                  <View style={st.communityBannerLeft}>
                    <Text style={st.communityBannerTitle}>Know a halal spot?</Text>
                    <Text style={st.communityBannerSub}>
                      Our listings are community-driven. Help others by adding a restaurant.
                    </Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={28} color={GREEN} />
                </TouchableOpacity>
                <Text style={st.count}>
                  {results.length} result{results.length !== 1 ? 's' : ''}
                  {activeFilterCount > 0 ? ' · filtered' : ''}
                </Text>
              </View>
            }
          />
        )}

      </SafeAreaView>

      {/* Submit FAB */}
      <TouchableOpacity
        style={[st.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => {
                  if (!user) {
                    Alert.alert(
                      'Sign in to add a restaurant',
                      'Create a free account to submit halal restaurants for the community.',
                      [
                        { text: 'Not now', style: 'cancel' },
                        { text: 'Sign In', onPress: () => { setGuestLoginIntent(true); router.push('/(auth)/login'); } },
                      ],
                    );
                    return;
                  }
                  router.push('/submit-restaurant');
                }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ── Filter sheet ── */}
      {filterSheetOpen && (
        <>
          {/* Backdrop */}
          <Animated.View style={[st.backdrop, { opacity: filterBackdropAnim, zIndex: 40 }]} pointerEvents="auto">
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeFilterSheet} activeOpacity={1} />
          </Animated.View>

          {/* Sheet */}
          <Animated.View
            style={[
              fs.sheet,
              { paddingBottom: insets.bottom + 16 },
              { transform: [{ translateY: Animated.add(filterSlideAnim, filterPanY) }] },
            ]}
          >
            {/* Draggable handle area */}
            <View {...filterPanResponder.panHandlers} style={fs.handleArea}>
              <View style={fs.handle} />
            </View>

            {/* Header */}
            <View style={fs.headerRow}>
              <Text style={fs.title}>Filters</Text>
              <TouchableOpacity onPress={clearAllFilters}>
                <Text style={fs.clearAll}>Clear all</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Quick toggles */}
              <Text style={fs.sectionLabel}>Quick Filters</Text>
              <View style={fs.togglesRow}>
                <FilterToggle label="Open Now"        icon="time-outline"             active={filterOpenNow}    onPress={() => setFilterOpenNow(v => !v)} />
                <FilterToggle label="Certified"  icon="shield-checkmark-outline" active={filterThirdParty} onPress={() => setFilterThirdParty(v => !v)} />
                <FilterToggle label="4+ Stars"         icon="star-outline"             active={filterTopRated}   onPress={() => setFilterTopRated(v => !v)} />
              </View>

              {/* Distance */}
              <Text style={fs.sectionLabel}>Distance (miles)</Text>
              <View style={fs.chipGrid}>
                {DISTANCE_OPTIONS.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[fs.optionChip, radiusMi === d && fs.optionChipActive]}
                    onPress={() => setRadiusMi(d)}
                    activeOpacity={0.75}
                  >
                    <Text style={[fs.optionChipText, radiusMi === d && fs.optionChipTextActive]}>
                      {d} mi
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cuisine */}
              {cuisineOptions.length > 0 && (
                <>
                  <Text style={fs.sectionLabel}>Cuisine</Text>
                  <View style={fs.chipGrid}>
                    {cuisineOptions.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[fs.optionChip, filterCuisines.includes(c) && fs.optionChipActive]}
                        onPress={() => toggleCuisine(c)}
                        activeOpacity={0.75}
                      >
                        <Text style={[fs.optionChipText, filterCuisines.includes(c) && fs.optionChipTextActive]}>
                          {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Certification */}
              <Text style={fs.sectionLabel}>Halal Certification</Text>
              <View style={fs.chipGrid}>
                {CERT_OPTIONS.map(o => (
                  <TouchableOpacity
                    key={o.key}
                    style={[fs.optionChip, filterCerts.includes(o.key) && fs.optionChipActive]}
                    onPress={() => toggleCert(o.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[fs.optionChipText, filterCerts.includes(o.key) && fs.optionChipTextActive]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={fs.applyBtn} onPress={closeFilterSheet}>
              <Text style={fs.applyBtnText}>
                {results.length > 0
                  ? `Show ${results.length} result${results.length !== 1 ? 's' : ''}`
                  : 'Show results'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ─── small reusable components ────────────────────────────────────────────────

function QuickChip({ label, icon, active, onPress }: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[st.filterChip, active && st.filterChipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons name={icon as any} size={14} color={active ? '#fff' : TEXT_MUTED} />
      <Text style={[st.filterText, active && st.filterTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterToggle({ label, icon, active, onPress }: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[fs.toggle, active && fs.toggleActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons name={icon as any} size={16} color={active ? '#fff' : TEXT_MUTED} />
      <Text style={[fs.toggleText, active && fs.toggleTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:    { flex: 1, backgroundColor: CREAM },
  safeArea: { flex: 1 },

  header: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  title: { fontSize: 22, fontWeight: '800', color: TEXT_DARK },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    borderRadius: 14, borderWidth: 1.5, borderColor: HAIRLINE, paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: TEXT_DARK },
  clearBtn: { padding: 4 },

  locationRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 8, marginBottom: 4,
    borderRadius: 14, borderWidth: 1.5, borderColor: HAIRLINE, paddingHorizontal: 12,
  },
  geoError:      { fontSize: 12, color: RED, marginHorizontal: 20, marginBottom: 4 },
  locationActive: { fontSize: 12, color: GREEN, marginHorizontal: 20, marginBottom: 4, fontWeight: '600' },

  filtersWrapper: { paddingTop: 8, paddingBottom: 6 },
  filtersContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  flatList: { flex: 1 },

  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  filterChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  filterTextActive: { color: '#fff' },

  list: { paddingTop: 8, paddingBottom: 100 },
  count: { fontSize: 13, color: TEXT_MUTED, paddingHorizontal: 16, marginBottom: 8, fontWeight: '500' },

  communityBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, marginHorizontal: 16, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#e0ede6',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  communityBannerLeft: { flex: 1, marginRight: 12 },
  communityBannerTitle: { fontSize: 14, fontWeight: '700', color: GREEN, marginBottom: 3 },
  communityBannerSub:   { fontSize: 12, color: TEXT_MUTED, lineHeight: 17 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  errorText: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn: { backgroundColor: DEEP_GREEN, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: TEXT_MUTED },
  emptyText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center' },
  clearFiltersBtn: {
    marginTop: 8, backgroundColor: DEEP_GREEN,
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10,
  },
  clearFiltersText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  verifiedToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    backgroundColor: '#fff', borderRadius: 16,
    padding: 14, borderWidth: 1.5, borderColor: HAIRLINE,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  verifiedToggleActive: {
    backgroundColor: GREEN, borderColor: GREEN,
    shadowOpacity: 0.15,
  },
  verifiedToggleIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e6f4ec', alignItems: 'center', justifyContent: 'center',
  },
  verifiedToggleIconActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  verifiedToggleBody: { flex: 1 },
  verifiedToggleTitle: { fontSize: 14, fontWeight: '700', color: TEXT_DARK, marginBottom: 1 },
  verifiedToggleTitleActive: { color: '#fff' },
  verifiedToggleSub: { fontSize: 12, color: TEXT_MUTED, lineHeight: 16 },
  verifiedToggleSubActive: { color: 'rgba(255,255,255,0.8)' },
  verifiedTogglePill: { padding: 2 },
  verifiedTogglePillActive: {},

  fab: {
    position: 'absolute', right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: DEEP_GREEN,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 20 },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30,
    backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: 20, paddingTop: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 }, elevation: 24,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 14,
  },
  sheetClose: {
    position: 'absolute', top: 14, right: 16,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  sheetRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  sheetThumb: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  sheetInfo: { flex: 1 },
  sheetNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sheetName:    { flex: 1, fontSize: 16, fontWeight: '700', color: TEXT_DARK },
  verifiedDot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },
  sheetCuisine:  { fontSize: 13, color: TEXT_MUTED, marginBottom: 3 },
  sheetAddress:  { fontSize: 12, color: TEXT_MUTED, marginBottom: 6 },
  sheetCertRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  sheetHoursRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sheetHoursText: { fontSize: 12, color: TEXT_MUTED },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },

  viewBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  viewBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const fs = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50,
    backgroundColor: CREAM,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 0,
    maxHeight: '85%',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 }, elevation: 24,
  },
  handleArea: {
    paddingVertical: 12, alignItems: 'center',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20,
  },
  title:    { fontSize: 20, fontWeight: '800', color: TEXT_DARK },
  clearAll: { fontSize: 14, color: DEEP_GREEN, fontWeight: '600' },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: TEXT_MUTED,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 4,
  },

  togglesRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  toggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  toggleActive: { backgroundColor: GREEN, borderColor: GREEN },
  toggleText: { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  toggleTextActive: { color: '#fff' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  optionChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  optionChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  optionChipText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  optionChipTextActive: { color: '#fff' },

  applyBtn: {
    marginTop: 8, backgroundColor: DEEP_GREEN,
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
