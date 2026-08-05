import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { fetchSurah, SurahDetail } from '../../lib/ummahApi';
import { saveProgress, loadProgress, QuranProgress } from '../../lib/quranProgress';
import { Brand } from '../../lib/theme';

export default function SurahScreen() {
  const router = useRouter();
  const { surah: param } = useLocalSearchParams<{ surah: string }>();
  const surahNum = parseInt(param ?? '1', 10);

  const [data, setData]               = useState<SurahDetail | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [bookmark, setBookmark]       = useState<number | null>(null); // saved ayah number for THIS surah
  const [justSaved, setJustSaved]     = useState<number | null>(null); // brief flash feedback

  useEffect(() => {
    setLoading(true);
    setError(null);
    setBookmark(null);

    fetchSurah(surahNum).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => {
      setError('Could not load this surah. Please try again.');
      setLoading(false);
    });

    // Load any existing bookmark for this surah
    loadProgress().then(saved => {
      if (saved?.surahNumber === surahNum) setBookmark(saved.ayahNumber);
    });
  }, [surahNum]);

  const handleBookmark = (ayahNumber: number) => {
    if (!data) return;

    const isSame = bookmark === ayahNumber;

    if (isSame) {
      // Tapping the active bookmark removes it
      setBookmark(null);
      saveProgress({ surahNumber: surahNum, surahName: data.englishName, ayahNumber: 0, totalAyahs: data.numberOfAyahs });
    } else {
      setBookmark(ayahNumber);
      saveProgress({ surahNumber: surahNum, surahName: data.englishName, ayahNumber, totalAyahs: data.numberOfAyahs });
      // Brief "Saved" flash
      setJustSaved(ayahNumber);
      setTimeout(() => setJustSaved(null), 1500);
    }
  };

  const arLH = Platform.select({ android: 42, default: 38 });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Brand.deepGreen} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {data ? data.englishName : `Surah ${surahNum}`}
        </Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Brand.green} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : data ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Surah banner */}
          <View style={s.banner}>
            <Text style={s.bannerAr}>{data.name}</Text>
            <Text style={s.bannerEn}>{data.englishName}</Text>
            <Text style={s.bannerTrans}>{data.englishNameTranslation}</Text>
            <View style={s.bannerMeta}>
              <Text style={s.bannerMetaText}>{data.revelationType}</Text>
              <Text style={s.bannerMetaDot}>·</Text>
              <Text style={s.bannerMetaText}>{data.numberOfAyahs} verses</Text>
            </View>
          </View>

          {/* Ayahs */}
          {data.ayahs.map(ayah => {
            const isBookmarked = bookmark === ayah.number;
            const isSaving     = justSaved === ayah.number;
            return (
              <View key={ayah.number} style={[s.ayahCard, isBookmarked && s.ayahCardBookmarked]}>
                {/* Top row: verse badge + Arabic */}
                <View style={s.ayahTop}>
                  <View style={[s.verseBadge, isBookmarked && s.verseBadgeActive]}>
                    <Text style={[s.verseBadgeText, isBookmarked && s.verseBadgeTextActive]}>
                      {ayah.number}
                    </Text>
                  </View>
                  <Text style={[s.ayahArabic, { lineHeight: arLH }]} numberOfLines={0}>
                    {ayah.text}
                  </Text>
                </View>

                <View style={s.hairline} />

                {ayah.transliteration ? (
                  <Text style={s.ayahTranslit}>{ayah.transliteration}</Text>
                ) : null}
                <Text style={s.ayahTranslation}>{ayah.translations?.en?.text ?? ''}</Text>

                {/* Bookmark button */}
                <TouchableOpacity
                  style={s.bookmarkBtn}
                  onPress={() => handleBookmark(ayah.number)}
                  hitSlop={10}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                    size={18}
                    color={isBookmarked ? Brand.deepGreen : Brand.textMuted}
                  />
                  {isSaving && (
                    <Text style={s.savedLabel}>Saved</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: Brand.textDark, flex: 1, textAlign: 'center' },

  banner: {
    backgroundColor: Brand.deepGreen, borderRadius: 16, margin: 16, padding: 20,
    alignItems: 'center',
  },
  bannerAr:       { fontSize: 28, color: '#fff', lineHeight: 44, marginBottom: 6 },
  bannerEn:       { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  bannerTrans:    { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 10 },
  bannerMeta:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerMetaText: { fontSize: 12, color: Brand.gold },
  bannerMetaDot:  { fontSize: 12, color: 'rgba(255,255,255,0.4)' },

  ayahCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18,
    marginHorizontal: 16, marginTop: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  ayahCardBookmarked: {
    borderWidth: 1.5, borderColor: Brand.deepGreen,
  },

  ayahTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  verseBadge: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: Brand.cream,
    borderWidth: 1, borderColor: Brand.hairline,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  verseBadgeActive:     { backgroundColor: Brand.deepGreen, borderColor: Brand.deepGreen },
  verseBadgeText:       { fontSize: 12, fontWeight: '700', color: Brand.deepGreen },
  verseBadgeTextActive: { color: '#fff' },
  ayahArabic:           { flex: 1, fontSize: 22, color: Brand.textDark, textAlign: 'right' },

  hairline:        { height: 1, backgroundColor: Brand.hairline, marginBottom: 10 },
  ayahTranslit:    { fontSize: 13, fontStyle: 'italic', color: Brand.textMuted, marginBottom: 6 },
  ayahTranslation: { fontSize: 14, color: Brand.textDark, lineHeight: 21, marginBottom: 10 },

  bookmarkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end',
  },
  savedLabel: { fontSize: 11, fontWeight: '600', color: Brand.deepGreen },

  errorText: { fontSize: 14, color: Brand.red, textAlign: 'center', paddingHorizontal: 24 },
});
