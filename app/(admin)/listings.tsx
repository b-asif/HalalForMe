import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Brand } from '../../lib/theme';

const GREEN     = Brand.green;
const CREAM     = Brand.cream;
const TEXT_DARK = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE  = Brand.hairline;

type ListingCategory = 'restaurant' | 'grocery' | 'butcher' | 'cafe';

interface Listing {
  id: string;
  name: string;
  address: string;
  category: ListingCategory;
}

type Tab = 'all' | 'restaurant' | 'grocery' | 'cafe';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all',        label: 'All'               },
  { key: 'restaurant', label: 'Restaurants'       },
  { key: 'grocery',    label: 'Grocery / Butcher' },
  { key: 'cafe',       label: 'Cafes'             },
];

const CATEGORY_BADGE: Record<ListingCategory, { label: string; icon: string; color: string; bg: string }> = {
  restaurant: { label: 'Restaurant',      icon: 'restaurant-outline', color: GREEN,     bg: '#e6f9f2' },
  grocery:    { label: 'Grocery/Butcher', icon: 'cart-outline',       color: '#0d9488', bg: '#e6f9f7' },
  butcher:    { label: 'Grocery/Butcher', icon: 'cart-outline',       color: '#0d9488', bg: '#e6f9f7' },
  cafe:       { label: 'Cafe',            icon: 'cafe-outline',        color: '#92400e', bg: '#fef3c7' },
};

export default function AdminListingsScreen() {
  const router = useRouter();
  const [tab,        setTab]        = useState<Tab>('all');
  const [listings,   setListings]   = useState<Listing[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');

  const loadAll = useCallback(async () => {
    const { data } = await supabase
      .from('restaurants')
      .select('id, name, address, category')
      .order('name')
      .limit(500);
    setListings((data as Listing[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  const q = search.trim().toLowerCase();

  const rows = (tab === 'all'
    ? listings
    : tab === 'grocery'
      ? listings.filter(l => l.category === 'grocery' || l.category === 'butcher')
      : tab === 'cafe'
        ? listings.filter(l => l.category === 'cafe')
        : listings.filter(l => (l.category ?? 'restaurant') === tab)
  ).filter(l =>
    !q ||
    l.name.toLowerCase().includes(q) ||
    l.address.toLowerCase().includes(q)
  );

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsScroll} contentContainerStyle={s.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, tab === t.key && s.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.searchOuter}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={15} color={TEXT_MUTED} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or address..."
            placeholderTextColor="#bbb"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name={q ? 'search-outline' : 'storefront-outline'} size={48} color="#d0d0d0" />
            <Text style={s.emptyText}>{q ? 'No listings match your search' : 'No listings yet'}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const badge = CATEGORY_BADGE[item.category ?? 'restaurant'] ?? CATEGORY_BADGE['restaurant'];
          return (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/(admin)/edit/${item.id}`)}
              activeOpacity={0.75}
            >
              <View style={[s.badgeIcon, { backgroundColor: badge.bg }]}>
                <Ionicons name={badge.icon as any} size={16} color={badge.color} />
              </View>
              <View style={s.cardBody}>
                <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.cardAddress} numberOfLines={1}>{item.address}</Text>
              </View>
              <Text style={[s.catLabel, { color: badge.color }]}>{badge.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={HAIRLINE} />
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
      <Text style={s.title}>Manage Listings</Text>
      <TouchableOpacity style={s.addBtn} onPress={() => router.push('/(admin)/edit/new')}>
        <Ionicons name="add" size={22} color={GREEN} />
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
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },

  tabsScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  tabs: { flexDirection: 'row' },
  tab: { paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: GREEN },
  tabText:       { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  tabTextActive: { color: GREEN },

  searchOuter: {
    backgroundColor: CREAM,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: TEXT_DARK },

  listContent: { padding: 16, paddingBottom: 40 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    gap: 12,
  },
  badgeIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cardBody:    { flex: 1, gap: 2 },
  cardName:    { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  cardAddress: { fontSize: 12, color: TEXT_MUTED },
  catLabel:    { fontSize: 11, fontWeight: '700' },

  emptyBox:  { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 15, color: TEXT_MUTED, fontWeight: '500' },
});
