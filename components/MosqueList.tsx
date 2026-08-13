import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Linking, Platform, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Mosque } from '../lib/mosques/overpass';
import { fetchNearestMosquesIncludingManual, searchMosques } from '../lib/mosques/manual';
import { ResolvedCoordinates } from '../lib/prayer/coordinates';
import { formatError } from '../lib/errors';
import { Brand } from '../lib/theme';

const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;

interface Props {
  coords: ResolvedCoordinates | null;
  locationError: string | null;
  /** When set, shows name-search results instead of nearby mosques. */
  searchQuery?: string;
  /** Radius in miles for nearby fetch (default 10). Ignored during name search. */
  radiusMi?: number;
  /** When provided, skips internal fetching and renders this list directly. */
  data?: Mosque[];
  /** Loading state passed from parent (used alongside `data`). */
  dataLoading?: boolean;
  /** Error message passed from parent (used alongside `data`). */
  dataError?: string | null;
  /** Override the empty-state message. */
  emptyMessage?: string;
}

function openMosqueDirections(mosque: Mosque) {
  const q = encodeURIComponent(mosque.address ?? mosque.name);
  const url = Platform.OS === 'ios' ? `maps://0,0?q=${q}` : `geo:0,0?q=${q}`;
  Linking.canOpenURL(url).then(ok =>
    Linking.openURL(ok ? url : `https://maps.google.com/?q=${q}`)
  );
}

export default function MosqueList({
  coords, locationError, searchQuery, radiusMi = 10,
  data: externalData, dataLoading, dataError, emptyMessage,
}: Props) {
  const router = useRouter();
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = searchQuery?.trim() ?? '';
  const usingExternalData = externalData !== undefined;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    // When a parent provides data directly, skip internal fetching.
    if (usingExternalData) return;
    if (!coords) return;

    cancelledRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      const request = trimmedQuery
        ? searchMosques(trimmedQuery, coords.latitude, coords.longitude)
        : fetchNearestMosquesIncludingManual(coords.latitude, coords.longitude, radiusMi * 1609, 20);
      request
        .then(result => { if (!cancelledRef.current) setMosques(result); })
        .catch(err => { if (!cancelledRef.current) setError(formatError(err)); })
        .finally(() => { if (!cancelledRef.current) setLoading(false); });
    }, trimmedQuery ? 250 : 0);

    return () => {
      cancelledRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [coords, trimmedQuery, radiusMi, usingExternalData]);

  const displayData   = usingExternalData ? externalData! : mosques;
  const displayLoad   = usingExternalData ? (dataLoading ?? false) : (!coords || loading);
  const displayError  = usingExternalData ? (dataError ?? null) : error;

  if (locationError) return (
    <View style={s.centered}>
      <Ionicons name="location-outline" size={36} color={TEXT_MUTED} />
      <Text style={s.errorText}>{locationError}</Text>
    </View>
  );

  if (displayLoad) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color={GREEN} />
    </View>
  );

  if (displayError) return (
    <View style={s.centered}>
      <Ionicons name="alert-circle-outline" size={36} color={TEXT_MUTED} />
      <Text style={s.errorText}>{displayError}</Text>
    </View>
  );

  if (displayData.length === 0) return (
    <View style={s.centered}>
      <Ionicons name="business-outline" size={48} color={TEXT_MUTED} />
      <Text style={s.emptyTitle}>
        {emptyMessage ?? (trimmedQuery
          ? `No mosques found matching "${trimmedQuery}"`
          : `No mosques found within ${radiusMi} mi`)}
      </Text>
    </View>
  );

  return (
    <FlatList
      data={displayData}
      keyExtractor={(item, index) => `${index}-${item.id}`}
      contentContainerStyle={s.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={s.resultHeader}>
          <Text style={s.resultCount}>{displayData.length} mosque{displayData.length !== 1 ? 's' : ''} found</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={s.row}
          onPress={() => router.push({
            pathname: '/mosque/[id]',
            params: {
              id: encodeURIComponent(item.id),
              name: item.name,
              address: item.address ?? '',
              lat: String(item.lat),
              lng: String(item.lng),
            },
          })}
          activeOpacity={0.85}
        >
          <View style={s.rowIconWrap}>
            <MaterialCommunityIcons name="mosque" size={22} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
            {item.address ? <Text style={s.rowAddress} numberOfLines={1}>{item.address}</Text> : null}
          </View>
          <View style={s.distanceBadge}>
            <Text style={s.distanceText}>{item.distanceMi.toFixed(1)} mi</Text>
          </View>
          <TouchableOpacity
            style={s.directionsBtn}
            onPress={() => openMosqueDirections(item)}
            hitSlop={8}
          >
            <Ionicons name="navigate-outline" size={16} color={GREEN} />
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    />
  );
}

const s = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  errorText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: TEXT_DARK, textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4 },
  resultHeader: { marginBottom: 12 },
  resultCount: { fontSize: 12, fontWeight: '600', color: TEXT_MUTED, letterSpacing: 0.3 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  rowIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center',
  },
  rowName: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  rowAddress: { fontSize: 12, color: TEXT_MUTED, marginTop: 3 },
  distanceBadge: {
    backgroundColor: '#EFF6F1', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  distanceText: { fontSize: 12, fontWeight: '700', color: GREEN },
  directionsBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
});
