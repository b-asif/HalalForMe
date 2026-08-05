import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { fetchDuasByCategory, Dua } from '../../lib/ummahApi';
import { Brand } from '../../lib/theme';

export default function DuaCategoryScreen() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();

  const [duas, setDuas]       = useState<Dua[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!category) return;
    setLoading(true);
    setError(null);
    fetchDuasByCategory(category)
      .then(data => { setDuas(data); setLoading(false); })
      .catch(() => { setError('Could not load duas. Please try again.'); setLoading(false); });
  }, [category, refreshKey]);

  // Capitalise the raw category slug for the header
  const title = category
    ? category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Duas';

  // Arabic line height: extra room on Android so diacritics don't clip
  const arLH = Platform.select({ android: 44, default: 40 });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Brand.deepGreen} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
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
      ) : duas.length === 0 ? (
        <View style={s.center}>
          <Text style={s.errorText}>No duas found in this category.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {duas.map(dua => (
            <View key={dua.id} style={s.card}>
              {/* Arabic */}
              <Text style={[s.duaArabic, { lineHeight: arLH }]} numberOfLines={0}>
                {dua.arabic}
              </Text>

              <View style={s.hairline} />

              {/* Transliteration */}
              {dua.transliteration ? (
                <Text style={s.duaTranslit}>{dua.transliteration}</Text>
              ) : null}

              {/* Translation */}
              <Text style={s.duaTranslation}>{dua.translation}</Text>

              {/* Reference */}
              {dua.reference ? (
                <Text style={s.duaRef}>{dua.reference}</Text>
              ) : null}
            </View>
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: Brand.textDark, flex: 1, textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    marginHorizontal: 16, marginTop: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  duaArabic:     { fontSize: 24, color: Brand.textDark, textAlign: 'right', marginBottom: 12 },
  hairline:      { height: 1, backgroundColor: Brand.hairline, marginBottom: 10 },
  duaTranslit:   { fontSize: 13, fontStyle: 'italic', color: Brand.textMuted, marginBottom: 8 },
  duaTranslation:{ fontSize: 14, color: Brand.textDark, lineHeight: 20, marginBottom: 6 },
  duaRef:        { fontSize: 11, color: Brand.gold, fontStyle: 'italic' },

  errorText: { fontSize: 14, color: Brand.red, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn:  { backgroundColor: Brand.deepGreen, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
