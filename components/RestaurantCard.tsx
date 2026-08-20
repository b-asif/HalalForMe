import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Brand } from '../lib/theme';
import { isHFSAACertified } from '../lib/certifiers';

const GREEN = Brand.green;
const AMBER = Brand.amber;
const TEXT_DARK = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const RED = Brand.red;

// Named certifiers shown inline in the cuisine row
const INLINE_CERT: Record<string, { label: string; color: string }> = {
  ISNA:           { label: 'ISNA Certified',   color: GREEN },
  IFANCA:         { label: 'IFANCA Certified', color: GREEN },
  HMA:            { label: 'HMA Certified',    color: GREEN },
  HFA:            { label: 'HFA Certified',    color: GREEN },
  HFSAA:          { label: 'HFSAA Certified',  color: GREEN },
  HMS:            { label: 'HMS Certified',    color: GREEN },
  MUI:            { label: 'MUI Certified',    color: GREEN },
  self_certified: { label: 'Self Certified',   color: AMBER },
  muslim_owned:   { label: 'Muslim-owned',     color: GREEN },
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
  zabihah_status?: 'full' | 'partial' | null;
  has_prayer_room?: boolean | null;
  category?: 'restaurant' | 'grocery' | 'butcher' | 'cafe';
}

// Placeholder emoji when a listing has no photo — fixed per category rather
// than keyword-matched against `cuisine`, since that field is repurposed as
// freeform "specialty" text for grocery/butcher and wouldn't reliably match.
const PLACEHOLDER_EMOJI: Record<'restaurant' | 'grocery' | 'butcher' | 'cafe', string> = {
  restaurant: '🍽️',
  grocery:    '🛒',
  butcher:    '🥩',
  cafe:       '☕',
};

interface TravelTimes {
  walk: string;
  bike: string;
  drive: string;
}

interface Props {
  restaurant: Restaurant;
  onPress?: (restaurant: Restaurant) => void;
  onSave?: () => void;
  isSaved?: boolean;
  travel?: TravelTimes | null;
}

export default function RestaurantCard({ restaurant, onPress, onSave, isSaved, travel }: Props) {
  const inlineCert = INLINE_CERT[restaurant.primaryCertifier];
  const showUnverifiedBadge =
    restaurant.primaryCertifier === 'unknown' || restaurant.primaryCertifier === 'uncertified';

  const uri =
    restaurant.image_url ??
    restaurant.categorized_photos?.food?.[0] ??
    restaurant.categorized_photos?.outside?.[0] ??
    restaurant.categorized_photos?.inside?.[0] ??
    null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(restaurant)}
      activeOpacity={0.85}
    >
      {/* ── image + body row ── */}
      <View style={styles.mainRow}>
        {/* ── image / placeholder ── */}
        <View style={styles.imageWrap}>
          {uri ? (
            <Image
              source={{ uri }}
              style={styles.image}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imageEmoji}>{PLACEHOLDER_EMOJI[restaurant.category ?? 'restaurant']}</Text>
            </View>
          )}
          {onSave ? (
            <TouchableOpacity
              style={styles.heartBtn}
              onPress={onSave}
              hitSlop={8}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isSaved ? 'heart' : 'heart-outline'}
                size={15}
                color={isSaved ? RED : TEXT_DARK}
              />
            </TouchableOpacity>
          ) : null}
        </View>

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
        <Text style={styles.metaCombined} numberOfLines={1}>
          <Text style={styles.cuisine}>{restaurant.cuisine}</Text>
          {restaurant.distance ? (
            <Text style={styles.cuisine}>{restaurant.cuisine ? ' · ' : ''}{restaurant.distance}</Text>
          ) : null}
        </Text>

        {/* certification badge */}
        {inlineCert && (
          <View style={[
            styles.certBadge,
            { backgroundColor: restaurant.primaryCertifier === 'self_certified' ? '#FEF9EE' : '#EFF6F1' }
          ]}>
            <Ionicons
              name={
                restaurant.primaryCertifier === 'self_certified' ? 'ribbon-outline' :
                restaurant.primaryCertifier === 'muslim_owned'   ? 'person-outline' :
                'checkmark-circle'
              }
              size={11}
              color={inlineCert.color}
            />
            <Text style={[styles.certText, { color: inlineCert.color }]}>{inlineCert.label}</Text>
          </View>
        )}

        {/* "Halal status unverified" badge — only for unknown/uncertified */}
        {showUnverifiedBadge && (
          <View style={styles.unverifiedBadge}>
            <Ionicons name="help-circle-outline" size={11} color={TEXT_MUTED} />
            <Text style={styles.unverifiedText}>
              {restaurant.primaryCertifier === 'uncertified' ? 'Not Certified' : 'Halal status unverified'}
            </Text>
          </View>
        )}

        {/* zabihah badge */}
        {(restaurant.zabihah_status === 'full' || isHFSAACertified(restaurant.primaryCertifier)) && (
          <View style={[styles.certBadge, { backgroundColor: Brand.zabihahBg }]}>
            <Ionicons name="checkmark-circle" size={11} color={Brand.zabihah} />
            <Text style={[styles.certText, { color: Brand.zabihah }]}>Zabihah</Text>
          </View>
        )}
        {restaurant.zabihah_status === 'partial' && !isHFSAACertified(restaurant.primaryCertifier) && (
          <View style={[styles.certBadge, { backgroundColor: Brand.zabihahPartialBg }]}>
            <Ionicons name="checkmark-circle" size={11} color={Brand.zabihahPartial} />
            <Text style={[styles.certText, { color: Brand.zabihahPartial }]}>Partial Zabihah</Text>
          </View>
        )}
        {restaurant.has_prayer_room && (
          <View style={[styles.certBadge, { backgroundColor: '#EFF6F1' }]}>
            <Image source={require('../explore/prayerroom.png')} style={{ width: 14, height: 14, tintColor: GREEN }} contentFit="contain" />
            <Text style={[styles.certText, { color: GREEN }]}>Prayer Room</Text>
          </View>
        )}

        {/* today's hours */}
        {restaurant.todayHours ? (
          <View style={styles.hoursRow}>
            <Ionicons name="time-outline" size={11} color={TEXT_MUTED} />
            <Text style={styles.hoursText} numberOfLines={1}>{restaurant.todayHours}</Text>
          </View>
        ) : null}

        {/* address with location pin */}
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={11} color={TEXT_MUTED} />
          <Text style={styles.address} numberOfLines={1}>{restaurant.address}</Text>
        </View>
        </View>{/* end body */}
      </View>{/* end mainRow */}

      {/* ── travel times (inside card, full-width bottom row) ── */}
      {travel ? (
        <View style={styles.travelWrap}>
          <View style={styles.travelRow}>
            <View style={styles.travelItem}>
              <Ionicons name="walk-outline" size={14} color={TEXT_MUTED} />
              <Text style={styles.travelText}>{travel.walk}</Text>
            </View>
            <View style={styles.travelDivider} />
            <View style={styles.travelItem}>
              <Ionicons name="bicycle-outline" size={14} color={TEXT_MUTED} />
              <Text style={styles.travelText}>{travel.bike}</Text>
            </View>
            <View style={styles.travelDivider} />
            <View style={styles.travelItem}>
              <Ionicons name="car-outline" size={14} color={TEXT_MUTED} />
              <Text style={styles.travelText}>{travel.drive}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'column',
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

  mainRow: { flexDirection: 'row' },

  imageWrap: { width: 96, alignSelf: 'stretch', minHeight: 120, overflow: 'hidden' },
  image: { ...StyleSheet.absoluteFill },
  imagePlaceholder: {
    width: 96,
    backgroundColor: '#f0faf6',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  imageEmoji: { fontSize: 32 },
  heartBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },

  body: { flex: 1, padding: 12, gap: 4 },

  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: TEXT_DARK, marginRight: 8 },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  openBg:    { backgroundColor: '#e6f9f2' },
  closedBg:  { backgroundColor: '#fef2f2' },
  statusText: { fontSize: 11, fontWeight: '600' },
  openTxt:   { color: GREEN },
  closedTxt: { color: RED },

  metaCombined: { fontSize: 12, color: TEXT_MUTED },
  cuisine:      { fontSize: 12, color: TEXT_MUTED },
  dot:          { fontSize: 12, color: TEXT_MUTED, marginHorizontal: 4 },
  distance:     { fontSize: 12, color: TEXT_MUTED },

  unverifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 20, backgroundColor: Brand.cream,
  },
  unverifiedText: { fontSize: 11, fontWeight: '600', color: TEXT_MUTED },

  certBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
  },
  certText: { fontSize: 11, fontWeight: '600' },

  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hoursText: { fontSize: 11, color: TEXT_MUTED, flex: 1 },

  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  address: { fontSize: 11, color: TEXT_MUTED, flex: 1 },

  travelWrap: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0ea',
  },
  travelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  travelItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  travelDivider: { width: 1, height: 14, backgroundColor: '#e8e8e0' },
  travelText: { fontSize: 12, fontWeight: '500', color: TEXT_MUTED },
});
