import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl, TextInput,
  Animated, PanResponder, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Brand } from '../../lib/theme';

const GREEN      = Brand.green;
const CREAM      = Brand.cream;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const TEAL = '#0d9488';

interface Mosque {
  id: string;
  name: string;
  address: string | null;
  owner_id: string | null;
  invite_code: string | null;
}

const DELETE_WIDTH = 80;

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const x = Math.max(-DELETE_WIDTH, Math.min(0, g.dx + (isOpen.current ? -DELETE_WIDTH : 0)));
        translateX.setValue(x);
      },
      onPanResponderRelease: (_, g) => {
        const shouldOpen = g.dx < -DELETE_WIDTH / 2 || (isOpen.current && g.dx < DELETE_WIDTH / 2);
        isOpen.current = shouldOpen;
        Animated.spring(translateX, {
          toValue: shouldOpen ? -DELETE_WIDTH : 0,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
    })
  ).current;

  const close = () => {
    isOpen.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  };

  return (
    <View style={{ overflow: 'hidden', marginBottom: 10 }}>
      {/* Delete action behind the row */}
      <View style={sr.deleteAction}>
        <TouchableOpacity style={sr.deleteBtn} onPress={() => { close(); onDelete(); }}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={sr.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

export default function AdminMosqueListingsScreen() {
  const router = useRouter();
  const [mosques,    setMosques]    = useState<Mosque[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query,      setQuery]      = useState('');

  const loadAll = useCallback(async () => {
    const { data } = await supabase
      .from('mosques')
      .select('id, name, address, owner_id, invite_code')
      .order('name')
      .limit(500);
    setMosques((data as Mosque[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  const handleDelete = useCallback((mosque: Mosque) => {
    Alert.alert(
      'Delete Mosque',
      `Remove "${mosque.name}" from the database? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('mosques').delete().eq('id', mosque.id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setMosques(prev => prev.filter(m => m.id !== mosque.id));
            }
          },
        },
      ]
    );
  }, []);

  const q = query.trim().toLowerCase();
  const rows = q
    ? mosques.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.address ?? '').toLowerCase().includes(q)
      )
    : mosques;

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} />
        <View style={s.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <Header router={router} />

      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={16} color={TEXT_MUTED} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Search mosques…"
          placeholderTextColor={TEXT_MUTED}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name="business-outline" size={48} color="#d0d0d0" />
            <Text style={s.emptyText}>{q ? 'No mosques match your search' : 'No mosques yet'}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const claimed = !!item.owner_id;
          return (
            <SwipeableRow onDelete={() => handleDelete(item)}>
              <TouchableOpacity
                style={[s.card, { marginBottom: 0 }]}
                onPress={() => router.push(`/mosque/${item.id}/manage`)}
                activeOpacity={0.75}
              >
                <View style={[s.iconWrap, { backgroundColor: '#f0fdfa' }]}>
                  <Ionicons name="business-outline" size={16} color={TEAL} />
                </View>
                <View style={s.cardBody}>
                  <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
                  {!!item.address && (
                    <Text style={s.cardAddress} numberOfLines={1}>{item.address}</Text>
                  )}
                </View>
                <Text style={[s.statusLabel, { color: claimed ? GREEN : TEXT_MUTED }]}>
                  {claimed ? 'Claimed' : 'Unclaimed'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={HAIRLINE} />
              </TouchableOpacity>
            </SwipeableRow>
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
      <Text style={s.title}>Manage Mosques</Text>
      <TouchableOpacity style={s.addBtn} onPress={() => router.push('/(admin)/add-mosque')}>
        <Ionicons name="add" size={22} color={TEAL} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE, gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f0fdfa', alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE, gap: 8,
  },
  searchIcon:  { marginRight: 2 },
  searchInput: {
    flex: 1, fontSize: 14, color: TEXT_DARK,
    paddingVertical: 6,
  },

  listContent: { padding: 16, paddingBottom: 40 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    gap: 12,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cardBody:    { flex: 1, gap: 2 },
  cardName:    { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  cardAddress: { fontSize: 12, color: TEXT_MUTED },
  statusLabel: { fontSize: 11, fontWeight: '700' },

  emptyBox:  { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 15, color: TEXT_MUTED, fontWeight: '500' },
});

const sr = StyleSheet.create({
  deleteAction: {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    width: DELETE_WIDTH, borderRadius: 14,
    backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn:     { alignItems: 'center', justifyContent: 'center', gap: 4 },
  deleteBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});
