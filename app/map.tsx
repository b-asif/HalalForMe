import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Localization from 'expo-localization';

import { supabase } from '../lib/supabase';
import { Brand } from '../lib/theme';
import { haversineMi } from '../lib/geo';
import { loadPrayerSettings } from '../lib/prayer/settingsStore';
import { resolveGpsCoordinates, ResolvedCoordinates } from '../lib/prayer/coordinates';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const RADIUS_MI = 10;

// ─── Types ───────────────────────────────────────────────────────────────────

type VenueType = 'restaurant' | 'cafe' | 'grocery' | 'butcher' | 'mosque';
type FilterKey = 'all' | 'food' | 'mosque' | 'cafe' | 'grocery';

interface UnifiedPin {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lng: number;
  type: VenueType;
  route: string;
  osmId?: string;
}

// ─── Pin styling ─────────────────────────────────────────────────────────────

const PIN_STYLE: Record<VenueType, { color: string; icon: string; label: string }> = {
  restaurant: { color: '#E8853A', icon: 'restaurant',    label: 'Restaurant' },
  cafe:       { color: '#6D4C41', icon: 'cafe',          label: 'Cafe'       },
  grocery:    { color: '#2E7D52', icon: 'cart',          label: 'Grocery'    },
  butcher:    { color: '#8B2635', icon: 'cut',           label: 'Butcher'    },
  mosque:     { color: DEEP_GREEN, icon: 'business',     label: 'Mosque'     },
};

const FILTERS: { key: FilterKey; label: string; icon: string }[] = [
  { key: 'all',     label: 'All',     icon: 'apps-outline'        },
  { key: 'food',    label: 'Food',    icon: 'restaurant-outline'  },
  { key: 'mosque',  label: 'Mosques', icon: 'business-outline'    },
  { key: 'cafe',    label: 'Cafes',   icon: 'cafe-outline'        },
  { key: 'grocery', label: 'Grocery', icon: 'cart-outline'        },
];

function matchesFilter(pin: UnifiedPin, filter: FilterKey): boolean {
  if (filter === 'all')    return true;
  if (filter === 'food')   return pin.type === 'restaurant' || pin.type === 'butcher';
  if (filter === 'grocery') return pin.type === 'grocery' || pin.type === 'butcher';
  return pin.type === filter;
}

// ─── Pin component ───────────────────────────────────────────────────────────

function CategoryPin({ type, selected }: { type: VenueType; selected: boolean }) {
  const { color, icon } = PIN_STYLE[type];
  const pinColor = selected ? Brand.gold : color;
  const size     = selected ? 42 : 36;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: pinColor,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2.5, borderColor: '#fff',
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 }, elevation: 4,
      }}>
        <Ionicons name={icon as any} size={selected ? 21 : 17} color="#fff" />
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: pinColor,
        marginTop: -1,
      }} />
    </View>
  );
}

// ─── Default region (continental US) until GPS resolves ───────────────────────

const DEFAULT_REGION: Region = {
  latitude: 37.0902, longitude: -95.7129,
  latitudeDelta: 50, longitudeDelta: 50,
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function UnifiedMapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);

  const [coords,     setCoords]     = useState<ResolvedCoordinates | null>(null);
  const [pins,       setPins]       = useState<UnifiedPin[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<FilterKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Resolve location ─────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
      const settings   = await loadPrayerSettings(regionCode);
      let loc: ResolvedCoordinates | null = null;
      if (settings.locationMode === 'manual' && settings.manualCity) {
        loc = settings.manualCity;
      } else {
        loc = await resolveGpsCoordinates();
      }
      setCoords(loc);
    })();
  }, []);

  // ── Fetch both restaurants and mosques ────────────────────────────────────

  const fetchPins = useCallback(async (loc: ResolvedCoordinates) => {
    setLoading(true);
    const latDelta = (RADIUS_MI * 1.2) / 69;
    const lngDelta = (RADIUS_MI * 1.2) / 50;

    const [foodResult, mosqueResult] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id, name, cuisine_type, category, lat, lng')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .gte('lat', loc.latitude  - latDelta)
        .lte('lat', loc.latitude  + latDelta)
        .gte('lng', loc.longitude - lngDelta)
        .lte('lng', loc.longitude + lngDelta)
        .limit(150),

      supabase
        .from('mosques')
        .select('id, osm_id, name, lat, lng')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .gte('lat', loc.latitude  - latDelta)
        .lte('lat', loc.latitude  + latDelta)
        .gte('lng', loc.longitude - lngDelta)
        .lte('lng', loc.longitude + lngDelta)
        .limit(100),
    ]);

    const foodPins: UnifiedPin[] = ((foodResult.data ?? []) as any[])
      .filter(r => haversineMi(loc.latitude, loc.longitude, r.lat, r.lng) <= RADIUS_MI)
      .map(r => ({
        id:       r.id,
        name:     r.name,
        subtitle: r.cuisine_type || 'Halal',
        lat:      r.lat,
        lng:      r.lng,
        type:     (r.category as VenueType) ?? 'restaurant',
        route:    `/restaurant/${r.id}`,
      }));

    const mosquePins: UnifiedPin[] = ((mosqueResult.data ?? []) as any[])
      .filter(m => haversineMi(loc.latitude, loc.longitude, m.lat, m.lng) <= RADIUS_MI)
      .map(m => ({
        id:       m.id,
        name:     m.name,
        subtitle: 'Mosque',
        lat:      m.lat,
        lng:      m.lng,
        type:     'mosque' as VenueType,
        route:    '',
        osmId:    m.osm_id ?? m.id,
      }));

    setPins([...foodPins, ...mosquePins]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (coords) fetchPins(coords);
  }, [coords, fetchPins]);

  // Animate to user location once resolved
  useEffect(() => {
    if (coords) {
      mapRef.current?.animateToRegion(
        { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.1, longitudeDelta: 0.1 },
        600,
      );
    }
  }, [coords]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const visiblePins = pins.filter(p => matchesFilter(p, filter));
  const selected    = visiblePins.find(p => p.id === selectedId) ?? null;

  // Only show legend types actually present in the current filter
  const presentTypes = [...new Set(visiblePins.map(p => p.type))] as VenueType[];

  const initialRegion: Region = coords
    ? { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.1, longitudeDelta: 0.1 }
    : DEFAULT_REGION;

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea} edges={['top']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
          <Text style={s.title}>Nearby Map</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Category filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filtersContent}
          style={s.filtersRow}
        >
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.chip, filter === f.key && s.chipActive]}
              onPress={() => { setFilter(f.key); setSelectedId(null); }}
              activeOpacity={0.75}
            >
              <Ionicons name={f.icon as any} size={13} color={filter === f.key ? '#fff' : TEXT_MUTED} />
              <Text style={[s.chipText, filter === f.key && s.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Map area */}
        <View style={s.mapContainer}>
          {loading && !coords ? (
            <View style={s.loadingOverlay}>
              <ActivityIndicator size="large" color={GREEN} />
              <Text style={s.loadingText}>Finding your location…</Text>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={s.map}
              initialRegion={initialRegion}
              showsUserLocation
              showsMyLocationButton={false}
              onPress={() => setSelectedId(null)}
            >
              {visiblePins.map(pin => (
                <Marker
                  key={pin.id}
                  coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                  tracksViewChanges={pin.id === selectedId}
                  onPress={e => {
                    e.stopPropagation();
                    setSelectedId(pin.id === selectedId ? null : pin.id);
                  }}
                >
                  <CategoryPin type={pin.type} selected={pin.id === selectedId} />
                </Marker>
              ))}
            </MapView>
          )}

          {/* Recenter button */}
          {coords && (
            <TouchableOpacity
              style={s.recenterBtn}
              onPress={() => mapRef.current?.animateToRegion(
                { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 },
                400,
              )}
              activeOpacity={0.8}
            >
              <Ionicons name="locate" size={20} color={DEEP_GREEN} />
            </TouchableOpacity>
          )}

          {/* Legend — only shows types present in current view */}
          {presentTypes.length > 0 && (
            <View style={s.legend} pointerEvents="none">
              {presentTypes.map(type => (
                <View key={type} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: PIN_STYLE[type].color }]}>
                    <Ionicons name={PIN_STYLE[type].icon as any} size={9} color="#fff" />
                  </View>
                  <Text style={s.legendLabel}>{PIN_STYLE[type].label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Tap-to-preview card */}
          {selected && (
            <TouchableOpacity
              style={s.preview}
              onPress={() => selected.osmId
                ? router.push(`/mosque/${selected.osmId.replace('/', ':')}` as any)
                : router.push(selected.route as any)}
              activeOpacity={0.92}
            >
              <TouchableOpacity
                style={s.previewClose}
                onPress={() => setSelectedId(null)}
                hitSlop={10}
              >
                <Ionicons name="close" size={14} color={TEXT_MUTED} />
              </TouchableOpacity>

              <View style={[s.previewIcon, { backgroundColor: PIN_STYLE[selected.type].color }]}>
                <Ionicons name={PIN_STYLE[selected.type].icon as any} size={16} color="#fff" />
              </View>

              <View style={s.previewBody}>
                <Text style={s.previewName} numberOfLines={1}>{selected.name}</Text>
                <Text style={s.previewSub} numberOfLines={1}>{selected.subtitle}</Text>
              </View>

              <View style={s.previewCta}>
                <Text style={s.previewCtaText}>View</Text>
                <Ionicons name="chevron-forward" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
          )}

          {/* Empty state */}
          {!loading && coords && visiblePins.length === 0 && (
            <View style={s.emptyOverlay} pointerEvents="none">
              <View style={s.emptyBubble}>
                <Ionicons name="location-outline" size={18} color={TEXT_MUTED} />
                <Text style={s.emptyText}>No venues found within {RADIUS_MI} mi</Text>
              </View>
            </View>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: CREAM },
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
  title: { fontSize: 17, fontWeight: '800', color: TEXT_DARK },

  filtersRow:    { flexShrink: 0 },
  filtersContent: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  chipActive:     { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  chipText:       { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  chipTextActive: { color: '#fff' },

  mapContainer:  { flex: 1, position: 'relative' },
  map:           { flex: 1 },

  loadingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:    { fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },

  recenterBtn: {
    position: 'absolute', right: 16, bottom: 96,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },

  legend: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  legendLabel: { fontSize: 11, fontWeight: '600', color: TEXT_DARK },

  preview: {
    position: 'absolute', left: 16, right: 16, bottom: 16,
    backgroundColor: CREAM, borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 10,
    minHeight: 72,
  },
  previewClose: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: HAIRLINE,
    alignItems: 'center', justifyContent: 'center',
  },
  previewIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  previewBody: { flex: 1 },
  previewName: { fontSize: 15, fontWeight: '700', color: TEXT_DARK, paddingRight: 24 },
  previewSub:  { fontSize: 13, color: TEXT_MUTED, marginTop: 2 },

  previewCta: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: DEEP_GREEN,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
  },
  previewCtaText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  emptyOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  emptyText: { fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },
});
