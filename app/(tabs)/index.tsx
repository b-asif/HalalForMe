import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Alert, ActivityIndicator, FlatList, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { formatError } from '../../lib/errors';
import { useAuth } from '../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';
import RestaurantCard, { Restaurant } from '../../components/RestaurantCard';

// ─── constants ────────────────────────────────────────────────────────────────

const GREEN             = '#245737';
const THIRD_PARTY_CERTS = ['ISNA', 'IFANCA', 'HMA', 'HFA', 'HFSAA', 'HMS', 'MUI'];
const DISTANCE_OPTIONS  = [5, 10, 25, 50, 100]; // miles

// ─── types ────────────────────────────────────────────────────────────────────

interface DbRestaurant {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  cuisine_type: string;
  primary_certifier: string;
  certifiers: string[] | null;
  is_verified: boolean;
  image_url: string | null;
  categorized_photos: Record<string, string[]> | null;
  opening_hours: Record<string, { open: string; close: string } | { open: string; close: string }[]> | null;
  avg_rating?: number | null;
  reviews?: { count: number }[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDistance(km: number): string {
  const mi = km * 0.621371;
  if (mi < 0.1) return `${Math.round(km * 1000)} m`;
  return `${mi.toFixed(1)} mi`;
}

function toCard(r: DbRestaurant, userLat: number | null, userLng: number | null): Restaurant {
  const distance =
    userLat != null && userLng != null && r.lat != null && r.lng != null
      ? fmtDistance(haversineKm(userLat, userLng, r.lat, r.lng))
      : '-- mi';

  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine_type ?? '',
    rating: r.avg_rating ?? 0,
    reviewCount: r.reviews?.[0]?.count ?? 0,
    distance,
    isOpen: isOpenNow(r.opening_hours),
    primaryCertifier: r.primary_certifier ?? 'unknown',
    address: r.address,
    image_url: r.image_url,
    categorized_photos: r.categorized_photos,
    todayHours: todayHoursStr(r.opening_hours),
  };
}


const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const p = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${p}` : `${h12}:${String(m).padStart(2, '0')} ${p}`;
}

function isOpenNow(hours: DbRestaurant['opening_hours']): boolean {
  if (!hours) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  // Check today and yesterday (for overnight ranges that started yesterday)
  const todayIdx = now.getDay();
  const yesterdayIdx = (todayIdx + 6) % 7;

  const checkRanges = (dayVal: any, overnight: boolean) => {
    if (!dayVal) return false;
    const ranges = Array.isArray(dayVal) ? dayVal : [dayVal];
    return ranges.some((r: any) => {
      // 24-hour sentinel
      if (r.open === '00:00' && r.close === '00:00') return true;
      const [oh, om] = r.open.split(':').map(Number);
      const [ch, cm] = r.close.split(':').map(Number);
      const openMins  = oh * 60 + om;
      const closeMins = ch * 60 + cm;
      if (closeMins > openMins) {
        return !overnight && cur >= openMins && cur < closeMins;
      } else {
        // Overnight range (e.g. 10 PM – 3 AM)
        return overnight ? cur < closeMins : cur >= openMins;
      }
    });
  };

  return checkRanges(hours[WEEK_DAYS[todayIdx]], false)
      || checkRanges(hours[WEEK_DAYS[yesterdayIdx]], true);
}

function todayHoursStr(hours: DbRestaurant['opening_hours']): string | null {
  if (!hours) return null;
  const today = WEEK_DAYS[new Date().getDay()];
  const val = hours[today];
  if (!val) return 'Closed today';
  const ranges = Array.isArray(val) ? val : [val];
  if (ranges.length === 0) return 'Closed today';
  if (ranges.length === 1 && ranges[0].open === '00:00' && ranges[0].close === '00:00') return 'Today: Open 24 Hours';
  return 'Today: ' + ranges.map(r => `${fmt12(r.open)}–${fmt12(r.close)}`).join(', ');
}


// ─── screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuth();
  const listRef = useRef<FlatList>(null);

  // location state
  const [userLat, setUserLat]         = useState<number | null>(null);
  const [userLng, setUserLng]         = useState<number | null>(null);
  const [hasLocation, setHasLocation] = useState(false);

  // data
  const [dbRows, setDbRows]         = useState<DbRestaurant[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // global stats for empty state
  const [totalListings, setTotalListings] = useState<number | null>(null);
  const [totalCities,   setTotalCities]   = useState<number | null>(null);

  // ui
  const [query, setQuery]         = useState('');

  // cert guide banner (session only)
  const [certBannerDismissed, setCertBannerDismissed] = useState(false);

  // disclaimer banner (persisted — shown until explicitly dismissed)
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(true); // default true to avoid flash
  useEffect(() => {
    AsyncStorage.getItem('disclaimer_dismissed').then(val => {
      if (val !== 'true') setDisclaimerDismissed(false);
    });
  }, []);
  const dismissDisclaimer = () => {
    setDisclaimerDismissed(true);
    AsyncStorage.setItem('disclaimer_dismissed', 'true');
  };

  // location search
  const [locationInput, setLocationInput] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [searchLat,     setSearchLat]     = useState<number | null>(null);
  const [searchLng,     setSearchLng]     = useState<number | null>(null);
  const [geoLoading,    setGeoLoading]    = useState(false);
  const [geoError,      setGeoError]      = useState<string | null>(null);

  // quick filters
  const [filterOpenNow,    setFilterOpenNow]    = useState(false);
  const [filterTopRated,   setFilterTopRated]   = useState(false);
  const [filterThirdParty, setFilterThirdParty] = useState(false);
  const [radiusMi,         setRadiusMi]         = useState(25);

  // ── GPS ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setHasLocation(true);
      } catch { /* location unavailable */ }
    })();
  }, []);

  // ── Supabase fetch ───────────────────────────────────────────
  const loadRestaurants = useCallback(async () => {
    setFetchLoading(true);
    setFetchError(null);

    const [mainResult, statsResult] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id, name, address, lat, lng, cuisine_type, primary_certifier, certifiers, is_verified, image_url, categorized_photos, opening_hours, avg_rating, reviews(count)')
        .limit(50),
      supabase
        .from('restaurants')
        .select('address'),
    ]);

    let { data, error } = mainResult;

    // Fallback if optional columns don't exist yet
    if (error?.message.includes('opening_hours') || error?.message.includes('certifiers') || error?.message.includes('avg_rating')) {
      const fallback = await supabase
        .from('restaurants')
        .select('id, name, address, lat, lng, cuisine_type, primary_certifier, is_verified, image_url, categorized_photos')
        .limit(50);
      data  = fallback.data as any;
      error = fallback.error;
    }

    if (error) {
      setFetchError(formatError(error));
    } else {
      setDbRows((data as DbRestaurant[]) ?? []);
    }

    // Derive global stats from all addresses
    if (statsResult.data) {
      const addresses = statsResult.data.map((r: { address: string }) => r.address ?? '');
      setTotalListings(addresses.length);
      const cities = new Set(
        addresses
          .map(a => {
            const parts = a.split(',');
            return parts.length >= 2 ? parts[parts.length - 2].trim() : '';
          })
          .filter(Boolean),
      );
      setTotalCities(cities.size);
    }

    setFetchLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadRestaurants(); }, [loadRestaurants]));

  // ── derived card data, filtered + sorted by distance ─────────
  const cardRows = useMemo<Restaurant[]>(() => {
    const refLat = searchLat ?? userLat;
    const refLng = searchLng ?? userLng;
    const q = query.trim().toLowerCase();
    let rows = q
      ? dbRows.filter(r =>
          r.name.toLowerCase().includes(q) ||
          (r.cuisine_type ?? '').toLowerCase().includes(q),
        )
      : [...dbRows];

    // filter by searched location radius
    if (searchLat !== null && searchLng !== null) {
      rows = rows.filter(r =>
        r.lat != null && r.lng != null &&
        haversineKm(searchLat, searchLng, r.lat, r.lng) * 0.621371 <= radiusMi,
      );
    }

    // quick filters
    if (filterOpenNow)    rows = rows.filter(r => isOpenNow(r.opening_hours));
    if (filterTopRated)   rows = rows.filter(r => (r.avg_rating ?? 0) >= 4.0);
    if (filterThirdParty) rows = rows.filter(r => THIRD_PARTY_CERTS.includes(r.primary_certifier));

    // sort: top-rated overrides distance sort; otherwise nearest-first
    if (filterTopRated) {
      rows.sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0));
    } else if (refLat != null && refLng != null) {
      rows.sort((a, b) => {
        const da = a.lat != null && a.lng != null ? haversineKm(refLat, refLng, a.lat, a.lng) : Infinity;
        const db = b.lat != null && b.lng != null ? haversineKm(refLat, refLng, b.lat, b.lng) : Infinity;
        return da - db;
      });
    }

    return rows.map(r => toCard(r, refLat, refLng));
  }, [dbRows, query, userLat, userLng, searchLat, searchLng, radiusMi, filterOpenNow, filterTopRated, filterThirdParty]);

  // ── tapping a list card ──────────────────────────────────────
  const handleCardPress = useCallback(
    (card: Restaurant) => {
      router.push(`/restaurant/${card.id}`);
    },
    [router],
  );

  // ── location search ──────────────────────────────────────────
  const handleLocationSearch = useCallback(async () => {
    const q = locationInput.trim();
    if (!q) { clearLocation(); return; }
    setGeoLoading(true);
    setGeoError(null);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length === 0) {
        setGeoError('Location not found. Try a different city or zip.');
        setSearchLat(null); setSearchLng(null);
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

  // ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>

      {/* ── HEADER ───────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>HalalForMe</Text>
        <Text style={styles.headerSub}>
          {hasLocation ? 'Restaurants near you' : 'Halal restaurants'}
        </Text>
      </View>

      {/* ── SEARCH BAR ───────────────────────────────────────── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color="#aaa" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or cuisine…"
          placeholderTextColor="#bbb"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={17} color="#ccc" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── LOCATION SEARCH ─────────────────────────────────── */}
      <View style={styles.locationRow}>
        <Ionicons name="location-outline" size={17} color="#aaa" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="City or zip code..."
          placeholderTextColor="#bbb"
          value={locationInput}
          onChangeText={setLocationInput}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={handleLocationSearch}
        />
        {geoLoading ? (
          <ActivityIndicator size="small" color={GREEN} />
        ) : locationQuery ? (
          <TouchableOpacity onPress={clearLocation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={17} color={GREEN} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleLocationSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-forward-circle" size={20} color={GREEN} />
          </TouchableOpacity>
        )}
      </View>
      {geoError && <Text style={styles.geoError}>{geoError}</Text>}
      {locationQuery ? (
        <Text style={styles.locationActive}>Within {radiusMi} mi of "{locationQuery}"</Text>
      ) : null}

      {/* ── QUICK FILTERS ────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersContent}
      >
        {(
          [
            { label: 'Open Now', icon: 'time-outline', active: filterOpenNow,  onPress: () => setFilterOpenNow(v => !v)  },
            { label: '4+ Stars', icon: 'star-outline', active: filterTopRated, onPress: () => setFilterTopRated(v => !v) },
          ] as { label: string; icon: string; active: boolean; onPress: () => void }[]
        ).map(f => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterChip, f.active && styles.filterChipActive]}
            onPress={f.onPress}
            activeOpacity={0.75}
          >
            <Ionicons name={f.icon as any} size={13} color={f.active ? '#fff' : '#555'} />
            <Text style={[styles.filterChipText, f.active && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}

        {/* Distance chips */}
        <View style={styles.distanceDivider} />
        {DISTANCE_OPTIONS.map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.filterChip, radiusMi === d && styles.filterChipActive]}
            onPress={() => setRadiusMi(d)}
            activeOpacity={0.75}
          >
            <Ionicons name="navigate-outline" size={13} color={radiusMi === d ? '#fff' : '#555'} />
            <Text style={[styles.filterChipText, radiusMi === d && styles.filterChipTextActive]}>
              {d} mi
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── VERIFIED ONLY TOGGLE ─────────────────────────────── */}
      <TouchableOpacity
        style={[styles.verifiedToggle, filterThirdParty && styles.verifiedToggleActive]}
        onPress={() => setFilterThirdParty(v => !v)}
        activeOpacity={0.8}
      >
        <View style={[styles.verifiedToggleIcon, filterThirdParty && styles.verifiedToggleIconActive]}>
          <Ionicons name="shield-checkmark" size={18} color={filterThirdParty ? '#fff' : GREEN} />
        </View>
        <View style={styles.verifiedToggleBody}>
          <Text style={[styles.verifiedToggleTitle, filterThirdParty && styles.verifiedToggleTitleActive]}>
            Verified Only
          </Text>
          <Text style={[styles.verifiedToggleSub, filterThirdParty && styles.verifiedToggleSubActive]}>
            {filterThirdParty
              ? `${cardRows.length} certified restaurant${cardRows.length !== 1 ? 's' : ''}`
              : 'Show certified restaurants only'}
          </Text>
        </View>
        <Ionicons
          name={filterThirdParty ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={filterThirdParty ? '#fff' : '#ccc'}
        />
      </TouchableOpacity>

      {/* ── RESTAURANT LIST ──────────────────────────────────── */}
      <FlatList
        ref={listRef}
        style={styles.list}
        data={cardRows}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <RestaurantCard restaurant={item} onPress={handleCardPress} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {/* Limited listings disclaimer */}
            {!disclaimerDismissed && (
              <View style={styles.disclaimerCard}>
                <Ionicons name="information-circle-outline" size={20} color="#b7791f" style={{ marginTop: 1 }} />
                <View style={styles.disclaimerBody}>
                  <Text style={styles.disclaimerTitle}>Listings are limited right now</Text>
                  <Text style={styles.disclaimerText}>
                    HalalForMe is community-driven and just getting started. Restaurants are added by users like you — if your local spot isn't here yet, be the first to add it.
                  </Text>
                </View>
                <TouchableOpacity onPress={dismissDisclaimer} hitSlop={12}>
                  <Ionicons name="close" size={18} color="#b7791f" />
                </TouchableOpacity>
              </View>
            )}

            {/* Cert guide discovery banner */}
            {!certBannerDismissed && (
              <View style={styles.certBanner}>
                <TouchableOpacity
                  style={styles.certBannerInner}
                  onPress={() => router.push('/certification-guide')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="shield-checkmark-outline" size={20} color={GREEN} />
                  <Text style={styles.certBannerText}>
                    New to halal certification? Learn what the badges mean →
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCertBannerDismissed(true)} hitSlop={10}>
                  <Ionicons name="close" size={16} color="#bbb" />
                </TouchableOpacity>
              </View>
            )}

            {/* Community banner */}
            <TouchableOpacity
              style={styles.communityBanner}
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
              <View style={styles.communityBannerLeft}>
                <Text style={styles.communityBannerTitle}>Know a halal spot?</Text>
                <Text style={styles.communityBannerSub}>
                  Our listings are community-driven. Help others by adding a restaurant.
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={28} color={GREEN} />
            </TouchableOpacity>

            {fetchLoading ? (
              <Text style={styles.listMeta}>Loading…</Text>
            ) : fetchError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={20} color="#c0392b" />
                <Text style={styles.errorTitle}>Could not load restaurants</Text>
                <Text style={styles.errorDetail}>{fetchError}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadRestaurants}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : cardRows.length === 0 && !query && (searchLat !== null || hasLocation) ? (
              /* ── No restaurants in this area ── */
              <View style={styles.nearbyEmpty}>
                <View style={styles.nearbyEmptyIconWrap}>
                  <Ionicons name="location-outline" size={36} color={GREEN} />
                </View>
                <Text style={styles.nearbyEmptyTitle}>No halal spots near you yet</Text>
                <Text style={styles.nearbyEmptyBody}>
                  We haven't found any listed restaurants within {radiusMi} mi. Be the first to add one in your area — it helps the whole community.
                </Text>

                {/* App-wide stats */}
                {(totalListings !== null || totalCities !== null) && (
                  <View style={styles.nearbyEmptyStats}>
                    {totalListings !== null && (
                      <View style={styles.nearbyEmptyStat}>
                        <Text style={styles.nearbyEmptyStatNum}>{totalListings}</Text>
                        <Text style={styles.nearbyEmptyStatLabel}>
                          listing{totalListings !== 1 ? 's' : ''} app-wide
                        </Text>
                      </View>
                    )}
                    {totalListings !== null && totalCities !== null && (
                      <View style={styles.nearbyEmptyStatDivider} />
                    )}
                    {totalCities !== null && (
                      <View style={styles.nearbyEmptyStat}>
                        <Text style={styles.nearbyEmptyStatNum}>{totalCities}</Text>
                        <Text style={styles.nearbyEmptyStatLabel}>
                          {totalCities !== 1 ? 'cities' : 'city'} covered
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.nearbyEmptyCta}
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
                  <Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={styles.nearbyEmptyCtaText}>Add a Restaurant</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.listMeta}>
                {cardRows.length === 0
                  ? query
                    ? 'No results for that search'
                    : 'No restaurants in the database yet'
                  : `${cardRows.length} restaurant${cardRows.length !== 1 ? 's' : ''}${hasLocation ? ' nearby' : ''}`}
              </Text>
            )}
          </View>
        }
      />

    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f5' },

  // header
  header: {
    backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: GREEN, letterSpacing: -0.5 },
  headerSub:   { fontSize: 12, color: '#aaa', marginTop: 1 },

  // search bar
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 10,
    borderRadius: 14, borderWidth: 1.5, borderColor: '#ebebeb',
    paddingHorizontal: 12, height: 44,
  },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111' },

  // quick filter chips
  filtersScroll:  { flexGrow: 0 },
  filtersContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 8, flexDirection: 'row' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e0e0e0',
  },
  filterChipActive:     { backgroundColor: GREEN, borderColor: GREEN },
  filterChipText:       { fontSize: 13, fontWeight: '600', color: '#555' },
  filterChipTextActive: { color: '#fff' },
  distanceDivider: { width: 1, height: 20, backgroundColor: '#e0e0e0', alignSelf: 'center', marginHorizontal: 4 },

  // location search
  locationRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 6,
    borderRadius: 14, borderWidth: 1.5, borderColor: '#ebebeb',
    paddingHorizontal: 12, height: 44,
  },
  geoError:       { fontSize: 12, color: '#c0392b', marginHorizontal: 20, marginBottom: 4 },
  locationActive: { fontSize: 12, color: GREEN, fontWeight: '600', marginHorizontal: 20, marginBottom: 4 },

  // verified only toggle
  verifiedToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 16,
    padding: 14, borderWidth: 1.5, borderColor: '#e0e0e0',
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
  verifiedToggleTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 1 },
  verifiedToggleTitleActive: { color: '#fff' },
  verifiedToggleSub: { fontSize: 12, color: '#888', lineHeight: 16 },
  verifiedToggleSubActive: { color: 'rgba(255,255,255,0.8)' },

  // list
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
  listHeader: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  listMeta: { fontSize: 12, color: '#aaa', fontWeight: '500' },
  listMetaError: { color: '#e53e3e' },

  // disclaimer banner
  disclaimerCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fefce8', borderRadius: 12,
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#f6d860',
  },
  disclaimerBody: { flex: 1, gap: 3 },
  disclaimerTitle: { fontSize: 13, fontWeight: '700', color: '#92400e' },
  disclaimerText:  { fontSize: 12, color: '#a16207', lineHeight: 17 },

  // cert guide banner
  certBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f0faf6', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#c6e8d6',
  },
  certBannerInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  certBannerText:  { flex: 1, fontSize: 13, color: GREEN, fontWeight: '500', lineHeight: 18 },

  // community banner
  communityBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#e0ede6',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  communityBannerLeft: { flex: 1, marginRight: 12 },
  communityBannerTitle: { fontSize: 14, fontWeight: '700', color: GREEN, marginBottom: 3 },
  communityBannerSub:   { fontSize: 12, color: '#888', lineHeight: 17 },

  // nearby empty state
  nearbyEmpty: {
    alignItems: 'center', paddingVertical: 24, paddingHorizontal: 8,
  },
  nearbyEmptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#e6f4ec', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  nearbyEmptyTitle: {
    fontSize: 17, fontWeight: '700', color: '#111',
    textAlign: 'center', marginBottom: 8,
  },
  nearbyEmptyBody: {
    fontSize: 13, color: '#888', lineHeight: 20,
    textAlign: 'center', marginBottom: 20,
  },
  nearbyEmptyStats: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f0faf6', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 24,
    marginBottom: 20, gap: 0,
    borderWidth: 1, borderColor: '#d0eada',
  },
  nearbyEmptyStat: { flex: 1, alignItems: 'center' },
  nearbyEmptyStatNum: {
    fontSize: 24, fontWeight: '800', color: GREEN, marginBottom: 2,
  },
  nearbyEmptyStatLabel: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  nearbyEmptyStatDivider: {
    width: 1, height: 32, backgroundColor: '#c6e8d6', marginHorizontal: 4,
  },
  nearbyEmptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 28,
  },
  nearbyEmptyCtaText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // error box
  errorBox: {
    alignItems: 'center', paddingVertical: 20, gap: 6,
  },
  errorTitle: {
    fontSize: 15, fontWeight: '700', color: '#c0392b',
  },
  errorDetail: {
    fontSize: 12, color: '#888', textAlign: 'center',
    paddingHorizontal: 8, lineHeight: 17,
  },
  errorHint: {
    fontSize: 12, color: '#b7791f', textAlign: 'center',
    paddingHorizontal: 8, lineHeight: 17, marginTop: 2,
  },
  retryBtn: {
    marginTop: 6, backgroundColor: GREEN,
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10,
  },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },

});
