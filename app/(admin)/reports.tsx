import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, RefreshControl, ScrollView,
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
const ORANGE     = Brand.amber;

type StatusTab = 'pending' | 'reviewed' | 'dismissed';

interface Report {
  id: string;
  content_type: string;
  content_id: string;
  reason: string;
  comment: string | null;
  status: string;
  created_at: string;
  reporter: { name: string | null } | null;
  review: {
    rating: number;
    comment: string | null;
    status: string;
    authorName: string | null;
  } | null;
}

const REASON_COLORS: Record<string, { color: string; bg: string }> = {
  spam:          { color: '#b7791f', bg: '#fefce8' },
  inappropriate: { color: RED,       bg: '#fff5f5' },
  harassment:    { color: '#7c3aed', bg: '#f5f3ff' },
  other:         { color: TEXT_MUTED, bg: CREAM },
};

export default function AdminReportsScreen() {
  const router = useRouter();

  const [tab,        setTab]        = useState<StatusTab>('pending');
  const [reports,    setReports]    = useState<Report[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting,     setActing]     = useState<string | null>(null);

  const load = useCallback(async () => {
    // Step 1: fetch reports (no FK-based join — reporter_id → auth.users, not profiles)
    const { data: rData } = await supabase
      .from('reports')
      .select('id, content_type, content_id, reason, comment, status, created_at, reporter_id')
      .eq('status', tab)
      .order('created_at', { ascending: false });

    const rawReports = (rData ?? []) as any[];

    // Step 2: batch-fetch reporter names from profiles
    const reporterIds = [...new Set(rawReports.map((r: any) => r.reporter_id as string))];
    const reporterMap: Record<string, string | null> = {};
    if (reporterIds.length > 0) {
      const { data: pData } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', reporterIds);
      for (const p of (pData ?? []) as any[]) {
        reporterMap[p.id] = p.name ?? null;
      }
    }

    // Step 3: batch-fetch reported review content
    const reviewIds = rawReports
      .filter((r: any) => r.content_type === 'review')
      .map((r: any) => r.content_id as string);

    const reviewMap: Record<string, { rating: number; comment: string | null; authorName: string | null }> = {};
    if (reviewIds.length > 0) {
      const { data: rvData } = await supabase
        .from('reviews')
        .select('id, rating, comment, status, user_id')
        .in('id', reviewIds);

      // Step 4: batch-fetch review author names
      const authorIds = [...new Set((rvData ?? []).map((rv: any) => rv.user_id as string))];
      const authorMap: Record<string, string | null> = {};
      if (authorIds.length > 0) {
        const { data: aData } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', authorIds);
        for (const a of (aData ?? []) as any[]) {
          authorMap[a.id] = a.name ?? null;
        }
      }

      for (const rv of (rvData ?? []) as any[]) {
        reviewMap[rv.id] = {
          rating:     rv.rating,
          comment:    rv.comment,
          status:     rv.status,
          authorName: authorMap[rv.user_id] ?? null,
        };
      }
    }

    // Step 5: assemble final shaped reports
    const shaped: Report[] = rawReports.map((r: any) => ({
      id:           r.id,
      content_type: r.content_type,
      content_id:   r.content_id,
      reason:       r.reason,
      comment:      r.comment,
      status:       r.status,
      created_at:   r.created_at,
      reporter:     { name: reporterMap[r.reporter_id] ?? null },
      review:       r.content_type === 'review' ? (reviewMap[r.content_id] ?? null) : null,
    }));

    setReports(shaped);
    setLoading(false);
    setRefreshing(false);
  }, [tab]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const updateStatus = async (reportId: string, newStatus: 'reviewed' | 'dismissed') => {
    setActing(reportId);
    const { data: updated, error } = await supabase
      .from('reports')
      .update({ status: newStatus })
      .eq('id', reportId)
      .select('id');

    if (error || !updated?.length) {
      Alert.alert('Error', error?.message ?? 'Could not update report.');
      setActing(null);
      return;
    }

    setReports(prev => prev.filter(r => r.id !== reportId));
    setActing(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const reasonStyle = (reason: string) => REASON_COLORS[reason] ?? REASON_COLORS.other;

  return (
    <SafeAreaView style={s.flex}>
      {/* header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Content Reports</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* status tabs */}
      <View style={s.tabs}>
        {(['pending', 'reviewed', 'dismissed'] as const).map(t => (
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
          data={reports}
          keyExtractor={item => item.id}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="flag-outline" size={48} color="#d0d0d0" />
              <Text style={s.emptyText}>No {tab} reports</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isActing = acting === item.id;
            const rc = reasonStyle(item.reason);
            return (
              <View style={s.card}>
                {/* reporter + date */}
                <View style={s.cardHeader}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>
                      {(item.reporter?.name ?? 'A')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.cardMeta}>
                    <Text style={s.reporterName}>{item.reporter?.name ?? 'Anonymous'}</Text>
                    <Text style={s.reporterSub}>Reported a {item.content_type}</Text>
                  </View>
                  <Text style={s.date}>{formatDate(item.created_at)}</Text>
                </View>

                {/* reason badge */}
                <View style={[s.reasonBadge, { backgroundColor: rc.bg }]}>
                  <Ionicons name="flag" size={12} color={rc.color} />
                  <Text style={[s.reasonText, { color: rc.color }]}>
                    {item.reason.charAt(0).toUpperCase() + item.reason.slice(1)}
                  </Text>
                </View>

                {/* reporter's comment */}
                {item.comment ? (
                  <View style={s.commentBox}>
                    <Text style={s.commentLabel}>Reporter's note</Text>
                    <Text style={s.commentText}>{item.comment}</Text>
                  </View>
                ) : null}

                {/* reported review content */}
                {item.review ? (
                  <View style={s.reviewBox}>
                    <View style={s.reviewHeader}>
                      <Ionicons name="star" size={12} color={ORANGE} />
                      <Text style={s.reviewRating}>{item.review.rating}/5</Text>
                      <Text style={s.reviewAuthor}>
                        by {item.review.authorName ?? 'Anonymous'}
                      </Text>
                    </View>
                    {item.review.comment ? (
                      <Text style={s.reviewComment} numberOfLines={3}>
                        "{item.review.comment}"
                      </Text>
                    ) : (
                      <Text style={s.reviewNoComment}>No written comment</Text>
                    )}
                  </View>
                ) : null}

                {/* action buttons — only on pending tab */}
                {tab === 'pending' && (
                  <View style={s.actions}>
                    <TouchableOpacity
                      style={s.dismissBtn}
                      onPress={() => updateStatus(item.id, 'dismissed')}
                      disabled={isActing}
                      activeOpacity={0.75}
                    >
                      {isActing ? (
                        <ActivityIndicator size="small" color="#888" />
                      ) : (
                        <>
                          <Ionicons name="close" size={14} color="#888" />
                          <Text style={s.dismissBtnText}>Dismiss</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.reviewedBtn}
                      onPress={() => updateStatus(item.id, 'reviewed')}
                      disabled={isActing}
                      activeOpacity={0.75}
                    >
                      {isActing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={14} color="#fff" />
                          <Text style={s.reviewedBtnText}>Mark Reviewed</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* jump to the correct tab in review moderation */}
                {item.content_type === 'review' && item.review && (
                  <TouchableOpacity
                    style={s.viewReviewBtn}
                    onPress={() => router.push({
                      pathname: '/(admin)/reviews',
                      params: { tab: item.review!.status },
                    })}
                    activeOpacity={0.7}
                  >
                    <Text style={s.viewReviewText}>
                      Open in Review Moderation
                      {item.review.status ? ` · ${item.review.status.charAt(0).toUpperCase() + item.review.status.slice(1)}` : ''}
                    </Text>
                    <Ionicons name="chevron-forward" size={13} color={GREEN} />
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
  flex:    { flex: 1, backgroundColor: CREAM },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

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
    flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
  },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: GREEN },
  tabText:       { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  tabTextActive: { color: GREEN },

  listContent: { padding: 16, paddingBottom: 40 },

  emptyBox:  { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 15, color: TEXT_MUTED, fontWeight: '500' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff5f5', alignItems: 'center', justifyContent: 'center',
  },
  avatarText:   { fontSize: 14, fontWeight: '700', color: RED },
  cardMeta:     { flex: 1 },
  reporterName: { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  reporterSub:  { fontSize: 11, color: TEXT_MUTED, marginTop: 1 },
  date:         { fontSize: 11, color: TEXT_MUTED },

  reasonBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, marginBottom: 10,
  },
  reasonText: { fontSize: 12, fontWeight: '700' },

  commentBox: {
    backgroundColor: CREAM, borderRadius: 10,
    padding: 10, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: HAIRLINE,
  },
  commentLabel: { fontSize: 10, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', marginBottom: 4 },
  commentText:  { fontSize: 13, color: TEXT_DARK, lineHeight: 19 },

  reviewBox: {
    backgroundColor: CREAM, borderRadius: 10,
    padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: HAIRLINE,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  reviewRating: { fontSize: 12, fontWeight: '700', color: TEXT_DARK },
  reviewAuthor: { fontSize: 12, color: TEXT_MUTED },
  reviewComment:   { fontSize: 13, color: TEXT_DARK, lineHeight: 19, fontStyle: 'italic' },
  reviewNoComment: { fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' },

  actions: {
    flexDirection: 'row', gap: 10, marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: CREAM,
  },
  dismissBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: CREAM, borderWidth: 1.5, borderColor: HAIRLINE,
  },
  dismissBtnText: { fontSize: 14, fontWeight: '700', color: TEXT_MUTED },
  reviewedBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: GREEN,
  },
  reviewedBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  viewReviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: CREAM,
  },
  viewReviewText: { fontSize: 13, color: GREEN, fontWeight: '600' },
});
