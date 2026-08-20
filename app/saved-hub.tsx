import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const CATEGORIES = [
  {
    icon: 'heart-outline' as const,
    label: 'Restaurants',
    sub: 'Your saved halal spots',
    route: '/saved' as const,
  },
  {
    icon: 'bookmark-outline' as const,
    label: 'Guides',
    sub: 'Saved halal guides',
    route: '/saved-guides' as const,
  },
];

export default function SavedHubScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Saved</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        <View style={s.card}>
          {CATEGORIES.map((cat, idx) => (
            <TouchableOpacity
              key={cat.label}
              style={[s.row, idx < CATEGORIES.length - 1 && s.rowBorder]}
              onPress={() => router.push(cat.route)}
              activeOpacity={0.7}
            >
              <View style={s.iconWrap}>
                <Ionicons name={cat.icon} size={19} color={GREEN} />
              </View>
              <View style={s.rowText}>
                <Text style={s.rowLabel}>{cat.label}</Text>
                <Text style={s.rowSub}>{cat.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: HAIRLINE,
  },
  title: { fontSize: 20, fontWeight: '800', color: TEXT_DARK },
  scroll: { paddingTop: 20, paddingHorizontal: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  iconWrap: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
    marginRight: 13,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: TEXT_DARK },
  rowSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
});
