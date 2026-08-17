import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { setGuestLoginIntent } from '../lib/guestLoginIntent';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

interface SavedGuide {
  guide_id: string;
  saved_at: string;
  guides: {
    id: string;
    title: string;
    subtitle: string | null;
    cover_image_url: string | null;
    category: string;
    tags: string[];
  };
}

export default function SavedGuidesScreen() {
  const router      = useRouter();
  const { user }    = useAuth();
  const [rows,    setRows]    = useState<SavedGuide[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('saved_guides')
      .select('guide_id, saved_at, guides(id, title, subtitle, cover_image_url, category, tags)')
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false });
    setRows((data as unknown as SavedGuide[]) ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} />
        <View style={s.centered}>
          <Ionicons name="bookmark-outline" size={52} color="#d0d0d0" />
          <Text style={s.emptyTitle}>Sign in to follow guides</Text>
          <TouchableOpacity
            style={s.signInBtn}
            onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}
          >
            <Text style={s.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} />
        <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <Header router={router} />
      <FlatList
        data={rows}
        keyExtractor={item => item.guide_id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          rows.length > 0
            ? <Text style={s.count}>Following {rows.length} {rows.length === 1 ? 'guide' : 'guides'}</Text>
            : null
        }
        ListEmptyComponent={
          <View style={s.centered}>
            <Ionicons name="bookmark-outline" size={52} color="#d0d0d0" />
            <Text style={s.emptyTitle}>No guides followed yet</Text>
            <Text style={s.emptySubText}>Follow guides to find them here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const g = item.guides;
          return (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/guide/${g.id}`)}
              activeOpacity={0.75}
            >
              {g.cover_image_url ? (
                <Image source={{ uri: g.cover_image_url }} style={s.thumb} contentFit="cover" transition={200} />
              ) : (
                <View style={[s.thumb, s.thumbFallback]}>
                  <Ionicons name="book-outline" size={24} color={TEXT_MUTED} />
                </View>
              )}
              <View style={s.cardBody}>
                <Text style={s.cardTitle} numberOfLines={2}>{g.title}</Text>
                {g.subtitle ? <Text style={s.cardSub} numberOfLines={2}>{g.subtitle}</Text> : null}
                {g.tags?.length > 0 && (
                  <View style={s.tags}>
                    {g.tags.slice(0, 3).map(tag => (
                      <View key={tag} style={s.tag}>
                        <Text style={s.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={HAIRLINE} />
            </TouchableOpacity>
          );
        }}
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
      <Text style={s.headerTitle}>Following</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },

  list:  { padding: 16, paddingBottom: 40 },
  count: { fontSize: 13, color: TEXT_MUTED, marginBottom: 12, fontWeight: '600' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  thumb: { width: 72, height: 72, borderRadius: 12 },
  thumbFallback: { backgroundColor: '#f0f0ea', alignItems: 'center', justifyContent: 'center' },

  cardBody:  { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  cardSub:   { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  tags:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: {
    backgroundColor: '#eef5f0', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  tagText: { fontSize: 11, fontWeight: '600', color: GREEN },

  emptyTitle:   { fontSize: 17, fontWeight: '700', color: TEXT_MUTED },
  emptySubText: { fontSize: 13, color: TEXT_MUTED },
  signInBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 32, marginTop: 8,
  },
  signInBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
