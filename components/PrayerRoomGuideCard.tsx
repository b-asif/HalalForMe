import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Brand } from '../lib/theme';

const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const GREEN      = Brand.green;

const PURPLE    = '#6d28d9';
const PURPLE_BG = '#ede9fe';
const ICON_BG   = '#EFF6F1';

export interface PrayerRoomGuideCardData {
  id: string;
  building_name: string;
  room_number: string | null;
  wudu_available: boolean;
  hours: string | null;
  lat: number | null;
  lng: number | null;
}

interface Props {
  room: PrayerRoomGuideCardData;
  onPress?: () => void;
}

export default function PrayerRoomGuideCard({ room, onPress }: Props) {
  const openMaps = () => {
    if (room.lat == null || room.lng == null) return;
    Linking.openURL(`https://maps.apple.com/?q=${room.lat},${room.lng}`);
  };

  const handlePress = () => {
    if (onPress) { onPress(); return; }
    openMaps();
  };

  const locationLabel = room.room_number
    ? `${room.building_name}, Room ${room.room_number}`
    : room.building_name;

  return (
    <TouchableOpacity style={s.card} onPress={handlePress} activeOpacity={0.75}>
      <View style={s.iconWrap}>
        <MaterialCommunityIcons name="hands-pray" size={22} color={GREEN} />
      </View>

      <View style={s.body}>
        <View style={s.topRow}>
          <Text style={s.name} numberOfLines={1}>{locationLabel}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>Prayer Room</Text>
          </View>
        </View>

        <View style={s.infoRow}>
          <MaterialCommunityIcons
            name="water-outline"
            size={12}
            color={room.wudu_available ? GREEN : TEXT_MUTED}
          />
          <Text style={[s.infoText, { color: room.wudu_available ? GREEN : TEXT_MUTED }]}>
            Wudu: {room.wudu_available ? 'Available' : 'Not available'}
          </Text>
        </View>

        {room.hours ? (
          <View style={s.infoRow}>
            <Ionicons name="time-outline" size={12} color={TEXT_MUTED} />
            <Text style={[s.infoText, { color: TEXT_MUTED }]}>{room.hours}</Text>
          </View>
        ) : null}

        {room.lat != null && room.lng != null ? (
          <TouchableOpacity style={s.mapsRow} onPress={openMaps} activeOpacity={0.7}>
            <Ionicons name="location-outline" size={12} color={PURPLE} />
            <Text style={s.mapsText}>Open in Maps</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 16, marginBottom: 10,
    padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    borderWidth: 1, borderColor: HAIRLINE,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: ICON_BG,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  body: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  badge: {
    backgroundColor: PURPLE_BG, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: PURPLE, letterSpacing: 0.3 },
  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: 12, fontWeight: '500' },
  mapsRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  mapsText: { fontSize: 12, fontWeight: '600', color: PURPLE },
});
