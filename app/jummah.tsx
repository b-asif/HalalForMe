import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, ImageBackground,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Localization from 'expo-localization';

import { supabase } from '../lib/supabase';
import { haversineMi } from '../lib/geo';
import { Brand } from '../lib/theme';
import { loadPrayerSettings } from '../lib/prayer/settingsStore';
import { toHijriDate } from '../lib/prayer/hijri';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const GOLD       = Brand.gold;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const RED        = Brand.red;

const RADIUS_OPTIONS = [10, 25, 50];

// Short Hijri month abbreviations for date chips (matching common Islamic
// calendar conventions — avoids the long full names in tight space).
const HIJRI_ABBR = [
  'Muh', 'Saf', 'Rb.I', 'Rb.II', 'Jm.I', 'Jm.II',
  'Raj', 'Sha', 'Ram', 'Shw', 'DhQ', 'DhH',
];

/** Returns a human label describing which Friday the schedule was prepared for.
 *  An admin updating on Tuesday is preparing for the coming Friday, not the
 *  previous one — so we map updatedAt to the next Friday on or after that date. */
function scheduleWeekLabel(updatedAt: string | null): string {
  if (!updatedAt) return 'Schedule date unknown';
  const updated = new Date(updatedAt);
  if (isNaN(updated.getTime())) return 'Schedule date unknown';
  updated.setHours(0, 0, 0, 0);

  // Next Friday on or after the update date (same day if update was on a Friday).
  const updatedDay = updated.getDay();
  const daysToFriday = updatedDay === 5 ? 0 : (5 - updatedDay + 7) % 7;
  const targetFriday = new Date(updated);
  targetFriday.setDate(updated.getDate() + daysToFriday);

  // This week's Friday (next Friday on or after today).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDay = today.getDay();
  const daysToThisFriday = todayDay === 5 ? 0 : (5 - todayDay + 7) % 7;
  const thisFriday = new Date(today);
  thisFriday.setDate(today.getDate() + daysToThisFriday);

  const lastFriday = new Date(thisFriday);
  lastFriday.setDate(thisFriday.getDate() - 7);
  const nextFriday = new Date(thisFriday);
  nextFriday.setDate(thisFriday.getDate() + 7);

  const fridayLabel = targetFriday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (targetFriday.getTime() === thisFriday.getTime()) return `This week · ${fridayLabel}`;
  if (targetFriday.getTime() === lastFriday.getTime()) return `Last week · ${fridayLabel}`;
  if (targetFriday.getTime() === nextFriday.getTime()) return `Next week · ${fridayLabel}`;
  if (targetFriday < lastFriday) return `${fridayLabel} (older)`;
  return fridayLabel;
}

function getUpcomingFridays(count = 5): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilFriday = (5 - today.getDay() + 7) % 7;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + daysUntilFriday + i * 7);
    return d;
  });
}

interface JummahSession {
  time: string;
  khateeb?: string | null;
  hall?: string | null;
}

interface MosqueRow {
  id: string;
  osm_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  jummah_sessions: JummahSession[];
  updated_at: string | null;
  distanceMi: number;
}

export default function JummahScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [locationInput, setLocationInput] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [searchLat,     setSearchLat]     = useState<number | null>(null);
  const [searchLng,     setSearchLng]     = useState<number | null>(null);
  const [geoLoading,    setGeoLoading]    = useState(false);
  const [geoError,      setGeoError]      = useState<string | null>(null);

  const [radiusMi,        setRadiusMi]        = useState(25);
  const [selectedFriday,  setSelectedFriday]  = useState(0);

  const [mosques, setMosques] = useState<MosqueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const fridays = useMemo(() => getUpcomingFridays(5), []);

  // Pre-populate location from prayer settings so the user lands on their
  // already-configured city — same approach as the food explore screen.
  useEffect(() => {
    (async () => {
      try {
        const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
        const settings   = await loadPrayerSettings(regionCode);
        let lat: number | null = null;
        let lng: number | null = null;
        let label = '';

        if (settings.locationMode === 'manual' && settings.manualCity) {
          lat   = settings.manualCity.latitude;
          lng   = settings.manualCity.longitude;
          label = settings.manualCity.label;
        } else {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const last = await Location.getLastKnownPositionAsync();
            const pos  = last ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
        // Leave blank — user can enter manually.
      }
    })();
  }, []);

  const fetchMosques = useCallback(async () => {
    if (searchLat === null || searchLng === null) {
      setMosques([]);
      return;
    }
    setLoading(true);
    setError(null);

    // 20% box buffer so the client-side haversine filter gets clean edges.
    // At 50°N, 1° lng ≈ 44 mi; dividing by 50 is safe for all US latitudes.
    const latDelta = (radiusMi * 1.2) / 69;
    const lngDelta = (radiusMi * 1.2) / 50;

    // Only query mosques that have been admin-onboarded (have a row in the
    // mosques table with real jummah_sessions). OSM-only pins are excluded
    // by design — they carry no Jummah data and would just fill the list
    // with empty cards.
    const { data, error: err } = await supabase
      .from('mosques')
      .select('id, osm_id, name, address, lat, lng, jummah_sessions, updated_at')
      .not('jummah_sessions', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .gte('lat', searchLat - latDelta)
      .lte('lat', searchLat + latDelta)
      .gte('lng', searchLng - lngDelta)
      .lte('lng', searchLng + lngDelta)
      .limit(100);

    if (err) {
      setError('Could not load Jummah times. Please try again.');
      setLoading(false);
      return;
    }

    const rows = ((data ?? []) as any[])
      .filter(m => Array.isArray(m.jummah_sessions) && m.jummah_sessions.length > 0)
      .map(m => ({
        ...m,
        distanceMi: haversineMi(searchLat, searchLng, m.lat, m.lng),
      }))
      .filter(m => m.distanceMi <= radiusMi)
      .sort((a: any, b: any) => a.distanceMi - b.distanceMi) as MosqueRow[];

    setMosques(rows);
    setLoading(false);
  }, [searchLat, searchLng, radiusMi]);

  useEffect(() => {
    fetchMosques();
  }, [fetchMosques]);

  const handleLocationSearch = async () => {
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
      }
    } catch {
      setGeoError('Could not search that location. Try again.');
    }
    setGeoLoading(false);
  };

  const useMyLocation = async () => {
    setGeoLoading(true);
    setGeoError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGeoError('Location permission denied.');
        setGeoLoading(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setSearchLat(pos.coords.latitude);
      setSearchLng(pos.coords.longitude);
      setLocationInput('Current location');
      setLocationQuery('Current location');
    } catch {
      setGeoError('Could not get your location.');
    }
    setGeoLoading(false);
  };

  return (
    <View style={s.root}>
      {/* ── Hero banner ── */}
      <ImageBackground
        source={require('../assets/background.png')}
        style={[s.hero, { paddingTop: insets.top + 16 }]}
        imageStyle={s.heroBg}
      >
        <View style={s.heroOverlay} />
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={s.heroTitle}>Jummah Times</Text>
        <Text style={s.heroSub}>Find Jummah times at mosques near you</Text>
      </ImageBackground>

      <SafeAreaView style={s.flex} edges={['bottom']}>
        <FlatList
          data={mosques}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
          ListHeaderComponent={
            <View>
              {/* ── Location + radius controls ── */}
              <View style={s.controlsCard}>
                <View style={s.locationRow}>
                  <Ionicons name="location-outline" size={16} color={TEXT_MUTED} />
                  <TextInput
                    style={s.locationInput}
                    placeholder="City, state, or zip code..."
                    placeholderTextColor={TEXT_MUTED}
                    value={locationInput}
                    onChangeText={setLocationInput}
                    onSubmitEditing={handleLocationSearch}
                    returnKeyType="search"
                    autoCapitalize="none"
                  />
                  {locationInput.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setLocationInput('');
                        setLocationQuery('');
                        setSearchLat(null);
                        setSearchLng(null);
                        setGeoError(null);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={16} color={TEXT_MUTED} />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={s.controlsBtnRow}>
                  <TouchableOpacity
                    style={s.useLocationBtn}
                    onPress={useMyLocation}
                    disabled={geoLoading}
                    activeOpacity={0.8}
                  >
                    {geoLoading
                      ? <ActivityIndicator size="small" color={DEEP_GREEN} />
                      : <Ionicons name="locate-outline" size={15} color={DEEP_GREEN} />}
                    <Text style={s.useLocationText}>Use my location</Text>
                  </TouchableOpacity>

                  <View style={s.radiusRow}>
                    {RADIUS_OPTIONS.map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[s.radiusChip, radiusMi === r && s.radiusChipActive]}
                        onPress={() => setRadiusMi(r)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.radiusChipText, radiusMi === r && s.radiusChipTextActive]}>
                          {r} mi
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {geoError && <Text style={s.geoError}>{geoError}</Text>}
                {locationQuery ? (
                  <Text style={s.locationActive}>
                    Showing within {radiusMi} mi of "{locationQuery}"
                    {fridays[selectedFriday] ? ` · ${fridays[selectedFriday].toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}
                  </Text>
                ) : null}
              </View>

              {/* ── Upcoming Fridays date picker ── */}
              <View style={s.fridayRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.fridayScroll}
                >
                  {fridays.map((fri, i) => {
                    const hijri   = toHijriDate(fri);
                    const abbr    = HIJRI_ABBR[hijri.month - 1];
                    const active  = selectedFriday === i;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.fridayChip, active && s.fridayChipActive]}
                        onPress={() => setSelectedFriday(i)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.fridayWeekday, active && s.fridayTextActive]}>Fri</Text>
                        <Text style={[s.fridayDate, active && s.fridayTextActive]}>
                          {fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                        <Text style={[s.fridayHijri, active && s.fridayHijriActive]}>
                          ({hijri.day} {abbr})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* ── Disclaimer ── */}
              <View style={s.disclaimer}>
                <Ionicons name="information-circle-outline" size={16} color={TEXT_MUTED} style={{ marginRight: 8, flexShrink: 0 }} />
                <Text style={s.disclaimerText}>
                  Jummah times may vary. Please check with your local mosque for any updates.
                </Text>
              </View>

              {loading && (
                <View style={s.loadingWrap}>
                  <ActivityIndicator size="large" color={GREEN} />
                </View>
              )}
              {error && !loading && (
                <View style={s.centeredMsg}>
                  <Ionicons name="alert-circle-outline" size={36} color={TEXT_MUTED} />
                  <Text style={s.emptyTitle}>Something went wrong</Text>
                  <Text style={s.emptyText}>{error}</Text>
                  <TouchableOpacity style={s.retryBtn} onPress={fetchMosques}>
                    <Text style={s.retryText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!loading && !error && mosques.length === 0 && (
                <View style={s.centeredMsg}>
                  <MaterialCommunityIcons name="mosque" size={52} color={TEXT_MUTED} />
                  <Text style={s.emptyTitle}>
                    {searchLat === null ? 'Enter your location' : 'No Jummah times found nearby'}
                  </Text>
                  <Text style={s.emptyText}>
                    {searchLat === null
                      ? 'Search a city or use your current location to find Jummah times near you.'
                      : `No mosque pages with Jummah times within ${radiusMi} mi. Try a larger distance or a different city.`}
                  </Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <JummahCard
              mosque={item}
              onPress={() => router.push(`/mosque/${item.osm_id.replace('/', ':')}` as any)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      </SafeAreaView>
    </View>
  );
}

// ─── Mosque card ─────────────────────────────────────────────────────────────

function JummahCard({ mosque, onPress }: { mosque: MosqueRow; onPress: () => void }) {
  return (
    <TouchableOpacity style={c.card} onPress={onPress} activeOpacity={0.85}>
      {/* Top row: icon + name + address + distance */}
      <View style={c.topRow}>
        <View style={c.iconCircle}>
          <MaterialCommunityIcons name="mosque" size={26} color="#fff" />
        </View>
        <View style={c.nameBlock}>
          <Text style={c.name} numberOfLines={2}>{mosque.name}</Text>
          <View style={c.addressRow}>
            <Ionicons name="location-outline" size={12} color={TEXT_MUTED} />
            <Text style={c.address} numberOfLines={1} ellipsizeMode="tail">
              {mosque.address ?? 'Address unavailable'}
            </Text>
            <Text style={c.distance}>{mosque.distanceMi.toFixed(1)} mi</Text>
          </View>
        </View>
      </View>

      {/* Schedule currency badge */}
      <View style={c.scheduleBadgeRow}>
        <Ionicons name="calendar-outline" size={11} color={TEXT_MUTED} />
        <Text style={c.scheduleBadgeText}>{scheduleWeekLabel(mosque.updated_at)}</Text>
      </View>

      {/* One block per Jummah session — admins add a new session for each
          khutbah slot rather than storing a 2nd time on the same session. */}
      {mosque.jummah_sessions.map((session, i) => (
        <View key={i}>
          <View style={c.divider} />
          <View style={c.sessionRow}>
            <View style={c.khutbahCol}>
              {mosque.jummah_sessions.length > 1 && (
                <Text style={c.khutbahLabel}>Jummah {i + 1}</Text>
              )}
              <Text style={c.khutbahTime}>{session.time}</Text>
            </View>
          </View>
          {session.khateeb ? (
            <View style={c.khateebRow}>
              <Ionicons name="mic-outline" size={13} color={TEXT_MUTED} />
              <Text style={c.khateebText}>{session.khateeb}</Text>
            </View>
          ) : null}
          <View style={c.sessionFooter}>
            {session.hall ? (
              <View style={c.hallRow}>
                <Ionicons name="people-outline" size={13} color={TEXT_MUTED} />
                <Text style={c.hallText}>{session.hall}</Text>
              </View>
            ) : <View />}
            <View style={c.arriveRow}>
              <Text style={c.arriveText}>Arrive early</Text>
              <Ionicons name="time-outline" size={13} color={GOLD} />
            </View>
          </View>
        </View>
      ))}
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: CREAM },
  flex:  { flex: 1 },

  hero: {
    paddingHorizontal: 20, paddingBottom: 28,
    justifyContent: 'flex-end',
  },
  heroBg:      { resizeMode: 'cover' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,38,24,0.62)' },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 4 },
  heroSub:   { fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 20 },

  // Controls card
  controlsCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, marginBottom: 0,
    borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE, paddingBottom: 12, marginBottom: 12,
  },
  locationInput: { flex: 1, fontSize: 14, color: TEXT_DARK, paddingVertical: 2 },

  controlsBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },

  useLocationBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: DEEP_GREEN, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  useLocationText: { fontSize: 12, fontWeight: '700', color: DEEP_GREEN },

  radiusRow: { flexDirection: 'row', gap: 6 },
  radiusChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: CREAM, borderWidth: 1.5, borderColor: HAIRLINE,
  },
  radiusChipActive:    { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  radiusChipText:      { fontSize: 12, fontWeight: '600', color: TEXT_MUTED },
  radiusChipTextActive:{ color: '#fff' },

  geoError:      { fontSize: 12, color: RED, marginTop: 8 },
  locationActive:{ fontSize: 12, color: GREEN, fontWeight: '600', marginTop: 8 },

  // Friday picker
  fridayRow:    { paddingVertical: 14 },
  fridayScroll: { paddingHorizontal: 16, gap: 8 },
  fridayChip: {
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: HAIRLINE, minWidth: 80,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  fridayChipActive:  { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  fridayWeekday:     { fontSize: 11, fontWeight: '600', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  fridayDate:        { fontSize: 14, fontWeight: '800', color: TEXT_DARK, marginVertical: 2 },
  fridayHijri:       { fontSize: 10, color: TEXT_MUTED },
  fridayTextActive:  { color: '#fff' },
  fridayHijriActive: { color: 'rgba(255,255,255,0.7)' },

  // Disclaimer
  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#F5F3EE', borderRadius: 12, padding: 12,
  },
  disclaimerText: { flex: 1, fontSize: 12, color: TEXT_MUTED, lineHeight: 17 },

  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  centeredMsg: {
    alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40, gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },
  emptyText:  { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 19 },
  retryBtn:   { marginTop: 8, backgroundColor: DEEP_GREEN, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText:  { color: '#fff', fontSize: 13, fontWeight: '700' },
});

const c = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    backgroundColor: '#fff', borderRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
    overflow: 'hidden',
  },

  topRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: DEEP_GREEN,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  nameBlock:  { flex: 1 },
  name:       { fontSize: 16, fontWeight: '800', color: TEXT_DARK, lineHeight: 21, marginBottom: 4 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address:    { flex: 1, fontSize: 12, color: TEXT_MUTED },
  distance:   { fontSize: 12, fontWeight: '700', color: TEXT_DARK, marginLeft: 4 },

  scheduleBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 16, paddingBottom: 10,
  },
  scheduleBadgeText: { fontSize: 11, color: TEXT_MUTED },

  divider: { height: 1, backgroundColor: HAIRLINE, marginHorizontal: 16 },

  sessionRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  khutbahCol: { flex: 1 },
  khutbahLabel: {
    fontSize: 11, fontWeight: '600', color: TEXT_MUTED,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3,
  },
  khutbahTime: { fontSize: 22, fontWeight: '800', color: TEXT_DARK, letterSpacing: -0.5 },

  sessionFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, paddingTop: 6,
  },
  khateebRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingBottom: 6 },
  khateebText:{ fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' },
  hallRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hallText:   { fontSize: 12, color: TEXT_MUTED },
  arriveRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arriveText: { fontSize: 12, color: GOLD, fontWeight: '600' },
});
