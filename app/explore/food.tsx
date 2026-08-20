import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert, Animated, Dimensions, FlatList, PanResponder, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Localization from 'expo-localization';
import { supabase } from '../../lib/supabase';
import { formatError } from '../../lib/errors';
import { useAuth } from '../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';
import RestaurantCard, { Restaurant } from '../../components/RestaurantCard';
import RestaurantMapView from '../../components/RestaurantMapView';
import { Brand } from '../../lib/theme';
import { THIRD_PARTY_CERTS, isHFSAACertified } from '../../lib/certifiers';
import { loadPrayerSettings } from '../../lib/prayer/settingsStore';

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

type ListingCategory = 'restaurant' | 'grocery' | 'butcher' | 'cafe';

// Grocery and Butcher are browsed together (one Explore hub tile) since the
// line between the two is blurry in practice, but each row keeps its own
// real category underneath for per-card icons and future filtering.
type ViewKey = 'restaurant' | 'market' | 'cafe';
const VIEW_CATEGORIES: Record<ViewKey, ListingCategory[]> = {
  restaurant: ['restaurant'],
  market:     ['grocery', 'butcher'],
  cafe:       ['cafe'],
};

const CATEGORY_META: Record<ViewKey, {
  title: string; searchPlaceholder: string; cuisineLabel: string; showCommunitySubmission: boolean;
}> = {
  restaurant: { title: 'Halal Food',        searchPlaceholder: 'Search restaurants, cuisines...',    cuisineLabel: 'Cuisine',   showCommunitySubmission: true  },
  market:     { title: 'Grocery & Butcher', searchPlaceholder: 'Search grocery stores, butchers...', cuisineLabel: 'Specialty', showCommunitySubmission: false },
  cafe:       { title: 'Cafes & Desserts',  searchPlaceholder: 'Search cafes, coffee shops...',      cuisineLabel: 'Type',      showCommunitySubmission: false },
};

interface DbRow {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  cuisine_type: string;
  category?: ListingCategory;
  primary_certifier: string;
  certifiers: string[] | null;
  is_verified: boolean;
  image_url: string | null;
  categorized_photos: Record<string, string[]> | null;
  opening_hours: Record<string, any> | null;
  avg_rating?: number | null;
  reviews?: { count: number }[];
  zabihah_status?: 'full' | 'partial' | null;
  has_prayer_room?: boolean | null;
}

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
    zabihah_status: r.zabihah_status ?? null,
    has_prayer_room: r.has_prayer_room ?? false,
    category: r.category ?? 'restaurant',
  };
}

export default function FoodScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();
  const { q, lat: paramLat, lng: paramLng, locationLabel: paramLocationLabel, category: paramCategory } =
    useLocalSearchParams<{ q?: string; lat?: string; lng?: string; locationLabel?: string; category?: string }>();
  // 'grocery'/'butcher' are accepted too (not just 'market') so any old
  // single-category link still resolves into the merged market view.
  const viewKey: ViewKey =
    paramCategory === 'grocery' || paramCategory === 'butcher' || paramCategory === 'market' ? 'market'
    : paramCategory === 'cafe' ? 'cafe'
    : 'restaurant';
  const meta = CATEGORY_META[viewKey];

  const filterSlideAnim    = useRef(new Animated.Value(SCREEN_H)).current;
  const filterPanY         = useRef(new Animated.Value(0)).current;
  const filterBackdropAnim = useRef(new Animated.Value(0)).current;

  const [query, setQuery] = useState(typeof q === 'string' ? q : '');

  const [locationQuery, setLocationQuery]   = useState('');
  const [locationInput, setLocationInput]   = useState('');
  const [searchLat,     setSearchLat]       = useState<number | null>(null);
  const [searchLng,     setSearchLng]       = useState<number | null>(null);
  const [geoLoading,    setGeoLoading]      = useState(false);
  const [geoError,      setGeoError]        = useState<string | null>(null);

  const [filterOpenNow,    setFilterOpenNow]    = useState(false);
  const [filterThirdParty, setFilterThirdParty] = useState(false);
  const [filterZabihah,    setFilterZabihah]    = useState<'any' | 'full' | false>(false);
  const [filterPrayerRoom, setFilterPrayerRoom] = useState(false);

  const [radiusMi, setRadiusMi] = useState(25);

  const [filterCuisines, setFilterCuisines] = useState<string[]>([]);
  const [filterCerts,    setFilterCerts]    = useState<string[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [rows,    setRows]    = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Pre-populate location on mount: prefer coords passed as params (e.g. from
  // the home screen quick-access tap), then fall back to whatever the user
  // already set in prayer settings, so navigating directly to this screen
  // never shows the full global restaurant list.
  useEffect(() => {
    const lat = paramLat ? parseFloat(paramLat) : NaN;
    const lng = paramLng ? parseFloat(paramLng) : NaN;
    if (!isNaN(lat) && !isNaN(lng)) {
      const label = paramLocationLabel ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setSearchLat(lat);
      setSearchLng(lng);
      setLocationInput(label);
      setLocationQuery(label);
      return;
    }
    // No coords in params — load from prayer settings (covers manual city and
    // remembered GPS so the user doesn't have to re-enter location here).
    (async () => {
      try {
        const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
        const settings = await loadPrayerSettings(regionCode);
        let lat: number | null = null;
        let lng: number | null = null;
        let label = '';
        if (settings.locationMode === 'manual' && settings.manualCity) {
          lat   = settings.manualCity.latitude;
          lng   = settings.manualCity.longitude;
          label = settings.manualCity.label;
        } else {
          // GPS mode — try to get a fresh fix; resolveGpsCoordinates may
          // trigger a permission dialog so we call expo-location directly
          // and only use the result if permission is already granted.
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lat   = pos.coords.latitude;
            lng   = pos.coords.longitude;
            label = 'Current location';
          }
        }
        if (lat !== null && lng !== null) {
          setSearchLat(lat);
          setSearchLng(lng);
          setLocationInput(label);
          setLocationQuery(label);
        }
      } catch {
        // Location unavailable — leave fields empty; user can enter manually.
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  const handleLocationSearch = useCallback(async () => {
    const lq = locationInput.trim();
    if (!lq) {
      setLocationQuery('');
      setSearchLat(null);
      setSearchLng(null);
      setGeoError(null);
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    try {
      const results = await Location.geocodeAsync(lq);
      if (results.length === 0) {
        setGeoError('Location not found. Try a different city or zip code.');
        setSearchLat(null);
        setSearchLng(null);
      } else {
        setSearchLat(results[0].latitude);
        setSearchLng(results[0].longitude);
        setLocationQuery(lq);
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

  const fetchRestaurants = useCallback(async () => {
    // Don't query without a location — the entire dataset would be fetched with
    // no relevance to the user. The empty state already prompts for a location.
    if (searchLat === null || searchLng === null) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const baseCols = 'id, name, address, lat, lng, cuisine_type, category, primary_certifier, certifiers, is_verified, image_url, categorized_photos, opening_hours, zabihah_status, has_prayer_room';

    // Bounding box at the DB level so we never pull the entire global table.
    // The box is 20% wider than radiusMi to give the precise client-side
    // haversine filter clean edges (no entries that are just inside the box
    // corner but still > radiusMi away are ever shown to the user).
    // At 50°N cos(50°) ≈ 0.64, so 1° lng ≈ 44 mi — dividing by 44 is safe
    // for all latitudes up to ~50°N; use 50 for a bit more headroom.
    const latDelta = (radiusMi * 1.2) / 69;
    const lngDelta = (radiusMi * 1.2) / 50;

    const { data, error: err } = await supabase
      .from('restaurants')
      .select(baseCols)
      .in('category', VIEW_CATEGORIES[viewKey])
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', searchLat - latDelta)
      .lte('lat', searchLat + latDelta)
      .gte('lng', searchLng - lngDelta)
      .lte('lng', searchLng + lngDelta)
      .order('name')
      .limit(500);

    if (err) {
      setError(formatError(err));
      setLoading(false);
      return;
    }

    setRows((data as DbRow[]) ?? []);
    setLoading(false);
  }, [viewKey, searchLat, searchLng, radiusMi]);

  useFocusEffect(useCallback(() => { fetchRestaurants(); }, [fetchRestaurants]));

  const cuisineOptions = useMemo(
    () => [...new Set(rows.map(r => r.cuisine_type).filter(Boolean))].sort(),
    [rows],
  );

  const activeFilterCount = [filterOpenNow, filterThirdParty, filterZabihah !== false, filterPrayerRoom, radiusMi !== 25].filter(Boolean).length
    + filterCuisines.length + filterCerts.length;

  // filteredRows: DbRow[] — shared by both list and map views
  const filteredRows = useMemo(() => {
    let filtered = rows;

    if (searchLat !== null && searchLng !== null) {
      filtered = filtered.filter(r =>
        r.lat != null && r.lng != null &&
        haversineMi(searchLat, searchLng, r.lat, r.lng) <= radiusMi,
      );
    }

    const sq = query.trim().toLowerCase();
    if (sq) {
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(sq) ||
        (r.cuisine_type ?? '').toLowerCase().includes(sq),
      );
    }

    if (filterOpenNow)    filtered = filtered.filter(r => isOpenNow(r.opening_hours));
    if (filterThirdParty) filtered = filtered.filter(r => THIRD_PARTY_CERTS.includes(r.primary_certifier));
    if (filterZabihah === 'any')  filtered = filtered.filter(r => r.zabihah_status != null || isHFSAACertified(r.primary_certifier));
    if (filterZabihah === 'full') filtered = filtered.filter(r => r.zabihah_status === 'full'  || isHFSAACertified(r.primary_certifier));
    if (filterPrayerRoom) filtered = filtered.filter(r => r.has_prayer_room === true);

    if (filterCuisines.length > 0) {
      filtered = filtered.filter(r => filterCuisines.includes(r.cuisine_type));
    }
    if (filterCerts.length > 0) {
      filtered = filtered.filter(r => filterCerts.includes(r.primary_certifier));
    }

    if (searchLat !== null && searchLng !== null) {
      filtered = [...filtered].sort((a, b) => {
        const da = a.lat != null && a.lng != null ? haversineMi(searchLat, searchLng, a.lat, a.lng) : Infinity;
        const db = b.lat != null && b.lng != null ? haversineMi(searchLat, searchLng, b.lat, b.lng) : Infinity;
        return da - db;
      });
    }

    return filtered;
  }, [rows, query, searchLat, searchLng, radiusMi, filterOpenNow, filterThirdParty, filterZabihah, filterPrayerRoom, filterCuisines, filterCerts]);

  // results: Restaurant[] — used by the list view
  const results = useMemo(() => {
    const hasLocationSearch = searchLat !== null && searchLng !== null;
    return filteredRows.map(r => {
      const distanceMi = hasLocationSearch && r.lat != null && r.lng != null
        ? haversineMi(searchLat!, searchLng!, r.lat, r.lng)
        : undefined;
      return toCard(r, distanceMi);
    });
  }, [filteredRows, searchLat, searchLng]);

  const openFilterSheet = useCallback(() => {
    filterPanY.setValue(0);
    setFilterSheetOpen(true);
    Animated.parallel([
      Animated.spring(filterSlideAnim,    { toValue: 0, tension: 68, friction: 12, useNativeDriver: true }),
      Animated.timing(filterBackdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [filterSlideAnim, filterPanY, filterBackdropAnim]);

  const closeFilterSheet = useCallback(() => {
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
    setFilterThirdParty(false);
    setFilterZabihah(false);
    setRadiusMi(25);
    setFilterCuisines([]);
    setFilterCerts([]);
  };

  const toggleCuisine = (c: string) =>
    setFilterCuisines(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const toggleCert = (c: string) =>
    setFilterCerts(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const submitAction = () => {
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
  };

  return (
    <View style={st.root}>
      <SafeAreaView style={st.safeArea} edges={['top']}>

        <View style={st.header}>
          <TouchableOpacity style={st.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
          <Text style={st.title}>{meta.title}</Text>
          <View style={st.viewToggle}>
            <TouchableOpacity
              style={[st.toggleBtn, viewMode === 'list' && st.toggleBtnActive]}
              onPress={() => setViewMode('list')}
              hitSlop={4}
            >
              <Ionicons name="list" size={17} color={viewMode === 'list' ? '#fff' : TEXT_MUTED} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.toggleBtn, viewMode === 'map' && st.toggleBtnActive]}
              onPress={() => setViewMode('map')}
              hitSlop={4}
            >
              <Ionicons name="map-outline" size={17} color={viewMode === 'map' ? '#fff' : TEXT_MUTED} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={st.searchRow}>
          <Ionicons name="search-outline" size={18} color={TEXT_MUTED} style={st.searchIcon} />
          <TextInput
            style={st.input}
            placeholder={meta.searchPlaceholder}
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
                ? `${results.length} certified listing${results.length !== 1 ? 's' : ''}`
                : 'Show certified listings only'}
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
              label="Zabihah"
              icon="leaf-outline"
              active={filterZabihah !== false}
              onPress={() => setFilterZabihah(v => v ? false : 'any')}
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
        ) : viewMode === 'map' ? (
          <RestaurantMapView
            pins={filteredRows}
            focusLat={searchLat}
            focusLng={searchLng}
          />
        ) : results.length === 0 ? (
          <View style={st.empty}>
            <Ionicons name="search-outline" size={48} color={TEXT_MUTED} />
            <Text style={st.emptyTitle}>No results</Text>
            <Text style={st.emptyText}>
              {searchLat === null
                ? 'Enter a city or zip code above to find nearby places'
                : activeFilterCount > 0
                  ? 'Try removing some filters or increasing the distance'
                  : query
                    ? 'Try a different search'
                    : `No results within ${radiusMi} mi — try increasing the distance`}
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
                {meta.showCommunitySubmission && (
                  <TouchableOpacity style={st.communityBanner} onPress={submitAction} activeOpacity={0.85}>
                    <View style={st.communityBannerLeft}>
                      <Text style={st.communityBannerTitle}>Know a halal spot?</Text>
                      <Text style={st.communityBannerSub}>
                        Our listings are community-driven. Help others by adding a restaurant.
                      </Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={28} color={GREEN} />
                  </TouchableOpacity>
                )}
                <Text style={st.count}>
                  {results.length} result{results.length !== 1 ? 's' : ''}
                  {activeFilterCount > 0 ? ' · filtered' : ''}
                </Text>
              </View>
            }
          />
        )}

      </SafeAreaView>

      {/* Submit FAB — hidden in map mode so it doesn't overlap the preview card.
          Grocery/butcher are admin-curated only (no public submission). */}
      {viewMode === 'list' && meta.showCommunitySubmission && (
        <TouchableOpacity
          style={[st.fab, { bottom: insets.bottom + 16 }]}
          onPress={submitAction}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Filter sheet */}
      {filterSheetOpen && (
        <>
          <Animated.View style={[st.backdrop, { opacity: filterBackdropAnim, zIndex: 40 }]} pointerEvents="auto">
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeFilterSheet} activeOpacity={1} />
          </Animated.View>

          <Animated.View
            style={[
              fs.sheet,
              { paddingBottom: insets.bottom + 16 },
              { transform: [{ translateY: Animated.add(filterSlideAnim, filterPanY) }] },
            ]}
          >
            <View {...filterPanResponder.panHandlers} style={fs.handleArea}>
              <View style={fs.handle} />
            </View>

            <View style={fs.headerRow}>
              <Text style={fs.title}>Filters</Text>
              <TouchableOpacity onPress={clearAllFilters}>
                <Text style={fs.clearAll}>Clear all</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={fs.sectionLabel}>Quick Filters</Text>
              <View style={fs.togglesRow}>
                <FilterToggle label="Open Now"   icon="time-outline"             active={filterOpenNow}    onPress={() => setFilterOpenNow(v => !v)} />
                <FilterToggle label="Certified"  icon="shield-checkmark-outline" active={filterThirdParty} onPress={() => setFilterThirdParty(v => !v)} />
              </View>

              <Text style={fs.sectionLabel}>Zabihah Halal</Text>
              <View style={fs.togglesRow}>
                <FilterToggle label="Any Zabihah"       icon="leaf-outline" active={filterZabihah !== false}    onPress={() => setFilterZabihah(v => v ? false : 'any')} />
                <FilterToggle label="Full Zabihah Only" icon="leaf-outline" active={filterZabihah === 'full'} onPress={() => setFilterZabihah(v => v === 'full' ? 'any' : 'full')} />
              </View>

              <Text style={fs.sectionLabel}>Amenities</Text>
              <View style={fs.togglesRow}>
                <FilterToggle label="Prayer Room" image={require('../../explore/prayerroom.png')} active={filterPrayerRoom} onPress={() => setFilterPrayerRoom(v => !v)} />
              </View>

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

              {cuisineOptions.length > 0 && (
                <>
                  <Text style={fs.sectionLabel}>{meta.cuisineLabel}</Text>
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

function QuickChip({ label, icon, active, onPress }: {
  label: string; icon: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[st.filterChip, active && st.filterChipActive]} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={icon as any} size={14} color={active ? '#fff' : TEXT_MUTED} />
      <Text style={[st.filterText, active && st.filterTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterToggle({ label, icon, image, active, onPress }: {
  label: string; icon?: string; image?: any; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[fs.toggle, active && fs.toggleActive]} onPress={onPress} activeOpacity={0.75}>
      {image
        ? <Image source={image} style={{ width: 16, height: 16, tintColor: active ? '#fff' : TEXT_MUTED }} contentFit="contain" />
        : <Ionicons name={icon as any} size={16} color={active ? '#fff' : TEXT_MUTED} />
      }
      <Text style={[fs.toggleText, active && fs.toggleTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  root:    { flex: 1, backgroundColor: CREAM },
  safeArea: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  title: { fontSize: 18, fontWeight: '800', color: TEXT_DARK },

  viewToggle: {
    flexDirection: 'row', gap: 4,
    backgroundColor: HAIRLINE, borderRadius: 10, padding: 3,
  },
  toggleBtn: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleBtnActive: { backgroundColor: DEEP_GREEN },

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
  verifiedToggleActive:     { backgroundColor: GREEN, borderColor: GREEN, shadowOpacity: 0.15 },
  verifiedToggleIcon:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e6f4ec', alignItems: 'center', justifyContent: 'center' },
  verifiedToggleIconActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  verifiedToggleBody:       { flex: 1 },
  verifiedToggleTitle:      { fontSize: 14, fontWeight: '700', color: TEXT_DARK, marginBottom: 1 },
  verifiedToggleTitleActive:{ color: '#fff' },
  verifiedToggleSub:        { fontSize: 12, color: TEXT_MUTED, lineHeight: 16 },
  verifiedToggleSubActive:  { color: 'rgba(255,255,255,0.8)' },
  verifiedTogglePill:       { padding: 2 },
  verifiedTogglePillActive: {},

  fab: {
    position: 'absolute', right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: DEEP_GREEN,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },

  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 20 },
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
  handleArea: { paddingVertical: 12, alignItems: 'center' },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: HAIRLINE },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title:      { fontSize: 20, fontWeight: '800', color: TEXT_DARK },
  clearAll:   { fontSize: 14, color: DEEP_GREEN, fontWeight: '600' },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: TEXT_MUTED,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 4,
  },

  togglesRow:      { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  toggle:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE },
  toggleActive:    { backgroundColor: GREEN, borderColor: GREEN },
  toggleText:      { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  toggleTextActive:{ color: '#fff' },

  chipGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  optionChip:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE },
  optionChipActive:    { backgroundColor: GREEN, borderColor: GREEN },
  optionChipText:      { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  optionChipTextActive:{ color: '#fff' },

  applyBtn:     { marginTop: 8, backgroundColor: DEEP_GREEN, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
