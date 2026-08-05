import { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { fetchDuaCategories, DuaCategory } from '../lib/ummahApi';
import { Brand } from '../lib/theme';

export default function DuasScreen() {
  const router = useRouter();

  const [categories, setCategories] = useState<DuaCategory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDuaCategories()
      .then(data => { setCategories(data); setLoading(false); })
      .catch(() => { setError('Could not load categories. Please try again.'); setLoading(false); });
  }, [refreshKey]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Brand.deepGreen} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Duas</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Brand.green} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => setRefreshKey(k => k + 1)}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.category}
              style={s.card}
              onPress={() => router.push(`/duas/${cat.category}` as any)}
              activeOpacity={0.75}
            >
              <View style={s.iconBadge}>
                <Image source={require('../assets/duas.png')} style={s.iconImg} contentFit="contain" />
              </View>
              <View style={s.cardBody}>
                <Text style={s.cardLabel}>{cat.label}</Text>
                <Text style={s.cardMeta}>{cat.count} duas</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Brand.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Brand.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Brand.textDark },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  iconBadge: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Brand.cream,
    borderWidth: 1, borderColor: Brand.hairline,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  iconImg: { width: 44, height: 44 },
  cardBody:  { flex: 1 },
  cardLabel: { fontSize: 15, fontWeight: '700', color: Brand.textDark },
  cardMeta:  { fontSize: 12, color: Brand.textMuted, marginTop: 2 },

  errorText: { fontSize: 14, color: Brand.red, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn:  { backgroundColor: Brand.deepGreen, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
