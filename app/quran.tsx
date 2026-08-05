import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { fetchSurahs, Surah } from '../lib/ummahApi';
import { loadProgress, QuranProgress } from '../lib/quranProgress';
import { Brand } from '../lib/theme';

export default function QuranScreen() {
  const router = useRouter();

  const [surahs, setSurahs]       = useState<Surah[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [query, setQuery]         = useState('');
  const [progress, setProgress]   = useState<QuranProgress | null>(null);

  useEffect(() => {
    fetchSurahs()
      .then(data => { setSurahs(data); setLoading(false); })
      .catch(() => { setError('Could not load surahs. Please try again.'); setLoading(false); });
  }, []);

  // Refresh every time this screen comes into focus so the card reflects
  // a bookmark the user just set (or cleared) in the reader
  useFocusEffect(useCallback(() => {
    loadProgress().then(p => setProgress(p?.ayahNumber ? p : null));
  }, []));

  const filtered = query.trim()
    ? surahs.filter(s =>
        s.englishName.toLowerCase().includes(query.toLowerCase()) ||
        String(s.number).includes(query.trim())
      )
    : surahs;

  const pct = progress
    ? Math.round((progress.ayahNumber / progress.totalAyahs) * 100)
    : 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Brand.deepGreen} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Quran</Text>
        <View style={s.backBtn} />
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={Brand.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search surah…"
          placeholderTextColor={Brand.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={Brand.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {error ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.number)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ListHeaderComponent={
            // Continue Reading card — only shown when there's saved progress
            // and the search bar is empty (not useful during active search)
            progress && !query.trim() ? (
              <TouchableOpacity
                style={s.continueCard}
                onPress={() => router.push(`/quran/${progress.surahNumber}` as any)}
                activeOpacity={0.85}
              >
                {/* Card header */}
                <View style={s.continueCardHeader}>
                  <Ionicons name="book-outline" size={15} color={Brand.deepGreen} />
                  <Text style={s.continueLabel}>Continue Reading</Text>
                </View>

                {/* Body: cover thumbnail + surah info */}
                <View style={s.continueBody}>
                  <View style={s.coverWrap}>
                    <Image
                      source={require('../assets/QuranBook.png')}
                      style={s.coverImg}
                      contentFit="contain"
                    />
                  </View>

                  <View style={s.continueInfo}>
                    <Text style={s.continueSurahName}>{progress.surahName}</Text>
                    <Text style={s.continueAyah}>Ayah {progress.ayahNumber}</Text>

                    {/* Progress bar */}
                    <View style={s.progressTrack}>
                      <View style={[s.progressFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={s.progressPct}>{pct}%</Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={Brand.textMuted} />
                </View>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            loading
              ? <ActivityIndicator size="large" color={Brand.green} style={{ marginTop: 60 }} />
              : <Text style={[s.errorText, { marginTop: 40, textAlign: 'center' }]}>No surahs found.</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.row}
              onPress={() => router.push(`/quran/${item.number}` as any)}
              activeOpacity={0.75}
            >
              <View style={s.numBadge}>
                <Text style={s.numText}>{item.number}</Text>
              </View>
              <View style={s.rowMid}>
                <Text style={s.surahEn}>{item.englishName}</Text>
                <Text style={s.surahSub}>{item.englishNameTranslation}</Text>
              </View>
              <View style={s.rowRight}>
                <Text style={s.surahAr}>{item.name}</Text>
                <Text style={s.surahVerses}>{item.numberOfAyahs} verses</Text>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Brand.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Brand.textDark },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, marginHorizontal: 16, marginBottom: 12,
    paddingHorizontal: 12, paddingVertical: 9, gap: 8,
    borderWidth: 1, borderColor: Brand.hairline,
  },
  searchInput: { flex: 1, fontSize: 14, color: Brand.textDark },

  // ── Continue Reading card ────────────────────────────────────────────────
  continueCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  continueCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14,
  },
  continueLabel: { fontSize: 13, fontWeight: '700', color: Brand.deepGreen },

  continueBody: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  coverWrap: {
    width: 56, height: 72, borderRadius: 8, backgroundColor: Brand.deepGreen,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  coverImg: { width: 74, height: 74 },

  continueInfo:     { flex: 1 },
  continueSurahName:{ fontSize: 15, fontWeight: '700', color: Brand.textDark, marginBottom: 2 },
  continueAyah:     { fontSize: 12, color: Brand.textMuted, marginBottom: 10 },

  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: Brand.hairline, marginBottom: 4, overflow: 'hidden',
  },
  progressFill:  { height: 4, borderRadius: 2, backgroundColor: Brand.deepGreen },
  progressPct:   { fontSize: 11, color: Brand.textMuted, fontWeight: '600' },

  // ── Surah list ───────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12,
  },
  numBadge: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Brand.deepGreen,
    alignItems: 'center', justifyContent: 'center',
  },
  numText:     { fontSize: 13, fontWeight: '700', color: '#fff' },
  rowMid:      { flex: 1 },
  surahEn:     { fontSize: 15, fontWeight: '700', color: Brand.textDark },
  surahSub:    { fontSize: 12, color: Brand.textMuted, marginTop: 1 },
  rowRight:    { alignItems: 'flex-end' },
  surahAr:     { fontSize: 18, color: Brand.textDark },
  surahVerses: { fontSize: 11, color: Brand.textMuted, marginTop: 2 },
  separator:   { height: 1, backgroundColor: Brand.hairline },
  errorText:   { fontSize: 14, color: Brand.red },
});
