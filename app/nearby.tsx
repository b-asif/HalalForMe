import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Localization from 'expo-localization';

import { supabase } from '../lib/supabase';
import { Brand } from '../lib/theme';
import { haversineMi } from '../lib/geo';
import { loadPrayerSettings } from '../lib/prayer/settingsStore';
import { resolveGpsCoordinates, loadCachedGpsCoordinates, saveGpsCoordinatesCache, ResolvedCoordinates } from '../lib/prayer/coordinates';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const GOLD       = Brand.gold;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const RADIUS_OPTIONS = [3, 5, 10, 25] as const;
type RadiusOption = typeof RADIUS_OPTIONS[number];

// ─── Types ────────────────────────────────────────────────────────────────────

type VenueType = 'restaurant' | 'cafe' | 'grocery' | 'butcher' | 'mosque';
type CategoryFilter = 'all' | 'mosque' | 'food' | 'cafe' | 'grocery' | 'prayer_room';

interface JummahSession {
  label?: string;
  khutbah_1?: string;
  khutbah_2?: string;
  time?: string;
}

interface FoodVenue {
  kind: 'food';
  id: string;
  name: string;
  address: string | null;
  cuisine_type: string;
  category: string;
  image_url: string | null;
  lat: number;
  lng: number;
  opening_hours: Record<string, any> | null;
  primary_certifier: string;
  distanceMi: number;
}

interface MosqueVenue {
  kind: 'mosque';
  id: string;
  osm_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  jummah_sessions: JummahSession[] | null;
  distanceMi: number;
}

type Venue = FoodVenue | MosqueVenue;

// ─── Pin config ───────────────────────────────────────────────────────────────

const PIN_STYLE: Record<VenueType, { color: string; icon: string }> = {
  restaurant: { color: '#E8853A', icon: 'restaurant' },
  cafe:       { color: '#6D4C41', icon: 'cafe' },
  grocery:    { color: '#2E7D52', icon: 'cart' },
  butcher:    { color: '#8B2635', icon: 'cut' },
  mosque:     { color: DEEP_GREEN, icon: 'mosque' },
};

// ─── Category tab definitions ─────────────────────────────────────────────────

const CATEGORY_TABS: {
  key: CategoryFilter;
  label: string;
  icon: string;
  lib: 'ionicons' | 'material';
}[] = [
  { key: 'all',         label: 'All',          icon: 'apps',         lib: 'ionicons'  },
  { key: 'mosque',      label: 'Mosques',      icon: 'mosque',       lib: 'material'  },
  { key: 'food',        label: 'Halal Food',   icon: 'restaurant',   lib: 'ionicons'  },
  { key: 'cafe',        label: 'Cafes',        icon: 'cafe',         lib: 'ionicons'  },
  { key: 'grocery',     label: 'Groceries',    icon: 'cart',         lib: 'ionicons'  },
  { key: 'prayer_room', label: 'Prayer Rooms', icon: 'hands-pray',   lib: 'material'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function venueType(v: Venue): VenueType {
  if (v.kind === 'mosque') return 'mosque';
  const cat = v.category?.toLowerCase() ?? 'restaurant';
  if (cat === 'cafe')    return 'cafe';
  if (cat === 'grocery') return 'grocery';
  if (cat === 'butcher') return 'butcher';
  return 'restaurant';
}

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isOpenNow(hours: Record<string, any> | null): boolean {
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

function closeTimeLabel(hours: Record<string, any> | null): string | null {
  if (!hours) return null;
  const day = WEEK_DAYS[new Date().getDay()];
  const dayVal = hours[day];
  if (!dayVal) return null;
  const ranges = Array.isArray(dayVal) ? dayVal : [dayVal];
  const r = ranges[0];
  if (!r?.close) return null;
  const [h, m] = r.close.split(':').map(Number);
  const p   = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}:00 ${p}` : `${h12}:${String(m).padStart(2, '0')} ${p}`;
}

function distLabel(mi: number): string {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

function fmt12(t: string): string {
  if (!t) return '';
  // Already in 12-hour format (e.g. "1:15 PM") — return as-is
  if (/[AP]M/i.test(t)) return t.trim();
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const p   = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${p}` : `${h12}:${String(m).padStart(2, '0')} ${p}`;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={[s.card, { overflow: 'hidden' }]}>
      <View style={[s.thumbWrap, { backgroundColor: '#E8E8E4' }]} />
      <View style={[s.cardBody, { gap: 8, justifyContent: 'center' }]}>
        <View style={{ height: 14, width: '70%', backgroundColor: '#E8E8E4', borderRadius: 6 }} />
        <View style={{ height: 11, width: '50%', backgroundColor: '#EFEFEB', borderRadius: 6 }} />
        <View style={{ height: 11, width: '40%', backgroundColor: '#EFEFEB', borderRadius: 6 }} />
      </View>
    </View>
  );
}

// ─── Map pin ──────────────────────────────────────────────────────────────────

function MapPin({ type, selected }: { type: VenueType; selected: boolean }) {
  const { color, icon } = PIN_STYLE[type];
  const pinColor = selected ? GOLD : color;
  const size = selected ? 40 : 34;
  const iconSize = Math.round(size * 0.45);
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: pinColor,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2.5, borderColor: '#fff',
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 }, elevation: 4,
      }}>
        {type === 'mosque'
          ? <MaterialCommunityIcons name="mosque" size={iconSize} color="#fff" />
          : <Ionicons name={icon as any} size={iconSize} color="#fff" />
        }
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: pinColor, marginTop: -1,
      }} />
    </View>
  );
}

// ─── Food card ────────────────────────────────────────────────────────────────

function FoodCard({ item, onPress }: { item: FoodVenue; onPress: () => void }) {
  const type = venueType(item);
  const { color, icon } = PIN_STYLE[type];
  const open      = isOpenNow(item.opening_hours);
  const closeTime = closeTimeLabel(item.opening_hours);

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      {/* Thumbnail */}
      <View style={s.thumbWrap}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={s.thumb} contentFit="cover" transition={200} />
        ) : (
          <View style={[s.thumbPlaceholder, { backgroundColor: color + '22' }]}>
            <Ionicons name={icon as any} size={28} color={color} />
          </View>
        )}
      </View>

      {/* Body */}
      <View style={s.cardBody}>
        <View style={s.nameRow}>
          <View style={[s.iconCircle, { backgroundColor: color }]}>
            <Ionicons name={icon as any} size={12} color="#fff" />
          </View>
          <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
        </View>

        {item.address ? (
          <Text style={s.cardAddr} numberOfLines={1}>{item.address}</Text>
        ) : null}

        <View style={s.tagsRow}>
          {item.primary_certifier && item.primary_certifier.toLowerCase() !== 'unknown' ? (
            <View style={s.tag}><Text style={s.tagText}>{item.primary_certifier}</Text></View>
          ) : null}
          {item.cuisine_type ? (
            <View style={s.tag}><Text style={s.tagText}>{item.cuisine_type}</Text></View>
          ) : null}
          <View style={s.distPill}>
            <Text style={s.distPillText}>{distLabel(item.distanceMi)}</Text>
          </View>
        </View>

        {item.opening_hours ? (
          <View style={s.metaRow}>
            <Ionicons name="time-outline" size={11} color={open ? GREEN : '#C62828'} />
            <Text style={[s.metaText, { color: open ? TEXT_MUTED : '#C62828' }]}>
              {open ? `Open until ${closeTime ?? '—'}` : 'Closed now'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Actions */}
      <View style={s.cardActions}>
        <TouchableOpacity hitSlop={10} style={s.actionBtn} onPress={onPress}>
          <Ionicons name="information-circle-outline" size={21} color={TEXT_MUTED} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── Mosque card ──────────────────────────────────────────────────────────────

function MosqueCard({ item, onPress }: { item: MosqueVenue; onPress: () => void }) {
  const sessions = item.jummah_sessions ?? [];
  const jummahTimes = sessions
    .map(sess => {
      const parts: string[] = [];
      if (sess.khutbah_1) parts.push(fmt12(sess.khutbah_1));
      if (sess.khutbah_2) parts.push(fmt12(sess.khutbah_2));
      if (!parts.length && sess.time) parts.push(fmt12(sess.time));
      return parts.join(' & ');
    })
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      {/* Thumbnail */}
      <View style={s.thumbWrap}>
        <View style={[s.thumbPlaceholder, { backgroundColor: DEEP_GREEN + '15' }]}>
          <MaterialCommunityIcons name="mosque" size={30} color={DEEP_GREEN} />
        </View>
      </View>

      {/* Body */}
      <View style={s.cardBody}>
        <View style={s.nameRow}>
          <View style={[s.iconCircle, { backgroundColor: DEEP_GREEN }]}>
            <MaterialCommunityIcons name="mosque" size={11} color="#fff" />
          </View>
          <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
        </View>

        {item.address ? (
          <Text style={s.cardAddr} numberOfLines={1}>{item.address}</Text>
        ) : null}

        <View style={s.tagsRow}>
          <View style={s.tag}><Text style={s.tagText}>Mosque</Text></View>
          <View style={s.distPill}>
            <Text style={s.distPillText}>{distLabel(item.distanceMi)}</Text>
          </View>
        </View>

        {jummahTimes ? (
          <View style={s.metaRow}>
            <Ionicons name="time-outline" size={11} color={DEEP_GREEN} />
            <Text style={[s.metaText, { color: DEEP_GREEN }]} numberOfLines={1}>
              Jummah {jummahTimes}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Actions */}
      <View style={s.cardActions}>
        <TouchableOpacity hitSlop={10} style={s.actionBtn} onPress={onPress}>
          <Ionicons name="information-circle-outline" size={21} color={TEXT_MUTED} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── Map section (memo so React reconciles markers without remounting the map) ──

interface MapSectionProps {
  mapRegion: Region;
  venues: Venue[];
  selectedId: string | null;
  mapRef: React.RefObject<MapView | null>;
  onMarkerPress: (id: string) => void;
  onMapPress: () => void;
  onRecenter: () => void;
  onVenuePress: (v: Venue) => void;
  count: number;
}

const MapSection = memo(function MapSection({
  mapRegion, venues, selectedId, mapRef,
  onMarkerPress, onMapPress, onRecenter, onVenuePress, count,
}: MapSectionProps) {
  const selectedVenue = selectedId != null ? venues.find(v => v.id === selectedId) ?? null : null;

  return (
    <View>
      <View style={s.mapContainer}>
        <MapView
          ref={mapRef}
          style={s.map}
          initialRegion={mapRegion}
          showsUserLocation
          showsMyLocationButton={false}
          onPress={onMapPress}
        >
          {venues.filter(v => v.lat != null && v.lng != null).map(v => {
            const key = v.kind === 'mosque' ? `mosque-${v.id}` : `food-${v.id}`;
            const sel = selectedId === v.id;
            return (
              <Marker
                key={key}
                coordinate={{ latitude: v.lat, longitude: v.lng }}
                anchor={{ x: 0.5, y: 1 }}
                tracksViewChanges={sel}
                onPress={e => { e.stopPropagation(); onMarkerPress(v.id); }}
              >
                <MapPin type={venueType(v)} selected={sel} />
              </Marker>
            );
          })}
        </MapView>
        <TouchableOpacity style={s.recenterBtn} onPress={onRecenter} hitSlop={8}>
          <Ionicons name="navigate" size={16} color={DEEP_GREEN} />
        </TouchableOpacity>

        {/* ── Callout card ─────────────────────────────────────── */}
        {selectedVenue != null && (() => {
          const type = venueType(selectedVenue);
          const { color, icon } = PIN_STYLE[type];
          const isMosque = selectedVenue.kind === 'mosque';
          return (
            <TouchableOpacity
              style={s.mapCallout}
              onPress={() => onVenuePress(selectedVenue)}
              activeOpacity={0.88}
            >
              <View style={s.mapCalloutRow}>
                <View style={[s.mapCalloutIcon, { backgroundColor: color }]}>
                  {isMosque ? (
                    <MaterialCommunityIcons name="mosque" size={18} color="#fff" />
                  ) : (
                    <Ionicons name={icon as any} size={18} color="#fff" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mapCalloutName} numberOfLines={1}>{selectedVenue.name}</Text>
                  <Text style={s.mapCalloutSub} numberOfLines={1}>
                    {selectedVenue.address ?? (isMosque ? 'Mosque' : type.charAt(0).toUpperCase() + type.slice(1))}
                    {'  ·  '}
                    {distLabel(selectedVenue.distanceMi)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
              </View>
            </TouchableOpacity>
          );
        })()}
      </View>
      <View style={s.countRow}>
        <Text style={s.countText}>{count} places nearby</Text>
        <Text style={s.sortText}>Sort by: <Text style={s.sortBold}>Distance</Text> ↓</Text>
      </View>
    </View>
  );
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NearbyScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);

  const [coords,    setCoords]    = useState<ResolvedCoordinates | null>(null);
  const [radiusMi,  setRadiusMi]  = useState<RadiusOption>(5);
  const [category,  setCategory]  = useState<CategoryFilter>('all');
  const [openNow,   setOpenNow]   = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [loading,   setLoading]   = useState(true);

  // ── Location ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // Fast path: use cached GPS immediately so the fetch starts without waiting
      // for prayer settings or a fresh GPS fix (which can take several seconds).
      const cached = await loadCachedGpsCoordinates();
      if (cached) setCoords(cached);

      // Slow path runs in parallel — if manual mode is configured, override with
      // that city; otherwise fresh GPS only kicks in if there was no cache.
      const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
      const settings   = await loadPrayerSettings(regionCode);
      if (settings.locationMode === 'manual' && settings.manualCity) {
        setCoords(settings.manualCity);
      } else if (!cached) {
        const fresh = await resolveGpsCoordinates();
        if (fresh) {
          setCoords(fresh);
          saveGpsCoordinatesCache(fresh);
        }
      }
    })();
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (loc: ResolvedCoordinates, radius: number) => {
    setLoading(true);
    const latDelta = (radius * 1.2) / 69;
    const lngDelta = (radius * 1.2) / 50;

    const [foodRes, mosqueRes] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id, name, address, cuisine_type, category, image_url, lat, lng, opening_hours, primary_certifier')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .gte('lat', loc.latitude  - latDelta)
        .lte('lat', loc.latitude  + latDelta)
        .gte('lng', loc.longitude - lngDelta)
        .lte('lng', loc.longitude + lngDelta)
        .limit(200),

      supabase
        .from('mosques')
        .select('id, osm_id, name, address, lat, lng, jummah_sessions')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .gte('lat', loc.latitude  - latDelta)
        .lte('lat', loc.latitude  + latDelta)
        .gte('lng', loc.longitude - lngDelta)
        .lte('lng', loc.longitude + lngDelta),
    ]);

    const food: FoodVenue[] = ((foodRes.data ?? []) as any[])
      .map(r => ({
        kind:             'food' as const,
        id:               r.id,
        name:             r.name,
        address:          r.address ?? null,
        cuisine_type:     r.cuisine_type ?? '',
        category:         r.category ?? 'restaurant',
        image_url:        r.image_url ?? null,
        lat:              r.lat,
        lng:              r.lng,
        opening_hours:    r.opening_hours ?? null,
        primary_certifier: r.primary_certifier ?? '',
        distanceMi:       haversineMi(loc.latitude, loc.longitude, r.lat, r.lng),
      }))
      .filter(r => r.distanceMi <= radius);

    const mosques: MosqueVenue[] = ((mosqueRes.data ?? []) as any[])
      .map(m => ({
        kind:            'mosque' as const,
        id:              m.id,
        osm_id:          m.osm_id ?? m.id,
        name:            m.name,
        address:         m.address ?? null,
        lat:             m.lat,
        lng:             m.lng,
        jummah_sessions: m.jummah_sessions ?? null,
        distanceMi:      haversineMi(loc.latitude, loc.longitude, m.lat, m.lng),
      }))
      .filter(m => m.distanceMi <= radius);

    setAllVenues([...food, ...mosques].sort((a, b) => a.distanceMi - b.distanceMi));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (coords) fetchAll(coords, radiusMi);
  }, [coords, radiusMi, fetchAll]);

  // ── Filtered venues ──────────────────────────────────────────────────────────
  const filtered = useMemo<Venue[]>(() => {
    return allVenues.filter(v => {
      if (category === 'mosque' || category === 'prayer_room') {
        if (v.kind !== 'mosque') return false;
      } else if (category === 'food') {
        if (v.kind !== 'food') return false;
        const cat = v.category?.toLowerCase() ?? '';
        if (cat === 'cafe' || cat === 'grocery') return false;
      } else if (category === 'cafe') {
        if (v.kind !== 'food' || (v.category?.toLowerCase() ?? '') !== 'cafe') return false;
      } else if (category === 'grocery') {
        if (v.kind !== 'food') return false;
        const cat = v.category?.toLowerCase() ?? '';
        if (cat !== 'grocery' && cat !== 'butcher') return false;
      }
      if (openNow && v.kind === 'food' && !isOpenNow(v.opening_hours)) return false;
      return true;
    });
  }, [allVenues, category, openNow]);

  // ── Map region ────────────────────────────────────────────────────────────────
  const mapRegion = useMemo<Region | undefined>(() => {
    if (!coords) return undefined;
    return {
      latitude:       coords.latitude,
      longitude:      coords.longitude,
      latitudeDelta:  (radiusMi * 1.2) / 69,
      longitudeDelta: (radiusMi * 1.2) / 50,
    };
  }, [coords, radiusMi]);

  const recenter = useCallback(() => {
    if (coords && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude:       coords.latitude,
        longitude:      coords.longitude,
        latitudeDelta:  (radiusMi * 1.2) / 69,
        longitudeDelta: (radiusMi * 1.2) / 50,
      }, 500);
    }
  }, [coords, radiusMi]);

  const nextRadius = useCallback(() => {
    const idx = RADIUS_OPTIONS.indexOf(radiusMi);
    setRadiusMi(RADIUS_OPTIONS[(idx + 1) % RADIUS_OPTIONS.length]);
  }, [radiusMi]);

  // ── Stable map callbacks (don't recreate on every render) ───────────────────
  const handleMarkerPress = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);
  const handleMapPress = useCallback(() => setSelectedId(null), []);
  const handleVenuePress = useCallback((v: Venue) => {
    if (v.kind === 'mosque') {
      router.push(`/mosque/${v.osm_id.replace('/', ':')}` as any);
    } else {
      router.push(`/restaurant/${v.id}` as any);
    }
  }, [router]);

  // ── List header — MapSection is memo'd so markers update without map remount ─
  const listHeader = mapRegion ? (
    <MapSection
      mapRegion={mapRegion}
      venues={filtered}
      selectedId={selectedId}
      mapRef={mapRef}
      onMarkerPress={handleMarkerPress}
      onMapPress={handleMapPress}
      onRecenter={recenter}
      onVenuePress={handleVenuePress}
      count={filtered.length}
    />
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: Venue }) => {
    if (item.kind === 'mosque') {
      return (
        <MosqueCard
          item={item}
          onPress={() => router.push(`/mosque/${item.osm_id.replace('/', ':')}` as any)}
        />
      );
    }
    return (
      <FoodCard
        item={item}
        onPress={() => router.push(`/restaurant/${item.id}` as any)}
      />
    );
  }, [router]);

  const keyExtractor = useCallback((item: Venue) =>
    item.kind === 'mosque' ? `mosque-${item.id}` : `food-${item.id}`, []);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>

      {/* ── Header row ──────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.roundBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={s.roundBtn} onPress={recenter} hitSlop={10}>
          <Ionicons name="locate-outline" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
      </View>

      {/* ── Title ───────────────────────────────────────────────── */}
      <View style={s.titleSection}>
        <Text style={s.title}>Nearby You</Text>
        <Text style={s.subtitle}>Discover Muslim-friendly places around you</Text>
      </View>

      {/* ── Category tabs ───────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
        <View style={s.catRow}>
          {CATEGORY_TABS.map(({ key, label, icon, lib }, i) => {
            const active = category === key;
            return (
              <TouchableOpacity
                key={key}
                style={[s.catTab, active && s.catTabActive, i < CATEGORY_TABS.length - 1 && s.catTabGap]}
                onPress={() => setCategory(key)}
                activeOpacity={0.75}
              >
                {lib === 'material' ? (
                  <MaterialCommunityIcons name={icon as any} size={18} color={active ? '#fff' : TEXT_MUTED} />
                ) : (
                  <Ionicons name={icon as any} size={18} color={active ? '#fff' : TEXT_MUTED} />
                )}
                <Text style={[s.catTabText, active && s.catTabTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Filter chips ────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
        <View style={s.filterRow}>
          <TouchableOpacity style={[s.filterChip, s.filterChipRadius, s.chipGap]} onPress={nextRadius}>
            <Ionicons name="location-outline" size={13} color={DEEP_GREEN} />
            <Text style={s.filterChipRadiusText}>Within {radiusMi} mi ↓</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.filterChip, s.chipGap, openNow && s.filterChipActive]}
            onPress={() => setOpenNow(v => !v)}
          >
            <Ionicons name="time-outline" size={13} color={openNow ? '#fff' : TEXT_MUTED} />
            <Text style={[s.filterChipText, openNow && s.filterChipTextActive]}>Open now</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>

      {/* ── Content ─────────────────────────────────────────────── */}
      <FlatList<Venue>
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !coords || loading ? (
            <View>
              {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </View>
          ) : (
            <View style={s.emptyWrap}>
              <Ionicons name="location-outline" size={40} color={TEXT_MUTED} />
              <Text style={s.emptyTitle}>Nothing found nearby</Text>
              <Text style={s.emptyText}>
                {openNow
                  ? `No open places within ${radiusMi} mi — try turning off "Open now"`
                  : `No places within ${radiusMi} mi — try a wider radius`}
              </Text>
            </View>
          )
        }
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        style={s.listFlex}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6,
  },
  roundBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  // Title
  titleSection: { paddingHorizontal: 16, paddingBottom: 14 },
  title:    { fontSize: 28, fontWeight: '800', color: DEEP_GREEN, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: TEXT_MUTED, marginTop: 3 },

  // Category tabs
  catScroll: { flexGrow: 0, flexShrink: 0 },
  catRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  catTabGap: { marginRight: 8 },
  catTab: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  catTabActive:     { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  catTabText:       { fontSize: 13, fontWeight: '600', color: TEXT_MUTED, marginLeft: 6 },
  catTabTextActive: { color: '#fff' },

  // Filter chips
  filterScroll: { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  filterRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  chipGap:      { marginRight: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  filterChipRadius:     { borderColor: DEEP_GREEN },
  filterChipRadiusText: { fontSize: 12, fontWeight: '700', color: DEEP_GREEN, marginLeft: 4 },
  filterChipActive:     { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  filterChipText:       { fontSize: 12, fontWeight: '600', color: TEXT_MUTED, marginLeft: 4 },
  filterChipTextActive: { color: '#fff' },

  // Map
  mapContainer: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 0,
    height: 210, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  map: { flex: 1 },
  recenterBtn: {
    position: 'absolute', bottom: 12, right: 12,
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },

  // Count + sort
  countRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  countText: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  sortText:  { fontSize: 12, color: TEXT_MUTED },
  sortBold:  { color: TEXT_DARK, fontWeight: '700' },

  // Cards
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff', borderRadius: 14,
    marginHorizontal: 16, marginBottom: 10, height: 104,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
    overflow: 'hidden',
  },
  thumbWrap:        { width: 100, height: 104 },
  thumb:            { width: 100, height: 104 },
  thumbPlaceholder: { width: 100, height: 104, alignItems: 'center', justifyContent: 'center' },

  cardBody: { flex: 1, paddingHorizontal: 10, paddingVertical: 10 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  iconCircle: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardName: { fontSize: 14, fontWeight: '700', color: TEXT_DARK, flex: 1 },
  cardAddr: { fontSize: 11, color: TEXT_MUTED, marginBottom: 6, lineHeight: 15 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 5 },
  tag: {
    borderWidth: 1, borderColor: HAIRLINE, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#fff',
  },
  tagText:      { fontSize: 11, fontWeight: '600', color: TEXT_MUTED },
  distPill:     { backgroundColor: GREEN + '1A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  distPillText: { fontSize: 11, fontWeight: '700', color: GREEN },

  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 11, color: TEXT_MUTED },

  // Card actions (right column)
  cardActions: {
    paddingVertical: 10, paddingRight: 12, paddingLeft: 4,
    justifyContent: 'space-between', alignItems: 'center',
  },
  actionBtn: { padding: 4 },

  // Map callout (pin-tap overlay)
  mapCallout: {
    position: 'absolute', bottom: 10, left: 10, right: 56,
    backgroundColor: '#fff', borderRadius: 12, padding: 10,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 8,
  },
  mapCalloutRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapCalloutIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  mapCalloutName: { fontSize: 13, fontWeight: '700', color: TEXT_DARK },
  mapCalloutSub:  { fontSize: 11, color: TEXT_MUTED, marginTop: 1 },

  // States
  listFlex:    { flex: 1 },
  listContent: { paddingBottom: 40 },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  loadingText: { fontSize: 13, color: TEXT_MUTED },
  emptyWrap:   { alignItems: 'center', paddingHorizontal: 32, paddingTop: 48, gap: 8 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: TEXT_MUTED },
  emptyText:   { fontSize: 13, color: TEXT_MUTED, textAlign: 'center' },
});
