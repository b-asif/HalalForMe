import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';

import { resolveGpsCoordinates, loadCachedGpsCoordinates, ResolvedCoordinates } from '../lib/prayer/coordinates';
import { loadPrayerSettings } from '../lib/prayer/settingsStore';
import MosqueList from '../components/MosqueList';
import { Mosque } from '../lib/mosques/overpass';
import { fetchMosquesWithIqamaTimes } from '../lib/mosques/manual';
import { useAuth } from '../contexts/AuthContext';
import { Brand } from '../lib/theme';
import { formatError } from '../lib/errors';

const DISTANCE_OPTIONS = [5, 10, 25]; // miles

const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const CREAM      = Brand.cream;
const HAIRLINE   = Brand.hairline;

export default function MosquesScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { q: paramQuery, iqamaOnly: iqamaOnlyParam } = useLocalSearchParams<{ q?: string; iqamaOnly?: string }>();
  const iqamaOnly = iqamaOnlyParam === 'true';

  const [coords, setCoords] = useState<ResolvedCoordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(paramQuery ?? '');
  const [radiusMi, setRadiusMi] = useState(10);

  // Iqama-only mode: all mosques in our DB with iqama_times entered.
  const [iqamaMosques, setIqamaMosques] = useState<Mosque[]>([]);
  const [iqamaLoading, setIqamaLoading] = useState(false);
  const [iqamaError, setIqamaError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
      const settings = await loadPrayerSettings(regionCode);
      if (settings.locationMode === 'manual' && settings.manualCity) {
        setCoords(settings.manualCity);
        return;
      }
      const gps = (await loadCachedGpsCoordinates()) ?? await resolveGpsCoordinates();
      if (gps) setCoords(gps);
      else setLocationError('Location unavailable — open Home first to set a city.');
    })();
  }, []);

  // Fetch mosques with iqama times when in iqama-only mode and coordinates are available.
  useEffect(() => {
    if (!iqamaOnly || !coords) return;
    let cancelled = false;
    setIqamaLoading(true);
    setIqamaError(null);
    fetchMosquesWithIqamaTimes(coords.latitude, coords.longitude, 50_000)
      .then(result => { if (!cancelled) setIqamaMosques(result); })
      .catch(err => { if (!cancelled) setIqamaError(formatError(err)); })
      .finally(() => { if (!cancelled) setIqamaLoading(false); });
    return () => { cancelled = true; };
  }, [iqamaOnly, coords]);

  // In iqama-only mode, filter the fetched list client-side by search query.
  const filteredIqamaMosques = iqamaOnly && searchQuery.trim()
    ? iqamaMosques.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : iqamaMosques;

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {iqamaOnly ? 'Mosques with Iqama Times' : 'Nearby Mosques'}
        </Text>
        {isAdmin && !iqamaOnly ? (
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/(admin)/add-mosque')} hitSlop={10}>
            <Ionicons name="add" size={22} color={DEEP_GREEN} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={18} color={TEXT_MUTED} style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search mosques by name..."
          placeholderTextColor={TEXT_MUTED}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={TEXT_MUTED} />
          </TouchableOpacity>
        )}
      </View>

      {!iqamaOnly && searchQuery.length === 0 && (
        <View style={s.filterSection}>
          <View style={s.filterLabelRow}>
            <Ionicons name="location-outline" size={12} color={TEXT_MUTED} />
            <Text style={s.filterLabel}>Search radius</Text>
          </View>
          <View style={s.chipRow}>
            {DISTANCE_OPTIONS.map(d => (
              <TouchableOpacity
                key={d}
                style={[s.chip, radiusMi === d && s.chipActive]}
                onPress={() => setRadiusMi(d)}
                activeOpacity={0.75}
              >
                <Text style={[s.chipText, radiusMi === d && s.chipTextActive]}>
                  {d} mi
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {iqamaOnly ? (
        <MosqueList
          coords={coords}
          locationError={locationError}
          data={filteredIqamaMosques}
          dataLoading={iqamaLoading}
          dataError={iqamaError}
          emptyMessage={
            iqamaLoading
              ? undefined
              : searchQuery.trim()
              ? 'No mosques match your search.'
              : 'No mosques with iqama times found. Mosques must be claimed and have iqama times entered by their admin.'
          }
        />
      ) : (
        <MosqueList
          coords={coords}
          locationError={locationError}
          searchQuery={searchQuery}
          radiusMi={radiusMi}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  addBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#e6f9f2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 14, marginBottom: 0,
    borderRadius: 14, borderWidth: 1.5, borderColor: HAIRLINE, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: TEXT_DARK },

  filterSection:  { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  filterLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  filterLabel:    { fontSize: 11, fontWeight: '600', color: TEXT_MUTED,
                    letterSpacing: 0.5, textTransform: 'uppercase' },
  chipRow:        { flexDirection: 'row', gap: 8 },
  chip:           { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12,
                    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE },
  chipActive:     { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  chipText:       { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  chipTextActive: { color: '#fff' },
});
