import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../lib/theme';
import { useRouter } from 'expo-router';

export interface MapPin {
  id: string;
  name: string;
  cuisine_type: string;
  lat: number | null;
  lng: number | null;
  avg_rating?: number | null;
  primary_certifier: string;
  category?: string;
}

const PIN_META: Record<string, { color: string; icon: string }> = {
  restaurant: { color: '#E8853A', icon: 'restaurant' },
  cafe:       { color: '#6D4C41', icon: 'cafe' },
  grocery:    { color: '#2E7D52', icon: 'cart' },
  butcher:    { color: '#8B2635', icon: 'cut' },
};

function CategoryPin({ category, selected }: { category?: string; selected: boolean }) {
  const meta = PIN_META[category ?? ''] ?? { color: Brand.deepGreen, icon: 'location' };
  const color = selected ? Brand.gold : meta.color;
  const size  = selected ? 42 : 36;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2.5, borderColor: '#fff',
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 }, elevation: 4,
      }}>
        <Ionicons name={meta.icon as any} size={selected ? 21 : 17} color="#fff" />
      </View>
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        borderTopColor: color,
        marginTop: -1,
      }} />
    </View>
  );
}

interface Props {
  pins: MapPin[];
  focusLat?: number | null;
  focusLng?: number | null;
}

const DEFAULT_REGION: Region = {
  latitude: 37.0902,
  longitude: -95.7129,
  latitudeDelta: 50,
  longitudeDelta: 50,
};

export default function RestaurantMapView({ pins, focusLat, focusLng }: Props) {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const withCoords = pins.filter(
    (r): r is MapPin & { lat: number; lng: number } =>
      r.lat != null && r.lng != null,
  );

  const selected = withCoords.find(r => r.id === selectedId) ?? null;

  const initialRegion: Region =
    focusLat != null && focusLng != null
      ? { latitude: focusLat, longitude: focusLng, latitudeDelta: 0.5, longitudeDelta: 0.5 }
      : withCoords.length > 0
        ? { latitude: withCoords[0].lat, longitude: withCoords[0].lng, latitudeDelta: 0.5, longitudeDelta: 0.5 }
        : DEFAULT_REGION;

  // Animate to new focus whenever user searches a location
  useEffect(() => {
    if (focusLat != null && focusLng != null) {
      mapRef.current?.animateToRegion(
        { latitude: focusLat, longitude: focusLng, latitudeDelta: 0.5, longitudeDelta: 0.5 },
        600,
      );
    }
  }, [focusLat, focusLng]);

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelectedId(null)}
      >
        {withCoords.map(r => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.lat, longitude: r.lng }}
            tracksViewChanges={r.id === selectedId}
            onPress={e => {
              e.stopPropagation();
              setSelectedId(r.id === selectedId ? null : r.id);
            }}
          >
            <CategoryPin category={r.category} selected={r.id === selectedId} />
          </Marker>
        ))}
      </MapView>

      {withCoords.length === 0 && (
        <View style={s.emptyOverlay} pointerEvents="none">
          <View style={s.emptyBubble}>
            <Ionicons name="location-outline" size={20} color={Brand.textMuted} />
            <Text style={s.emptyText}>No mapped restaurants</Text>
          </View>
        </View>
      )}

      {selected != null && (
        <TouchableOpacity
          style={s.preview}
          onPress={() => router.push(`/restaurant/${selected.id}`)}
          activeOpacity={0.92}
        >
          <TouchableOpacity
            style={s.previewClose}
            onPress={() => setSelectedId(null)}
            hitSlop={10}
          >
            <Ionicons name="close" size={14} color={Brand.textMuted} />
          </TouchableOpacity>

          <View style={s.previewBody}>
            <Text style={s.previewName} numberOfLines={1}>{selected.name}</Text>
            <Text style={s.previewCuisine} numberOfLines={1}>{selected.cuisine_type}</Text>
            {(selected.avg_rating ?? 0) > 0 && (
              <Text style={s.previewRating}>
                {'★'.repeat(Math.round(selected.avg_rating!))}
                {'☆'.repeat(5 - Math.round(selected.avg_rating!))}
                {'  '}{selected.avg_rating!.toFixed(1)}
              </Text>
            )}
          </View>

          <View style={s.previewCta}>
            <Text style={s.previewCtaText}>View</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map:       { flex: 1 },

  emptyOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  emptyBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  emptyText: { fontSize: 14, color: Brand.textMuted, fontWeight: '500' },

  preview: {
    position: 'absolute', left: 16, right: 16, bottom: 16,
    backgroundColor: Brand.cream,
    borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 10,
    minHeight: 80,
  },
  previewClose: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Brand.hairline,
    alignItems: 'center', justifyContent: 'center',
  },
  previewBody: { flex: 1 },
  previewName: { fontSize: 16, fontWeight: '700', color: Brand.textDark, marginBottom: 2, paddingRight: 24 },
  previewCuisine: { fontSize: 13, color: Brand.textMuted, marginBottom: 4 },
  previewRating: { fontSize: 12, color: Brand.gold, fontWeight: '600', letterSpacing: -0.5 },

  previewCta: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: Brand.deepGreen,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
  },
  previewCtaText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
