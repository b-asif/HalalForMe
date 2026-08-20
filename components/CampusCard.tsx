import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Brand, Radius, Shadow, Spacing, Type } from '../lib/theme';
import type { University } from '../lib/campus';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const CREAM      = Brand.cream;

interface CampusCardProps {
  university: University;
  onPress: () => void;
}

export default function CampusCard({ university, onPress }: CampusCardProps) {
  const location = [university.city, university.state].filter(Boolean).join(', ');
  const imageUrl = university.msa_logo_url ?? university.logo_url;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {/* Square thumbnail */}
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name="school" size={26} color={GREEN} />
        </View>
      )}

      {/* Info */}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{university.name}</Text>
        {!!location && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color={TEXT_MUTED} />
            <Text style={styles.locationText} numberOfLines={1}>{location}</Text>
          </View>
        )}
        {university.is_verified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={13} color={GREEN} />
            <Text style={styles.verifiedText}>Verified MSA</Text>
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color={HAIRLINE} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: Radius.card,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.sm + 2,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: HAIRLINE,
    ...Shadow.light,
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: CREAM,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: DEEP_GREEN,
    lineHeight: 21,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    ...Type.caption,
    color: TEXT_MUTED,
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  verifiedText: {
    ...Type.tiny,
    color: GREEN,
    fontWeight: '700',
  },
});
