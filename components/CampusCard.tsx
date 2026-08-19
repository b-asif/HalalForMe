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

interface CampusCardProps {
  university: University;
  onPress: () => void;
}

export default function CampusCard({ university, onPress }: CampusCardProps) {
  const location   = [university.city, university.state].filter(Boolean).join(', ');
  const imageUrl   = university.msa_logo_url ?? university.logo_url;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.cardImage} contentFit="cover" />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Ionicons name="school" size={28} color={GREEN} />
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.row}>
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>{university.name}</Text>
            {!!location && (
              <Text style={styles.location} numberOfLines={1}>
                <Ionicons name="location-outline" size={12} color={TEXT_MUTED} /> {location}
              </Text>
            )}
          </View>

          {university.is_verified && (
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={16} color={GREEN} />
              <Text style={styles.badgeText}>Verified</Text>
            </View>
          )}

          <Ionicons name="chevron-forward" size={18} color={HAIRLINE} style={styles.chevron} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: Radius.card,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Brand.hairline,
  },
  cardImage: {
    width: '100%',
    height: 130,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: Brand.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...Type.cardTitle,
    color: TEXT_DARK,
  },
  location: {
    ...Type.caption,
    color: TEXT_MUTED,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  badgeText: {
    ...Type.tiny,
    color: DEEP_GREEN,
    fontWeight: '600',
  },
  chevron: {
    marginLeft: Spacing.xs,
  },
});
