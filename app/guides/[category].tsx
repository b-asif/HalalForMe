import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const GOLD       = Brand.gold;

interface Guide {
  id: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  category: string;
  tags: string[];
  is_featured: boolean;
  location: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  all:          'All Guides',
  universities: 'University Guides',
  cities:       'City Guides',
  travel:       'Travel Guides',
  food:         'Food Guides',
  cafes:        'Café Guides',
  ramadan:      'Ramadan Guides',
  family:       'Family Guides',
  reverts:      'Reverts Guides',
  butcher:      'Butcher & Grocery Guides',
};

const CATEGORY_ICON: Record<string, string> = {
  all:          'grid-outline',
  universities: 'school-outline',
  cities:       'business-outline',
  travel:       'airplane-outline',
  food:         'restaurant-outline',
  cafes:        'cafe-outline',
  ramadan:      'moon-outline',
  family:       'people-outline',
  reverts:      'book-outline',
  butcher:      'storefront-outline',
};

const SEARCH_PLACEHOLDER: Record<string, string> = {
  universities: 'Search guides, e.g. SJSU, Berkeley...',
  cities:       'Search city guides...',
  travel:       'Search travel guides...',
  food:         'Search food guides...',
  cafes:        'Search café guides...',
  ramadan:      'Search Ramadan guides...',
  family:       'Search family guides...',
  reverts:      'Search guides...',
  butcher:      'Search butcher & grocery guides...',
  all:          'Search all guides...',
};

export default function GuideCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const router        = useRouter();

  const [guides,      setGuides]      = useState<Guide[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      let query = supabase
        .from('guides')
        .select('id, title, subtitle, cover_image_url, category, tags, is_featured, location')
        .eq('is_published', true)
        .order('position');

      if (category && category !== 'all') {
        query = query.eq('category', category);
      }

      const { data, error: err } = await query;
      if (err) throw new Error(err.message);
      setGuides((data as Guide[]) ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load guides.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const label       = CATEGORY_LABEL[category]       ?? 'Guides';
  const icon        = CATEGORY_ICON[category]        ?? 'book-outline';
  const placeholder = SEARCH_PLACEHOLDER[category]   ?? 'Search guides...';

  const q = searchQuery.trim().toLowerCase();

  const featured = guides.find(g => g.is_featured);
  const popularGuides = q
    ? guides.filter(g =>
        g.title.toLowerCase().includes(q) ||
        g.subtitle?.toLowerCase().includes(q) ||
        g.location?.toLowerCase().includes(q) ||
        g.tags.some(t => t.toLowerCase().includes(q))
      )
    : guides;

  return (
    <SafeAreaView style={s.flex}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerIconWrap}>
            <Ionicons name={icon as any} size={16} color={DEEP_GREEN} />
          </View>
          <Text style={s.headerTitle}>{label}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={48} color="#d0d0d0" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Search bar ── */}
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={16} color={TEXT_MUTED} />
            <TextInput
              style={s.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={placeholder}
              placeholderTextColor="#bbb"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          {/* ── Featured hero card (hidden while searching) ── */}
          {q === '' && featured && (
            <TouchableOpacity
              style={s.featuredCard}
              onPress={() => router.push(`/guide/${featured.id}`)}
              activeOpacity={0.9}
            >
              {featured.cover_image_url ? (
                <Image
                  source={{ uri: featured.cover_image_url }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={300}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, s.featuredFallback]} />
              )}
              <View style={s.featuredOverlay} />
              <View style={s.featuredContent}>
                <View style={s.featuredBadge}>
                  <Text style={s.featuredBadgeText}>FEATURED GUIDE</Text>
                </View>
                <Text style={s.featuredTitle}>{featured.title}</Text>
                {featured.subtitle ? (
                  <Text style={s.featuredSubtitle} numberOfLines={3}>{featured.subtitle}</Text>
                ) : null}
                <View style={s.featuredBtn}>
                  <Text style={s.featuredBtnText}>View Guide</Text>
                  <Ionicons name="chevron-forward" size={14} color={DEEP_GREEN} />
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* ── Guide list ── */}
          {popularGuides.length > 0 ? (
            <>
              <View style={s.popularHeader}>
                <Ionicons name="sparkles" size={16} color={GOLD} />
                <Text style={s.popularTitle}>Popular Guides for You</Text>
              </View>
              {popularGuides.map(g => (
                <GuideRow
                  key={g.id}
                  guide={g}
                  onPress={() => router.push(`/guide/${g.id}`)}
                />
              ))}
            </>
          ) : (
            <View style={s.empty}>
              <Ionicons name="book-outline" size={52} color="#d0d0d0" />
              <Text style={s.emptyTitle}>
                {q ? 'No guides found' : 'No guides yet'}
              </Text>
              <Text style={s.emptySubText}>
                {q ? 'Try a different keyword.' : 'Check back soon.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Guide row ────────────────────────────────────────────────────────────────

function GuideRow({ guide, onPress }: { guide: Guide; onPress: () => void }) {
  return (
    <TouchableOpacity style={gr.card} onPress={onPress} activeOpacity={0.75}>
      {guide.cover_image_url ? (
        <Image
          source={{ uri: guide.cover_image_url }}
          style={gr.thumb}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[gr.thumb, gr.thumbFallback]}>
          <Ionicons name="book-outline" size={26} color={TEXT_MUTED} />
        </View>
      )}
      <View style={gr.body}>
        <Text style={gr.title} numberOfLines={2}>{guide.title}</Text>
        {guide.subtitle ? (
          <Text style={gr.subtitle} numberOfLines={1}>{guide.subtitle}</Text>
        ) : null}
        {guide.location ? (
          <View style={gr.locationRow}>
            <Ionicons name="location-outline" size={11} color="#aaa" />
            <Text style={gr.locationText} numberOfLines={1}>{guide.location}</Text>
          </View>
        ) : null}
        {guide.tags?.length > 0 && (
          <View style={gr.tags}>
            {guide.tags.slice(0, 2).map(tag => (
              <View key={tag} style={gr.tag}>
                <Text style={gr.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={HAIRLINE} style={{ marginRight: 12 }} />
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  headerIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#eef5f0', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: TEXT_DARK },

  scrollContent: { paddingBottom: 40 },

  // Search bar
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 16, marginBottom: 16,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT_DARK },

  // Featured hero card (matches guides tab style)
  featuredCard: {
    marginHorizontal: 16, borderRadius: 20, height: 240,
    overflow: 'hidden', marginBottom: 24,
    backgroundColor: DEEP_GREEN,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  featuredFallback: { backgroundColor: DEEP_GREEN },
  featuredOverlay:  { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,40,25,0.58)' },
  featuredContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, gap: 6,
  },
  featuredBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    marginBottom: 2,
  },
  featuredBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  featuredTitle:    { fontSize: 26, fontWeight: '800', color: '#fff', lineHeight: 30 },
  featuredSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 18 },
  featuredBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: '#fff', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  featuredBtnText: { fontSize: 13, fontWeight: '700', color: DEEP_GREEN },

  // Popular section header
  popularHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, marginBottom: 12,
  },
  popularTitle: { fontSize: 17, fontWeight: '700', color: TEXT_DARK },

  errorText: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn:  { backgroundColor: DEEP_GREEN, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  empty:        { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle:   { fontSize: 17, fontWeight: '700', color: TEXT_MUTED },
  emptySubText: { fontSize: 13, color: TEXT_MUTED },
});

const gr = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 16, marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  thumb:        { width: 100, alignSelf: 'stretch' },
  thumbFallback:{ backgroundColor: '#f0f0ea', alignItems: 'center', justifyContent: 'center', minHeight: 100 },

  body:        { flex: 1, padding: 12, gap: 3, justifyContent: 'center' },
  title:       { fontSize: 15, fontWeight: '700', color: TEXT_DARK, lineHeight: 20 },
  subtitle:    { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  locationText:{ fontSize: 11, color: '#aaa', flex: 1 },

  tags:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tag:     { backgroundColor: '#eef5f0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '600', color: GREEN },
});
