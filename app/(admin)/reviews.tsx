import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, RefreshControl, ScrollView,
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
const AMBER      = Brand.amber;
const RED        = Brand.red;
const GOLD       = Brand.gold;

type StatusTab = 'pending' | 'approved' | 'rejected';

interface PendingReview {
  id: string;
  user_id: string;
  rating: number;
  halal_compliance_rating: number;
  comment: string | null;
  photo_urls: string[] | null;
  created_at: string;
  status: string;
  restaurants: { id: string; name: string } | null;
  profiles: { name: string | null } | null;
}

function Stars({ value, color = '#f6a623' }: { value: number; color?: string }) {
  const full = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <Text style={{ color, fontSize: 13, letterSpacing: -0.5 }}>
      {'★'.repeat(full)}{'☆'.repeat(5 - full)}
    </Text>
  );
}

export default function AdminReviewsScreen() {
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();

  const [tab, setTab] = useState<StatusTab>(
    tabParam === 'approved' || tabParam === 'rejected' ? tabParam : 'pending',
  );
  const [reviews,    setReviews]    = useState<PendingReview[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting,     setActing]     = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('reviews')
      .select('id, user_id, rating, halal_compliance_rating, comment, photo_urls, created_at, status, restaurants(id, name), profiles!user_id(name)')
      .eq('status', tab)
      .order('created_at', { ascending: false });
    setReviews((data as unknown as PendingReview[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tab]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const moderate = async (reviewId: string, action: 'approved' | 'rejected') => {
    setActing(reviewId);
    const review = reviews.find(r => r.id === reviewId);

    const { data: updated, error } = await supabase
      .from('reviews')
      .update({ status: action })
      .eq('id', reviewId)
      .select('id');

    if (error || !updated?.length) {
      Alert.alert('Error', error?.message ?? 'Could not update review. Check admin permissions.');
      setActing(null);
      return;
    }

    // When approving, also approve any restaurant_photos tied to this review
    if (action === 'approved') {
      await supabase
        .from('restaurant_photos')
        .update({ status: 'approved' })
        .eq('review_id', reviewId);
    }

    // Notify the review author
    if (review?.user_id) {
      const restaurantName = review.restaurants?.name ?? 'a restaurant';
      supabase.functions.invoke('notify-user', {
        body: {
          userId: review.user_id,
          title: action === 'approved' ? '⭐ Review Approved!' : 'Review Update',
          body: action === 'approved'
            ? `Your review of ${restaurantName} has been approved and is now live.`
            : `Your review of ${restaurantName} was not approved by our moderation team.`,
        },
      }).catch(e => console.warn('[notify-user] invoke failed:', e));
    }

    // Remove from current tab list
    setReviews(prev => prev.filter(r => r.id !== reviewId));
    setActing(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <SafeAreaView style={s.flex}>
      {/* header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Review Moderation</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* status tabs */}
      <View style={s.tabs}>
        {(['pending', 'approved', 'rejected'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && s.tabActive]}
            onPress={() => { setTab(t); setLoading(true); }}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={item => item.id}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons
                name={tab === 'pending' ? 'checkmark-circle-outline' : 'star-outline'}
                size={48}
                color="#d0d0d0"
              />
              <Text style={s.emptyText}>No {tab} reviews</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isActing = acting === item.id;
            return (
              <View style={s.card}>
                {/* reviewer + restaurant */}
                <View style={s.cardHeader}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>
                      {(item.profiles?.name ?? 'A')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.cardMeta}>
                    <Text style={s.reviewerName}>{(() => {
                      const n = item.profiles?.name ?? 'Anonymous';
                      const parts = n.trim().split(/\s+/);
                      return parts.length < 2 ? n : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
                    })()}</Text>
                    <Text style={s.restaurantName} numberOfLines={1}>
                      {item.restaurants?.name ?? 'Unknown Restaurant'}
                    </Text>
                  </View>
                  <Text style={s.date}>{formatDate(item.created_at)}</Text>
                </View>

                {/* ratings */}
                <View style={s.ratingRow}>
                  <Stars value={item.rating} />
                  <Text style={s.ratingLabel}>Overall</Text>
                  <Stars value={item.halal_compliance_rating} color={GREEN} />
                  <Text style={[s.ratingLabel, { color: GREEN }]}>Halal</Text>
                </View>

                {/* comment */}
                {item.comment ? (
                  <Text style={s.comment}>{item.comment}</Text>
                ) : null}

                {/* review photos */}
                {item.photo_urls && item.photo_urls.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={s.photoStrip}
                  >
                    {item.photo_urls.map((url, i) => (
                      <Image key={i} source={url} style={s.photo} contentFit="cover" />
                    ))}
                  </ScrollView>
                )}

                {/* action buttons */}
                {tab === 'pending' && (
                  <View style={s.actions}>
                    <TouchableOpacity
                      style={s.rejectBtn}
                      onPress={() => moderate(item.id, 'rejected')}
                      disabled={isActing}
                      activeOpacity={0.75}
                    >
                      {isActing ? (
                        <ActivityIndicator size="small" color={RED} />
                      ) : (
                        <>
                          <Ionicons name="close" size={14} color={RED} />
                          <Text style={s.rejectBtnText}>Reject</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.approveBtn}
                      onPress={() => moderate(item.id, 'approved')}
                      disabled={isActing}
                      activeOpacity={0.75}
                    >
                      {isActing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={14} color="#fff" />
                          <Text style={s.approveBtnText}>Approve</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {tab === 'approved' && (
                  <TouchableOpacity
                    style={[s.rejectBtn, { alignSelf: 'flex-start', marginTop: 10 }]}
                    onPress={() => moderate(item.id, 'rejected')}
                    disabled={isActing}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="close" size={14} color={RED} />
                    <Text style={s.rejectBtnText}>Revoke approval</Text>
                  </TouchableOpacity>
                )}

                {tab === 'rejected' && (
                  <TouchableOpacity
                    style={[s.approveBtn, { alignSelf: 'flex-start', marginTop: 10 }]}
                    onPress={() => moderate(item.id, 'approved')}
                    disabled={isActing}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="checkmark" size={14} color="#fff" />
                    <Text style={s.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: TEXT_DARK },

  tabs: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  tab: {
    flex: 1, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: GREEN },
  tabText:       { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  tabTextActive: { color: GREEN },

  listContent: { padding: 16, paddingBottom: 40 },

  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 15, color: TEXT_MUTED, fontWeight: '500' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },
  avatarText:    { fontSize: 14, fontWeight: '700', color: GREEN },
  cardMeta:      { flex: 1 },
  reviewerName:  { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  restaurantName:{ fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
  date:          { fontSize: 11, color: TEXT_MUTED },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  ratingLabel: { fontSize: 11, color: TEXT_MUTED, fontWeight: '600' },

  comment: { fontSize: 14, color: TEXT_DARK, lineHeight: 20, marginBottom: 8 },

  photoStrip: { marginVertical: 8 },
  photo: { width: 80, height: 80, borderRadius: 10, marginRight: 8 },

  actions: {
    flexDirection: 'row', gap: 10, marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: CREAM,
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#fff5f5', borderWidth: 1.5, borderColor: '#fca5a5',
  },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: RED },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: GREEN,
  },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
