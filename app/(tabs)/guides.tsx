import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

interface Guide {
  id: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  category: string;
  tags: string[];
  is_featured: boolean;
  position: number;
  location: string | null;
  created_at: string;
}

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'universities', label: 'Universities',      icon: 'school-outline'      },
  { key: 'cities',       label: 'Cities',            icon: 'business-outline'    },
  { key: 'travel',       label: 'Travel',            icon: 'airplane-outline'    },
  { key: 'food',         label: 'Food',              icon: 'restaurant-outline'  },
  { key: 'cafes',        label: 'Cafés',             icon: 'cafe-outline'        },
  { key: 'butcher',      label: 'Butcher & Grocery', icon: 'storefront-outline'  },
  { key: 'ramadan',      label: 'Ramadan',           icon: 'moon-outline'        },
  { key: 'family',       label: 'Family',            icon: 'people-outline'      },
  { key: 'reverts',      label: 'Reverts',           icon: 'book-outline'        },
];

const CATEGORY_TYPE_LABEL: Record<string, string> = {
  universities: 'Student Guide',
  cities:       'City Guide',
  travel:       'Travel Guide',
  food:         'Food Guide',
  cafes:        'Café Guide',
  butcher:      'Butcher & Grocery Guide',
  ramadan:      'Ramadan Guide',
  family:       'Family Guide',
  reverts:      'Reverts Guide',
};

export default function GuidesScreen() {
  const router = useRouter();
  const [guides, setGuides]           = useState<Guide[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('guides')
      .select('id, title, subtitle, cover_image_url, category, tags, is_featured, position, location, created_at')
      .eq('is_published', true)
      .order('position');
    setGuides((data as Guide[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const q = searchQuery.trim().toLowerCase();

  const filteredGuides = q
    ? guides.filter(g =>
        g.title.toLowerCase().includes(q) ||
        g.subtitle?.toLowerCase().includes(q) ||
        g.location?.toLowerCase().includes(q) ||
        g.tags.some(t => t.toLowerCase().includes(q))
      )
    : [];

  // Ordered by position for the popular carousel
  const popularGuides = guides;

  // Most recently created, up to 10
  const recentGuides = [...guides]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  // Only surface category tiles that have at least one guide
  const countByCategory = guides.reduce<Record<string, number>>((acc, g) => {
    acc[g.category] = (acc[g.category] ?? 0) + 1;
    return acc;
  }, {});
  const visibleCategories = CATEGORIES.filter(c => (countByCategory[c.key] ?? 0) > 0);

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.loadingHeader}>
          <Text style={s.headingTitle}>Guides</Text>
        </View>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
        contentContainerStyle={s.content}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerText}>
            <Text style={s.headingTitle}>Guides</Text>
            <Text style={s.headingSub}>
              Curated guides to help you{'\n'}explore and stay connected.
            </Text>
          </View>
          {/* Decorative illustration — replace View contents with an <Image> asset when available */}
          <View style={s.headerIllustration} pointerEvents="none">
            <Ionicons name="moon" size={24} color={DEEP_GREEN} style={s.illustrationMoon} />
            <Ionicons name="business" size={64} color={DEEP_GREEN} style={s.illustrationBuilding} />
          </View>
          <TouchableOpacity
            style={s.bookmarkBtn}
            onPress={() => router.push('/saved-guides')}
            activeOpacity={0.75}
          >
            <Ionicons name="bookmark-outline" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
        </View>

        {/* ── Search bar ── */}
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={TEXT_MUTED} />
          <TextInput
            style={s.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search guides (e.g. UC Davis, Tokyo, Ramadan)"
            placeholderTextColor="#bbb"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* ── Search results ── */}
        {q !== '' ? (
          filteredGuides.length > 0 ? (
            <View style={s.section}>
              <Text style={s.searchResultsLabel}>
                {filteredGuides.length} {filteredGuides.length === 1 ? 'guide' : 'guides'} found
              </Text>
              {filteredGuides.map(g => (
                <GuideRow key={g.id} guide={g} onPress={() => router.push(`/guide/${g.id}`)} />
              ))}
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="search-outline" size={48} color="#d0d0d0" />
              <Text style={s.emptyText}>No guides found</Text>
              <Text style={s.emptySubText}>Try a different keyword or city.</Text>
            </View>
          )
        ) : null}

        {/* ── Popular Guides (hidden while searching) ── */}
        {q === '' && popularGuides.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Popular Guides</Text>
              <TouchableOpacity onPress={() => router.push('/guides/all')}>
                <Text style={s.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.popularRow}
            >
              {popularGuides.map(g => (
                <PopularCard
                  key={g.id}
                  guide={g}
                  onPress={() => router.push(`/guide/${g.id}`)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Browse by Category (hidden while searching) ── */}
        {q === '' && visibleCategories.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Browse by Category</Text>
            </View>
            <View style={s.categoryGrid}>
              {visibleCategories.map(cat => (
                <CategoryTile
                  key={cat.key}
                  icon={cat.icon}
                  label={cat.label}
                  onPress={() => router.push(`/guides/${cat.key}`)}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Recently Added (hidden while searching) ── */}
        {q === '' && recentGuides.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Recently Added</Text>
              <TouchableOpacity onPress={() => router.push('/guides/all')}>
                <Text style={s.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {recentGuides.map(g => (
              <GuideRow key={g.id} guide={g} onPress={() => router.push(`/guide/${g.id}`)} />
            ))}
          </View>
        )}

        {q === '' && guides.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="book-outline" size={52} color="#d0d0d0" />
            <Text style={s.emptyText}>No guides yet</Text>
            <Text style={s.emptySubText}>Check back soon for curated content.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Popular card (horizontal image-forward carousel) ─────────────────────────

function PopularCard({ guide, onPress }: { guide: Guide; onPress: () => void }) {
  const typeLabel = CATEGORY_TYPE_LABEL[guide.category] ?? 'Guide';
  return (
    <TouchableOpacity style={pc.card} onPress={onPress} activeOpacity={0.85}>
      {guide.cover_image_url ? (
        <Image
          source={{ uri: guide.cover_image_url }}
          style={pc.image}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[pc.image, pc.imageFallback]}>
          <Ionicons name="book-outline" size={32} color="#ccc" />
        </View>
      )}
      {guide.is_featured && (
        <View style={pc.featuredBadge}>
          <Text style={pc.featuredBadgeText}>Featured</Text>
        </View>
      )}
      <View style={pc.body}>
        <Text style={pc.typeLabel}>{typeLabel}</Text>
        <Text style={pc.title} numberOfLines={2}>{guide.title}</Text>
        {guide.location ? (
          <View style={pc.locationRow}>
            <Ionicons name="location-outline" size={11} color={TEXT_MUTED} />
            <Text style={pc.locationText} numberOfLines={1}>{guide.location}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Category tile (3-column grid) ───────────────────────────────────────────

function CategoryTile({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={ct.tile} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={icon as any} size={18} color={DEEP_GREEN} />
      <Text style={ct.label} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Guide row (vertical list) ────────────────────────────────────────────────

function GuideRow({ guide, onPress }: { guide: Guide; onPress: () => void }) {
  return (
    <TouchableOpacity style={gr.card} onPress={onPress} activeOpacity={0.75}>
      {guide.cover_image_url ? (
        <Image
          source={{ uri: guide.cover_image_url }}
          style={gr.thumbnail}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[gr.thumbnail, gr.thumbPlaceholder]}>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 40 },

  loadingHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    overflow: 'hidden',
  },
  headerText: { flex: 1, paddingRight: 8 },
  headingTitle: { fontSize: 36, fontWeight: '800', color: DEEP_GREEN, letterSpacing: -0.5 },
  headingSub:   { fontSize: 14, color: TEXT_MUTED, marginTop: 4, lineHeight: 20 },

  // Decorative illustration (top-right corner)
  headerIllustration: {
    position: 'absolute', right: 60, top: 8,
    alignItems: 'center', justifyContent: 'flex-end',
  },
  illustrationMoon:     { opacity: 0.13, marginBottom: -6 },
  illustrationBuilding: { opacity: 0.08 },

  bookmarkBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: HAIRLINE,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 20,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT_DARK },
  searchResultsLabel: {
    fontSize: 12, fontWeight: '700', color: TEXT_MUTED,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 20, marginBottom: 8,
  },

  // Sections
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: TEXT_DARK },
  seeAll:       { fontSize: 14, fontWeight: '600', color: GREEN },

  popularRow: { paddingHorizontal: 16, gap: 12 },

  // Category grid (3 columns)
  categoryGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, gap: 10,
  },

  // Empty
  empty:        { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText:    { fontSize: 17, fontWeight: '700', color: TEXT_MUTED },
  emptySubText: { fontSize: 14, color: TEXT_MUTED },
});

const pc = StyleSheet.create({
  card: {
    width: 160, backgroundColor: '#fff', borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  image: { width: 160, height: 120 },
  imageFallback: { backgroundColor: '#f0f0ea', alignItems: 'center', justifyContent: 'center' },
  featuredBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: DEEP_GREEN, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  featuredBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  body: { padding: 10, gap: 3 },
  typeLabel:    { fontSize: 11, color: TEXT_MUTED, fontWeight: '500' },
  title:        { fontSize: 14, fontWeight: '700', color: TEXT_DARK, lineHeight: 18 },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  locationText: { fontSize: 11, color: TEXT_MUTED, flex: 1 },
});

const ct = StyleSheet.create({
  tile: {
    // 3 columns: (screenWidth - 32px padding - 2*10px gap) / 3 ≈ flexible
    flexBasis: '30%', flexGrow: 1,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: HAIRLINE,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  label: { fontSize: 13, fontWeight: '600', color: TEXT_DARK, flex: 1 },
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
  thumbnail:    { width: 100, alignSelf: 'stretch' },
  thumbPlaceholder: { backgroundColor: '#f0f0ea', alignItems: 'center', justifyContent: 'center', minHeight: 100 },
  body:         { flex: 1, padding: 12, gap: 3, justifyContent: 'center' },
  title:        { fontSize: 15, fontWeight: '700', color: TEXT_DARK, lineHeight: 20 },
  subtitle:     { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  locationText: { fontSize: 11, color: '#aaa', flex: 1 },
  tags:         { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tag:          { backgroundColor: '#eef5f0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  tagText:      { fontSize: 11, fontWeight: '600', color: GREEN },
});
