import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '../../lib/supabase';
import { Brand } from '../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const CREAM      = Brand.cream;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

interface GuideRow {
  id: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  category: string;
  tags: string[];
  is_featured: boolean;
  is_published: boolean;
  position: number;
  item_count: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  campus: 'Campus',
  cafe:   'Café',
  food:   'Food',
};

export default function AdminGuidesScreen() {
  const router = useRouter();
  const [guides,     setGuides]     = useState<GuideRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Fetch guides + item counts via a subquery select
    const { data } = await supabase
      .from('guides')
      .select('id, title, subtitle, cover_image_url, category, tags, is_featured, is_published, position')
      .order('position');

    if (!data) { setLoading(false); setRefreshing(false); return; }

    // Fetch item counts for each guide
    const counts = await Promise.all(
      data.map(g =>
        supabase
          .from('guide_items')
          .select('id', { count: 'exact', head: true })
          .eq('guide_id', g.id)
          .then(r => ({ id: g.id, count: r.count ?? 0 })),
      ),
    );

    const countMap = Object.fromEntries(counts.map(c => [c.id, c.count]));
    const rows: GuideRow[] = data.map(g => ({
      ...g,
      item_count: countMap[g.id] ?? 0,
    }));
    setGuides(rows);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} />
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <Header router={router} />
      <FlatList
        data={guides}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="book-outline" size={48} color="#d0d0d0" />
            <Text style={s.emptyText}>No guides yet</Text>
            <Text style={s.emptySubText}>Tap + to create your first guide.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => router.push(`/(admin)/guide-edit/${item.id}`)}
            activeOpacity={0.75}
          >
            {item.cover_image_url ? (
              <Image source={{ uri: item.cover_image_url }} style={s.thumb} contentFit="cover" transition={200} />
            ) : (
              <View style={[s.thumb, s.thumbFallback]}>
                <Ionicons name="book-outline" size={22} color={TEXT_MUTED} />
              </View>
            )}
            <View style={s.cardBody}>
              <View style={s.cardTopRow}>
                <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                {item.is_featured && (
                  <View style={s.featuredBadge}>
                    <Text style={s.featuredBadgeText}>Featured</Text>
                  </View>
                )}
              </View>
              <View style={s.cardMeta}>
                <Text style={s.catLabel}>{CATEGORY_LABEL[item.category] ?? item.category}</Text>
                <Text style={s.dot}>·</Text>
                <Text style={s.itemCount}>{item.item_count} places</Text>
              </View>
              {!item.is_published && (
                <View style={s.draftBadge}>
                  <Text style={s.draftBadgeText}>Draft</Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={HAIRLINE} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function Header({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Manage Guides</Text>
      <TouchableOpacity style={s.addBtn} onPress={() => router.push('/(admin)/guide-edit/new')}>
        <Ionicons name="add" size={22} color={GREEN} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },

  list: { padding: 16, paddingBottom: 40 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbFallback: { backgroundColor: '#f0f0ea', alignItems: 'center', justifyContent: 'center' },

  cardBody:   { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle:  { flex: 1, fontSize: 15, fontWeight: '700', color: TEXT_DARK },

  cardMeta:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  catLabel:   { fontSize: 12, color: GREEN, fontWeight: '600' },
  dot:        { fontSize: 12, color: TEXT_MUTED },
  itemCount:  { fontSize: 12, color: TEXT_MUTED },

  featuredBadge: {
    backgroundColor: '#fef3c7', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  featuredBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400e' },

  draftBadge: {
    alignSelf: 'flex-start', backgroundColor: '#f3f4f6', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  draftBadgeText: { fontSize: 10, fontWeight: '700', color: TEXT_MUTED },

  empty:       { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText:   { fontSize: 16, fontWeight: '700', color: TEXT_MUTED },
  emptySubText:{ fontSize: 13, color: TEXT_MUTED },
});
