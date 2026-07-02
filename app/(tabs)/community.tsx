import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';

const GREEN = '#245737';

// ─── Pseudonym generator ──────────────────────────────────────────────────────
// Deterministic: same user_id always produces the same name.
// 30 × 30 = 900 combinations — low collision probability for typical leaderboard sizes.
const ADJECTIVES = [
  'Swift', 'Brave', 'Golden', 'Silver', 'Crimson', 'Bold', 'Quiet', 'Mighty',
  'Noble', 'Keen', 'Wise', 'Bright', 'Calm', 'Fierce', 'Gentle', 'Proud',
  'Loyal', 'Daring', 'Clever', 'Serene', 'Fearless', 'Ancient', 'Sacred',
  'Radiant', 'Steadfast', 'Vigilant', 'Nimble', 'Graceful', 'Valiant', 'Humble',
];
const ANIMALS = [
  'Falcon', 'Panda', 'Fox', 'Eagle', 'Lynx', 'Wolf', 'Hawk', 'Bear',
  'Deer', 'Crane', 'Tiger', 'Owl', 'Raven', 'Heron', 'Ibis', 'Gazelle',
  'Cheetah', 'Dolphin', 'Peregrine', 'Stallion', 'Sparrow', 'Leopard',
  'Albatross', 'Nighthawk', 'Condor', 'Panther', 'Kestrel', 'Mongoose',
  'Caracal', 'Oryx',
];

function pseudonym(userId: string): string {
  const hex = userId.replace(/-/g, '');
  if (hex.length < 8) return 'Mystery Scout';
  const adj    = ADJECTIVES[parseInt(hex.slice(0, 4), 16) % ADJECTIVES.length];
  const animal = ANIMALS[parseInt(hex.slice(4, 8), 16) % ANIMALS.length];
  return `${adj} ${animal}`;
}

type Scope = 'monthly' | 'alltime';

interface LeaderboardRow {
  user_id: string;
  total_points: number;
  rank: number;
  name: string | null;
  avatar_url: string | null;
}

interface UserStats {
  totalPoints: number;
  monthlyPoints: number;
  monthlyRank: number | null;
  badges: string[];
}

const BADGE_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  first_scout:    { label: 'First Scout',    emoji: '🔍', color: GREEN,     bg: '#e6f9f2' },
  scout:          { label: 'Scout',          emoji: '🗺️', color: '#2b6cb0', bg: '#ebf8ff' },
  super_scout:    { label: 'Super Scout',    emoji: '⭐', color: '#b7791f', bg: '#fefce8' },
  lensman:        { label: 'Lensman',        emoji: '📸', color: '#6b46c1', bg: '#faf5ff' },
  community_star: { label: 'Community Star', emoji: '🏆', color: '#c05621', bg: '#fff7ed' },
};

function BadgeChip({ type }: { type: string }) {
  const meta = BADGE_META[type];
  if (!meta) return null;
  return (
    <View style={[bs.chip, { backgroundColor: meta.bg }]}>
      <Text style={bs.emoji}>{meta.emoji}</Text>
      <Text style={[bs.label, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const bs = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  emoji: { fontSize: 13 },
  label: { fontSize: 12, fontWeight: '600' },
});

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <Text style={{ fontSize: 18 }}>🥇</Text>;
  if (rank === 2) return <Text style={{ fontSize: 18 }}>🥈</Text>;
  if (rank === 3) return <Text style={{ fontSize: 18 }}>🥉</Text>;
  return <Text style={s.rankNum}>#{rank}</Text>;
}

function Avatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const initials = name
    ? name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?';

  if (avatarUrl) {
    return <Image source={avatarUrl} style={s.rowAvatar} contentFit="cover" />;
  }
  return (
    <View style={[s.rowAvatar, s.rowAvatarFallback]}>
      <Text style={s.rowAvatarInitials}>{initials}</Text>
    </View>
  );
}

export default function CommunityScreen() {
  const { user } = useAuth();
  const router   = useRouter();

  const [scope,    setScope]    = useState<Scope>('monthly');
  const [rows,     setRows]     = useState<LeaderboardRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats,    setStats]    = useState<UserStats | null>(null);

  const loadLeaderboard = useCallback(async (s: Scope) => {
    setLoading(true);
    setLoadError(null);
    const view = s === 'monthly' ? 'monthly_leaderboard' : 'alltime_leaderboard';

    const { data, error } = await supabase
      .from(view)
      .select('user_id, total_points, rank')
      .order('rank', { ascending: true })
      .limit(20);

    if (error) {
      setLoadError('Could not load leaderboard.');
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // Fetch profile names + avatars for all entries
    const ids = data.map((r: { user_id: string }) => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, leaderboard_anonymous')
      .in('id', ids);

    const profileMap: Record<string, { name: string | null; avatar_url: string | null }> = {};
    for (const p of profiles ?? []) {
      profileMap[p.id] = {
        name:       p.leaderboard_anonymous ? pseudonym(p.id) : p.name,
        avatar_url: p.leaderboard_anonymous ? null            : p.avatar_url,
      };
    }

    setRows(data.map((r: { user_id: string; total_points: number; rank: number }) => ({
      user_id:      r.user_id,
      total_points: r.total_points,
      rank:         r.rank,
      // Fallback to pseudonym if profile row is missing (e.g. deleted account)
      name:         profileMap[r.user_id]?.name ?? pseudonym(r.user_id),
      avatar_url:   profileMap[r.user_id]?.avatar_url ?? null,
    })));
    setLoading(false);
  }, []);

  const loadUserStats = useCallback(async () => {
    if (!user) return;

    const [alltimeRes, monthRes, badgeRes] = await Promise.all([
      supabase
        .from('alltime_leaderboard')
        .select('total_points')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('monthly_leaderboard')
        .select('total_points, rank')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('user_badges')
        .select('badge_type')
        .eq('user_id', user.id),
    ]);

    // Log errors so they're visible during development
    if (alltimeRes.error) console.warn('[community] alltime_leaderboard error:', alltimeRes.error.message);
    if (monthRes.error)   console.warn('[community] monthly_leaderboard error:', monthRes.error.message);
    if (badgeRes.error)   console.warn('[community] user_badges error:', badgeRes.error.message);

    const totalPoints   = alltimeRes.data?.total_points ?? 0;
    const monthlyPoints = monthRes.data?.total_points ?? 0;
    const monthlyRank   = monthRes.data?.rank ?? null;
    const badges        = (badgeRes.data ?? []).map((b: { badge_type: string }) => b.badge_type);

    setStats({ totalPoints, monthlyPoints, monthlyRank, badges });
  }, [user]);

  useEffect(() => {
    loadLeaderboard(scope);
  }, [loadLeaderboard, scope]);

  useEffect(() => {
    loadUserStats();
  }, [loadUserStats]);

  // Reload personal stats and leaderboard when the tab is focused —
  // this ensures the anonymity toggle from the Profile tab reflects immediately.
  useFocusEffect(useCallback(() => {
    loadLeaderboard(scope);
    loadUserStats();
  }, [loadLeaderboard, loadUserStats, scope]));

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Text style={s.title}>Community</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Personal stats card (authenticated only) ── */}
        {user && stats ? (
          <View style={s.statsCard}>
            <View style={s.statsRow}>
              <View style={s.statBlock}>
                <Text style={s.statValue}>{stats.totalPoints}</Text>
                <Text style={s.statLabel}>Total Points</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBlock}>
                <Text style={s.statValue}>{stats.monthlyPoints}</Text>
                <Text style={s.statLabel}>This Month</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBlock}>
                <Text style={s.statValue}>
                  {stats.monthlyRank ? `#${stats.monthlyRank}` : '—'}
                </Text>
                <Text style={s.statLabel}>Monthly Rank</Text>
              </View>
            </View>

            {stats.badges.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.badgeRow}
              >
                {stats.badges.map(b => <BadgeChip key={b} type={b} />)}
              </ScrollView>
            ) : (
              <Text style={s.noBadgeText}>
                Submit & get approved to earn your first badge!
              </Text>
            )}
          </View>
        ) : !user ? (
          <TouchableOpacity
            style={s.guestCard}
            onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}
            activeOpacity={0.85}
          >
            <Ionicons name="trophy-outline" size={22} color={GREEN} />
            <Text style={s.guestCardText}>Sign in to track your rank & badges</Text>
            <Ionicons name="chevron-forward" size={16} color={GREEN} />
          </TouchableOpacity>
        ) : null}

        {/* ── Scope toggle ── */}
        <View style={s.toggle}>
          {(['monthly', 'alltime'] as Scope[]).map(opt => (
            <TouchableOpacity
              key={opt}
              style={[s.toggleBtn, scope === opt && s.toggleBtnActive]}
              onPress={() => setScope(opt)}
              activeOpacity={0.7}
            >
              <Text style={[s.toggleText, scope === opt && s.toggleTextActive]}>
                {opt === 'monthly' ? 'This Month' : 'All Time'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Leaderboard ── */}
        <View style={s.leaderboard}>
          {loading ? (
            <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 40 }} />
          ) : loadError ? (
            <View style={s.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={48} color="#ddd" />
              <Text style={s.emptyTitle}>Could not load leaderboard</Text>
              <Text style={s.emptySub}>{loadError}</Text>
            </View>
          ) : rows.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="trophy-outline" size={48} color="#ddd" />
              <Text style={s.emptyTitle}>No contributors yet</Text>
              <Text style={s.emptySub}>Be the first to submit a restaurant!</Text>
            </View>
          ) : (
            rows.map(row => {
              const isMe = user?.id === row.user_id;
              return (
                <View key={row.user_id} style={[s.row, isMe && s.rowHighlight]}>
                  <View style={s.rowRank}>
                    <RankMedal rank={Number(row.rank)} />
                  </View>
                  <Avatar name={row.name} avatarUrl={row.avatar_url} />
                  <View style={s.rowInfo}>
                    <Text style={[s.rowName, isMe && s.rowNameMe]} numberOfLines={1}>
                      {isMe ? 'You' : (row.name ?? 'Anonymous')}
                    </Text>
                  </View>
                  <Text style={[s.rowPoints, isMe && s.rowPointsMe]}>
                    {row.total_points} pts
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* ── Points guide ── */}
        <View style={s.guide}>
          <Text style={s.guideTitle}>How to earn points</Text>
          <View style={s.guideRow}>
            <Ionicons name="storefront-outline" size={16} color={GREEN} />
            <Text style={s.guideText}>Restaurant approved  <Text style={s.guidePts}>+50 pts</Text></Text>
          </View>
          <View style={s.guideRow}>
            <Ionicons name="star-outline" size={16} color={GREEN} />
            <Text style={s.guideText}>Review approved  <Text style={s.guidePts}>+15 pts</Text></Text>
          </View>
          <View style={s.guideRow}>
            <Ionicons name="camera-outline" size={16} color={GREEN} />
            <Text style={s.guideText}>Photo approved  <Text style={s.guidePts}>+10 pts</Text></Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111' },

  // personal stats
  statsCard: {
    backgroundColor: '#fff', margin: 16, borderRadius: 16,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  statsRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  statBlock:  { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: '#f0f0f0' },
  statValue:  { fontSize: 22, fontWeight: '800', color: '#111' },
  statLabel:  { fontSize: 11, color: '#999', marginTop: 2 },
  badgeRow:   { gap: 8, paddingVertical: 4 },
  noBadgeText: { fontSize: 12, color: '#bbb', textAlign: 'center', marginTop: 4 },

  // guest nudge
  guestCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#f0faf6', margin: 16, borderRadius: 14,
    padding: 16, borderWidth: 1.5, borderColor: '#c3e8d8',
  },
  guestCardText: { flex: 1, fontSize: 14, fontWeight: '600', color: GREEN },

  // scope toggle
  toggle: {
    flexDirection: 'row',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#ebebeb', borderRadius: 12, padding: 3,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#fff' },
  toggleText:       { fontSize: 13, fontWeight: '600', color: '#999' },
  toggleTextActive: { color: '#111' },

  // leaderboard list
  leaderboard: {
    backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  rowHighlight: { backgroundColor: '#f0faf6' },
  rowRank:   { width: 36, alignItems: 'center' },
  rankNum:   { fontSize: 13, fontWeight: '700', color: '#999' },
  rowAvatar: { width: 36, height: 36, borderRadius: 18, marginHorizontal: 10 },
  rowAvatarFallback: { backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  rowAvatarInitials: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rowInfo:   { flex: 1 },
  rowName:   { fontSize: 14, fontWeight: '600', color: '#111' },
  rowNameMe: { color: GREEN },
  rowPoints: { fontSize: 14, fontWeight: '700', color: '#111' },
  rowPointsMe: { color: GREEN },

  // empty state
  emptyWrap:  { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#ccc', marginTop: 12 },
  emptySub:   { fontSize: 13, color: '#ccc', marginTop: 4 },

  // points guide
  guide: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  guideTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 10 },
  guideRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  guideText:  { fontSize: 13, color: '#555' },
  guidePts:   { fontWeight: '700', color: GREEN },
});
