import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Brand } from '../lib/theme';

const GREEN = Brand.green;
const AMBER = Brand.amber;
const TEXT_DARK = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const GOLD = Brand.gold;
const RED = Brand.red;

const CERT: Record<string, { label: string; color: string; bg: string }> = {
  ISNA:           { label: 'ISNA Certified',   color: GREEN,      bg: '#e6f9f2' },
  IFANCA:         { label: 'IFANCA Certified', color: GREEN,      bg: '#e6f9f2' },
  HMA:            { label: 'HMA Certified',    color: GREEN,      bg: '#e6f9f2' },
  HFA:            { label: 'HFA Certified',    color: GREEN,      bg: '#e6f9f2' },
  HFSAA:          { label: 'HFSAA Certified',  color: GREEN,      bg: '#e6f9f2' },
  HMS:            { label: 'HMS Certified',    color: GREEN,      bg: '#e6f9f2' },
  MUI:            { label: 'MUI Certified',    color: GREEN,      bg: '#e6f9f2' },
  self_certified: { label: 'Self Certified',   color: AMBER,      bg: '#fefce8' },
  uncertified:    { label: 'Not Certified',    color: TEXT_MUTED, bg: Brand.cream },
  unknown:        { label: 'Cert. Unknown',    color: TEXT_MUTED, bg: Brand.cream },
};

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviewCount: number;
  distance: string;
  isOpen: boolean;
  primaryCertifier: string;
  address: string;
  image_url?: string | null;
  categorized_photos?: Record<string, string[]> | null;
  todayHours?: string | null;
}

interface Props {
  restaurant: Restaurant;
  onPress?: (restaurant: Restaurant) => void;
}

export default function RestaurantCard({ restaurant, onPress }: Props) {
  const stars = Math.min(5, Math.max(0, Math.round(restaurant.rating)));
  const cert = CERT[restaurant.primaryCertifier] ?? CERT.unknown;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(restaurant)}
      activeOpacity={0.85}
    >
      {/* ── image / placeholder ── */}
      {(() => {
        const uri =
          restaurant.image_url ??
          restaurant.categorized_photos?.food?.[0] ??
          restaurant.categorized_photos?.outside?.[0] ??
          restaurant.categorized_photos?.inside?.[0] ??
          null;
        return uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imageEmoji}>🍽️</Text>
          </View>
        );
      })()}

      {/* ── body ── */}
      <View style={styles.body}>
        {/* name + open/closed badge */}
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{restaurant.name}</Text>
          <View style={[styles.statusBadge, restaurant.isOpen ? styles.openBg : styles.closedBg]}>
            <Text style={[styles.statusText, restaurant.isOpen ? styles.openTxt : styles.closedTxt]}>
              {restaurant.isOpen ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>

        {/* cuisine · distance */}
        <View style={styles.metaRow}>
          <Text style={styles.cuisine} numberOfLines={1}>{restaurant.cuisine}</Text>
          {restaurant.distance ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.distance}>{restaurant.distance}</Text>
            </>
          ) : null}
        </View>

        {/* certifier badge */}
        <View style={[styles.certBadge, { backgroundColor: cert.bg }]}>
          <Ionicons
            name={cert.color === GREEN ? 'checkmark-circle' : 'help-circle-outline'}
            size={11}
            color={cert.color}
          />
          <Text style={[styles.certText, { color: cert.color }]}>{cert.label}</Text>
        </View>

        {/* today's hours */}
        {restaurant.todayHours ? (
          <View style={styles.hoursRow}>
            <Ionicons name="time-outline" size={11} color={TEXT_MUTED} />
            <Text style={styles.hoursText} numberOfLines={1}>{restaurant.todayHours}</Text>
          </View>
        ) : null}

        {/* stars */}
        <View style={styles.bottomRow}>
          {restaurant.rating > 0 ? (
            <View style={styles.ratingRow}>
              <Text style={styles.stars}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</Text>
              <Text style={styles.ratingNum}>{restaurant.rating.toFixed(1)}</Text>
              <Text style={styles.reviewCount}>({restaurant.reviewCount})</Text>
            </View>
          ) : (
            <View style={styles.ratingRow}>
              <Ionicons name="star-outline" size={12} color={TEXT_MUTED} />
              <Text style={styles.noRating}>No ratings yet</Text>
            </View>
          )}
        </View>

        <Text style={styles.address} numberOfLines={1}>{restaurant.address}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    overflow: 'hidden',
  },

  image: {
    width: 96,
  },
  imagePlaceholder: {
    width: 96,
    backgroundColor: '#f0faf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageEmoji: { fontSize: 32 },

  body: { flex: 1, padding: 12, gap: 4 },

  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: TEXT_DARK, marginRight: 8 },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  openBg:    { backgroundColor: '#e6f9f2' },
  closedBg:  { backgroundColor: '#fef2f2' },
  statusText: { fontSize: 11, fontWeight: '600' },
  openTxt:   { color: GREEN },
  closedTxt: { color: RED },

  metaRow: { flexDirection: 'row', alignItems: 'center' },
  cuisine:  { fontSize: 12, color: TEXT_MUTED, flex: 1, flexShrink: 1 },
  dot:      { fontSize: 12, color: TEXT_MUTED, marginHorizontal: 4 },
  distance: { fontSize: 12, color: TEXT_MUTED },

  certBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
  },
  certText: { fontSize: 11, fontWeight: '600' },

  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hoursText: { fontSize: 11, color: TEXT_MUTED, flex: 1 },

  bottomRow: { flexDirection: 'row', alignItems: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stars:     { color: GOLD, fontSize: 11, letterSpacing: -0.5 },
  ratingNum: { fontSize: 12, fontWeight: '700', color: TEXT_DARK, marginLeft: 4 },
  reviewCount: { fontSize: 11, color: TEXT_MUTED, marginLeft: 2 },
  noRating:  { fontSize: 11, color: TEXT_MUTED, marginLeft: 4 },

  address: { fontSize: 11, color: TEXT_MUTED },
});
