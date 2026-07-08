import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Brand } from '../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const CREAM      = Brand.cream;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const AMBER      = Brand.amber;
const RED        = Brand.red;
const GOLD       = Brand.gold;

interface Claim {
  id: string;
  restaurant_id: string;
  contact_name: string;
  contact_email: string;
  role: string;
  message: string | null;
  status: string;
  created_at: string;
  restaurants: { name: string; address: string } | null;
  profiles: { name: string | null } | null;
}

type Tab = 'pending' | 'reviewed';

export default function AdminClaimsScreen() {
  const router = useRouter();
  const [tab,        setTab]        = useState<Tab>('pending');
  const [pending,    setPending]    = useState<Claim[]>([]);
  const [reviewed,   setReviewed]   = useState<Claim[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    const [pendingRes, reviewedRes] = await Promise.all([
      supabase
        .from('restaurant_claims')
        .select('id, restaurant_id, contact_name, contact_email, role, message, status, created_at, restaurants(name, address), profiles!user_id(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('restaurant_claims')
        .select('id, restaurant_id, contact_name, contact_email, role, message, status, created_at, restaurants(name, address), profiles!user_id(name)')
        .in('status', ['approved', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    setPending((pendingRes.data as unknown as Claim[]) ?? []);
    setReviewed((reviewedRes.data as unknown as Claim[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const rows = tab === 'pending' ? pending : reviewed;

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

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, tab === 'pending' && s.tabActive]}
          onPress={() => setTab('pending')}
        >
          <Text style={[s.tabText, tab === 'pending' && s.tabTextActive]}>Pending</Text>
          {pending.length > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{pending.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'reviewed' && s.tabActive]}
          onPress={() => setTab('reviewed')}
        >
          <Text style={[s.tabText, tab === 'reviewed' && s.tabTextActive]}>Reviewed</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons
              name={tab === 'pending' ? 'checkmark-circle-outline' : 'time-outline'}
              size={48}
              color="#d0d0d0"
            />
            <Text style={s.emptyText}>
              {tab === 'pending' ? 'No pending claims' : 'No reviewed claims yet'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => router.push(`/(admin)/claim/${item.id}`)}
            activeOpacity={0.75}
          >
            <View style={s.cardDot}>
              {item.status === 'pending'
                ? <View style={s.pendingDot} />
                : item.status === 'approved'
                  ? <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                  : <Ionicons name="close-circle" size={16} color="#e53e3e" />
              }
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardRestaurant} numberOfLines={1}>
                {(item.restaurants as any)?.name ?? 'Unknown restaurant'}
              </Text>
              <Text style={s.cardClaimant}>
                {item.contact_name} · {item.role}
              </Text>
              <Text style={s.cardEmail} numberOfLines={1}>{item.contact_email}</Text>
              <Text style={s.cardDate}>{formatDate(item.created_at)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={HAIRLINE} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function Header({ router }: { router: any }) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
      </TouchableOpacity>
      <Text style={s.title}>Ownership Claims</Text>
      <View style={{ width: 36 }} />
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
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },

  tabs: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  tab: {
    flex: 1, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: GREEN },
  tabText:       { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  tabTextActive: { color: GREEN },
  badge: {
    backgroundColor: AMBER, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  listContent: { padding: 16, paddingBottom: 40 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    gap: 12,
  },
  cardDot:       { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  pendingDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER },
  cardBody:      { flex: 1, gap: 2 },
  cardRestaurant: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  cardClaimant:   { fontSize: 13, color: GREEN, fontWeight: '500', textTransform: 'capitalize' },
  cardEmail:      { fontSize: 12, color: TEXT_MUTED },
  cardDate:       { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },

  emptyBox:  { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 15, color: TEXT_MUTED, fontWeight: '500' },
});
