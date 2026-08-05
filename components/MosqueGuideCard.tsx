import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Brand } from '../lib/theme';

const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const TEAL = '#0d9488';
const TEAL_BG = '#e0f7f8';
const ICON_BG  = '#EFF6F1';

export interface MosqueGuideCardData {
  id: string;
  osm_id: string;
  name: string;
  address: string | null;
  iqama_times: Record<string, string> | null;
  jummah_sessions: Array<{ time: string; khateeb: string | null }> | null;
  website: string | null;
}

interface Props {
  mosque: MosqueGuideCardData;
  onPress: () => void;
}

/** Returns the next upcoming prayer label + time, or null. */
function nextPrayer(iqama: Record<string, string>): { label: string; time: string } | null {
  const ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  for (const name of ORDER) {
    const raw = iqama[name] ?? iqama[name.toLowerCase()];
    if (!raw) continue;
    // Parse "4:30 AM" / "1:15 PM" style
    const m = raw.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) continue;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const period = m[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const prayerMins = h * 60 + min;
    if (prayerMins > nowMins) return { label: name, time: raw };
  }
  return null;
}

export default function MosqueGuideCard({ mosque, onPress }: Props) {
  const next = mosque.iqama_times ? nextPrayer(mosque.iqama_times) : null;
  const jummah = mosque.jummah_sessions?.length
    ? mosque.jummah_sessions.map(s => s.time).join(', ')
    : null;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.75}>
      <View style={s.iconWrap}>
        <MaterialCommunityIcons name="mosque" size={22} color={TEAL} />
      </View>

      <View style={s.body}>
        <View style={s.topRow}>
          <Text style={s.name} numberOfLines={1}>{mosque.name}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>Mosque</Text>
          </View>
        </View>

        {mosque.address ? (
          <Text style={s.address} numberOfLines={1}>{mosque.address}</Text>
        ) : null}

        {next ? (
          <View style={s.infoRow}>
            <Ionicons name="time-outline" size={12} color={TEAL} />
            <Text style={s.infoText}>Next: {next.label} · {next.time}</Text>
          </View>
        ) : null}

        {jummah ? (
          <View style={s.infoRow}>
            <Ionicons name="people-outline" size={12} color={TEAL} />
            <Text style={s.infoText}>Jummah: {jummah}</Text>
          </View>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={16} color="#ccc" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
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
  },
  body: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  badge: {
    backgroundColor: TEAL_BG, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: TEAL, letterSpacing: 0.3 },
  address:  { fontSize: 12, color: TEXT_MUTED },
  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: 12, color: TEAL, fontWeight: '500' },
});
