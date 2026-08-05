import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../../lib/theme';

const CATEGORY_LABELS: Record<string, string> = {
  prayer:   'Prayer Rooms',
  events:   'Events',
  business: 'Muslim Businesses',
  learning: 'Islamic Learning',
};

const CATEGORY_ICONS: Record<string, string> = {
  prayer:   'body-outline',
  events:   'calendar-outline',
  business: 'bag-handle-outline',
  learning: 'book-outline',
};

export default function CategoryPlaceholder() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const label = CATEGORY_LABELS[category ?? ''] ?? 'Coming Soon';
  const icon  = (CATEGORY_ICONS[category ?? ''] ?? 'grid-outline') as any;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={Brand.deepGreen} />
        </TouchableOpacity>
        <Text style={s.title}>{label}</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={s.centered}>
        <View style={s.iconWrap}>
          <Ionicons name={icon} size={48} color={Brand.deepGreen} />
        </View>
        <Text style={s.heading}>Coming Soon</Text>
        <Text style={s.desc}>
          We're working on bringing you {label.toLowerCase()} near you. Stay tuned!
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Brand.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  title: { fontSize: 16, fontWeight: '700', color: Brand.textDark },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  iconWrap: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: Brand.hairline,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  heading: { fontSize: 22, fontWeight: '800', color: Brand.textDark },
  desc:    { fontSize: 14, color: Brand.textMuted, textAlign: 'center', lineHeight: 22 },
});
