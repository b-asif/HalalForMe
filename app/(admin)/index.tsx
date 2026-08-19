import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl, ScrollView,
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

interface Submission {
  id: string;
  name: string;
  address: string;
  cuisine_type: string | null;
  created_at: string;
  status: string;
  restaurant_id: string | null;
}

interface Stats {
  restaurants: number;
  users: number;
  reviews: number;
  unreadNotifications: number;
  pendingSubmissions: number;
  pendingClaims: number;
  pendingReviews: number;
  pendingReports: number;
  pendingMosqueSync: number;
}

type Tab = 'pending' | 'approved';

export default function AdminDashboardScreen() {
  const router = useRouter();

  const [tab,        setTab]        = useState<Tab>('pending');
  const [pending,    setPending]    = useState<Submission[]>([]);
  const [approved,   setApproved]   = useState<Submission[]>([]);
  const [stats,      setStats]      = useState<Stats>({
    restaurants: 0, users: 0, reviews: 0,
    unreadNotifications: 0, pendingSubmissions: 0, pendingClaims: 0, pendingReviews: 0, pendingReports: 0,
    pendingMosqueSync: 0,
  });
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [
        pendingRes, approvedRes,
        restaurantsRes, usersRes, reviewsRes,
        unreadRes, claimsRes, pendingReviewsRes, pendingReportsRes,
        pendingMosqueSyncRes,
      ] = await Promise.all([
        supabase
          .from('submissions')
          .select('id, name, address, cuisine_type, created_at, status, restaurant_id')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('submissions')
          .select('id, name, address, cuisine_type, created_at, status, restaurant_id')
          .eq('status', 'approved')
          .order('created_at', { ascending: false }),
        supabase.from('restaurants').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('reviews').select('id', { count: 'exact', head: true }),
        supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
        supabase.from('restaurant_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('mosque_sync_cache').select('id', { count: 'exact', head: true }).eq('needs_review', true).eq('review_status', 'pending'),
      ]);

      setPending((pendingRes.data as Submission[]) ?? []);
      setApproved((approvedRes.data as Submission[]) ?? []);
      setStats({
        restaurants:          restaurantsRes.count         ?? 0,
        users:                usersRes.count               ?? 0,
        reviews:              reviewsRes.count             ?? 0,
        unreadNotifications:  unreadRes.count              ?? 0,
        pendingSubmissions:   (pendingRes.data?.length ?? 0),
        pendingClaims:        claimsRes.count              ?? 0,
        pendingReviews:       pendingReviewsRes.count      ?? 0,
        pendingReports:       pendingReportsRes.count      ?? 0,
        pendingMosqueSync:    pendingMosqueSyncRes.count   ?? 0,
      });
    } catch {
      setLoadError('Failed to load dashboard. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const rows = tab === 'pending' ? pending : approved;

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <Header />
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={s.flex}>
        <Header />
        <View style={s.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color="#ccc" />
          <Text style={s.errorText}>{loadError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); loadAll(); }}>
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <Header />

      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}

        ListHeaderComponent={
          <>
            {/* ── Stats row ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.statsScroll}
              contentContainerStyle={s.statsRow}
            >
              <StatCard icon="storefront-outline"  color="#3b82f6" label="Restaurants" value={stats.restaurants} />
              <StatCard icon="people-outline"       color={GREEN}   label="Users"       value={stats.users}       />
              <StatCard icon="star-outline"         color="#f6a623" label="Reviews"     value={stats.reviews}     />
              <StatCard icon="document-text-outline" color="#8b5cf6" label="Submissions" value={stats.pendingSubmissions} badge="pending" />
            </ScrollView>

            {/* ── Shortcuts ── */}
            <View style={s.shortcuts}>
              <Shortcut
                icon="notifications-outline"
                label="Notifications"
                color="#8b5cf6"
                bg="#f5f3ff"
                badge={stats.unreadNotifications}
                badgeColor="#8b5cf6"
                onPress={() => router.push('/(admin)/notifications')}
              />
              <Shortcut
                icon="star-outline"
                label="Review Moderation"
                color="#e53e3e"
                bg="#fff5f5"
                badge={stats.pendingReviews}
                badgeColor="#e53e3e"
                onPress={() => router.push('/(admin)/reviews')}
              />
              <Shortcut
                icon="storefront-outline"
                label="Ownership Claims"
                color="#b7791f"
                bg="#fefce8"
                badge={stats.pendingClaims}
                badgeColor="#b7791f"
                onPress={() => router.push('/(admin)/claims')}
              />
              <Shortcut
                icon="flag-outline"
                label="Content Reports"
                color="#e53e3e"
                bg="#fff5f5"
                badge={stats.pendingReports}
                badgeColor="#e53e3e"
                onPress={() => router.push('/(admin)/reports')}
              />
              <Shortcut
                icon="storefront-outline"
                label="Manage Listings"
                color="#3b82f6"
                bg="#eff6ff"
                badge={0}
                badgeColor="#3b82f6"
                onPress={() => router.push('/(admin)/listings')}
              />
              <Shortcut
                icon="sync-outline"
                label="Mosque Sync"
                color={GREEN}
                bg="#f0fdf4"
                badge={stats.pendingMosqueSync}
                badgeColor={GREEN}
                onPress={() => router.push('/(admin)/mosque-sync')}
              />
              <Shortcut
                icon="business-outline"
                label="Manage Mosques"
                color="#0d9488"
                bg="#f0fdfa"
                badge={0}
                badgeColor="#0d9488"
                onPress={() => router.push('/(admin)/mosque-listings')}
              />
              <Shortcut
                icon="book-outline"
                label="Manage Guides"
                color={DEEP_GREEN}
                bg="#eef5f0"
                badge={0}
                badgeColor={DEEP_GREEN}
                onPress={() => router.push('/(admin)/guides')}
              />
              <Shortcut
                icon="school-outline"
                label="MSA Requests"
                color="#0891b2"
                bg="#ecfeff"
                badge={0}
                badgeColor="#0891b2"
                onPress={() => router.push('/(admin)/msa-requests')}
              />
            </View>

            {/* ── Submissions header ── */}
            <Text style={s.sectionLabel}>Submissions</Text>

            {/* ── Tabs ── */}
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
                style={[s.tab, tab === 'approved' && s.tabActive]}
                onPress={() => setTab('approved')}
              >
                <Text style={[s.tabText, tab === 'approved' && s.tabTextActive]}>Approved</Text>
              </TouchableOpacity>
            </View>
          </>
        }

        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons
              name={tab === 'pending' ? 'checkmark-circle-outline' : 'storefront-outline'}
              size={48}
              color="#d0d0d0"
            />
            <Text style={s.emptyText}>
              {tab === 'pending' ? 'No pending submissions' : 'No approved restaurants yet'}
            </Text>
          </View>
        }

        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => {
              if (tab === 'pending') {
                router.push(`/(admin)/review/${item.id}`);
              } else if (item.restaurant_id) {
                router.push(`/(admin)/edit/${item.restaurant_id}`);
              }
            }}
            activeOpacity={0.75}
          >
            <View style={s.cardDot}>
              {tab === 'pending'
                ? <View style={s.pendingDot} />
                : <Ionicons name="checkmark-circle" size={16} color={GREEN} />
              }
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
              <Text style={s.cardAddress} numberOfLines={1}>{item.address}</Text>
              {item.cuisine_type ? (
                <Text style={s.cardCuisine}>{item.cuisine_type}</Text>
              ) : null}
              <Text style={s.cardDate}>{formatDate(item.created_at)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={HAIRLINE} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Header() {
  return (
    <View style={s.header}>
      <View style={s.headerLeft}>
        <Text style={s.headerTitle}>Admin Panel</Text>
        <Text style={s.headerSub}>Rihdal</Text>
      </View>
      <View style={s.headerIcon}>
        <Ionicons name="shield-checkmark" size={20} color={GREEN} />
      </View>
    </View>
  );
}

function StatCard({ icon, color, label, value, badge }: {
  icon: string; color: string; label: string; value: number; badge?: string;
}) {
  return (
    <View style={st.card}>
      <View style={[st.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={st.value}>{value.toLocaleString()}</Text>
      <Text style={st.label}>{label}</Text>
      {badge && value > 0 && (
        <View style={[st.badge, { backgroundColor: color + '20' }]}>
          <Text style={[st.badgeText, { color }]}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

function Shortcut({ icon, label, color, bg, badge, badgeColor, onPress }: {
  icon: string; label: string; color: string; bg: string;
  badge: number; badgeColor: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={sc.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[sc.iconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={sc.label}>{label}</Text>
      {badge > 0 && (
        <View style={[sc.badge, { backgroundColor: badgeColor }]}>
          <Text style={sc.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={HAIRLINE} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: CREAM },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText:    { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  retryBtn:     { marginTop: 4, backgroundColor: DEEP_GREEN, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  headerLeft:  {},
  headerTitle: { fontSize: 22, fontWeight: '800', color: TEXT_DARK },
  headerSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },

  statsScroll:  { flexGrow: 0 },
  statsRow:     { paddingHorizontal: 16, paddingVertical: 16, gap: 10, flexDirection: 'row' },

  shortcuts: { paddingHorizontal: 16, gap: 10, marginBottom: 8 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: TEXT_MUTED,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 16, marginTop: 8, marginBottom: 4,
  },

  tabs: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
    marginBottom: 12,
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

  listContent: { paddingBottom: 40 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 10, marginHorizontal: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    gap: 12,
  },
  cardDot:    { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER },
  cardBody:   { flex: 1, gap: 2 },
  cardName:    { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  cardAddress: { fontSize: 13, color: TEXT_MUTED },
  cardCuisine: { fontSize: 12, color: GREEN, fontWeight: '500' },
  cardDate:    { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },

  emptyBox:  { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 15, color: TEXT_MUTED, fontWeight: '500' },
});

// stat card styles
const st = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    width: 110, alignItems: 'flex-start',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    gap: 6,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  value: { fontSize: 22, fontWeight: '800', color: TEXT_DARK },
  label: { fontSize: 11, color: TEXT_MUTED, fontWeight: '600' },
  badge: {
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
});

// shortcut styles
const sc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 15, fontWeight: '600', color: TEXT_DARK },
  badge: {
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    minWidth: 22, alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});
