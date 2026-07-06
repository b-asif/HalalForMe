import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { registerPushToken } from '../lib/notifications';
import { setGuestLoginIntent } from '../lib/guestLoginIntent';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const AMBER = Brand.amber;
const RED   = Brand.red;
const BLUE  = '#3b82f6';
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

// ─── types ────────────────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  type: 'submission_approved' | 'submission_rejected' | 'submission_pending'
      | 'claim_approved'      | 'claim_rejected'      | 'claim_pending'
      | 'review_approved'     | 'review_rejected';
  title: string;
  body: string;
  timestamp: string;
  linkTo?: string;
}

// ─── config ───────────────────────────────────────────────────────────────────

const CFG: Record<NotificationItem['type'], {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  bg: string;
}> = {
  submission_approved: { icon: 'checkmark-circle',  color: GREEN,  bg: '#e6f9f2' },
  submission_rejected: { icon: 'close-circle',       color: RED,    bg: '#fff5f5' },
  submission_pending:  { icon: 'time-outline',        color: AMBER,  bg: '#fffbeb' },
  claim_approved:      { icon: 'shield-checkmark',   color: GREEN,  bg: '#e6f9f2' },
  claim_rejected:      { icon: 'close-circle',       color: RED,    bg: '#fff5f5' },
  claim_pending:       { icon: 'time-outline',        color: AMBER,  bg: '#fffbeb' },
  review_approved:     { icon: 'star',               color: GREEN,  bg: '#e6f9f2' },
  review_rejected:     { icon: 'star-outline',        color: RED,    bg: '#fff5f5' },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'Just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router      = useRouter();
  const { user }    = useAuth();
  const [items,     setItems]     = useState<NotificationItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!user) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    // Silently register push token when user opens notifications
    registerPushToken(user.id).catch(() => {});

    try {
      const [subRes, claimRes, reviewRes] = await Promise.all([
        supabase
          .from('submissions')
          .select('id, name, status, reviewer_notes, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('restaurant_claims')
          .select('id, status, created_at, restaurants(name)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('reviews')
          .select('id, status, updated_at, restaurants(name)')
          .eq('user_id', user.id)
          .in('status', ['approved', 'rejected'])
          .order('updated_at', { ascending: false }),
      ]);

      const notifications: NotificationItem[] = [];

      // Submissions
      for (const sub of (subRes.data ?? [])) {
        if (sub.status === 'approved') {
          notifications.push({
            id: `sub-${sub.id}`,
            type: 'submission_approved',
            title: 'Submission approved',
            body: `${sub.name} is now live on HalalForMe.`,
            timestamp: sub.created_at,
          });
        } else if (sub.status === 'rejected') {
          notifications.push({
            id: `sub-${sub.id}`,
            type: 'submission_rejected',
            title: 'Submission not approved',
            body: sub.reviewer_notes
              ? `${sub.name}: ${sub.reviewer_notes}`
              : `${sub.name} could not be verified at this time.`,
            timestamp: sub.created_at,
          });
        } else {
          notifications.push({
            id: `sub-${sub.id}`,
            type: 'submission_pending',
            title: 'Submission under review',
            body: `${sub.name} has been received and is being reviewed by our team.`,
            timestamp: sub.created_at,
          });
        }
      }

      // Claims
      for (const claim of (claimRes.data ?? [])) {
        const restaurantName = (claim.restaurants as any)?.name ?? 'your restaurant';
        if (claim.status === 'approved') {
          notifications.push({
            id: `claim-${claim.id}`,
            type: 'claim_approved',
            title: 'Ownership claim approved',
            body: `You are now the verified owner of ${restaurantName}.`,
            timestamp: claim.created_at,
          });
        } else if (claim.status === 'rejected') {
          notifications.push({
            id: `claim-${claim.id}`,
            type: 'claim_rejected',
            title: 'Ownership claim not approved',
            body: `We could not verify your ownership of ${restaurantName}. Contact us for more details.`,
            timestamp: claim.created_at,
          });
        } else {
          notifications.push({
            id: `claim-${claim.id}`,
            type: 'claim_pending',
            title: 'Ownership claim submitted',
            body: `Your claim for ${restaurantName} is under review. This usually takes 1–3 days.`,
            timestamp: claim.created_at,
          });
        }
      }

      // Reviews
      for (const review of (reviewRes.data ?? [])) {
        const restaurantName = (review.restaurants as any)?.name ?? 'a restaurant';
        notifications.push({
          id: `review-${review.id}`,
          type: review.status === 'approved' ? 'review_approved' : 'review_rejected',
          title: review.status === 'approved' ? 'Review approved' : 'Review not approved',
          body: review.status === 'approved'
            ? `Your review of ${restaurantName} is now live.`
            : `Your review of ${restaurantName} was not approved by our moderation team.`,
          timestamp: review.updated_at,
        });
      }

      // Sort newest first
      notifications.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setItems(notifications);
    } catch {
      setError('Could not load notifications. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const cfg = CFG[item.type];
    return (
      <View style={s.card}>
        <View style={[s.iconWrap, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </View>
        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <Text style={s.cardTitle}>{item.title}</Text>
            <Text style={s.cardTime}>{timeAgo(item.timestamp)}</Text>
          </View>
          <Text style={s.cardBody2}>{item.body}</Text>
        </View>
      </View>
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
          <Text style={s.title}>Notifications</Text>
        </View>
        <View style={s.centered}>
          <View style={s.emptyIcon}>
            <Ionicons name="notifications-outline" size={36} color={GREEN} />
          </View>
          <Text style={s.emptyTitle}>Sign in to see notifications</Text>
          <Text style={s.emptyText}>Updates on your restaurant submissions and ownership claims will appear here.</Text>
          <TouchableOpacity style={s.signInBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}>
            <Text style={s.signInText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Notifications</Text>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={TEXT_MUTED} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={s.centered}>
          <View style={s.emptyIcon}>
            <Ionicons name="notifications-outline" size={36} color={GREEN} />
          </View>
          <Text style={s.emptyTitle}>No notifications yet</Text>
          <Text style={s.emptyText}>
            Updates on your restaurant submissions and ownership claims will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={GREEN}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: TEXT_DARK },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn: { backgroundColor: DEEP_GREEN, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: TEXT_MUTED },
  emptyText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  signInBtn: { marginTop: 8, backgroundColor: DEEP_GREEN, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 14 },
  signInText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  list: { padding: 16, gap: 10 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  iconWrap: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardBody: { flex: 1, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: TEXT_DARK, lineHeight: 19 },
  cardTime:  { fontSize: 12, color: TEXT_MUTED, flexShrink: 0, marginTop: 1 },
  cardBody2: { fontSize: 13, color: TEXT_MUTED, lineHeight: 19 },
});
