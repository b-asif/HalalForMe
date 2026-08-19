/**
 * (msa)/members.tsx
 *
 * MSA admin members screen.
 * Shows pending members with Approve/Reject, active members with role change and remove.
 * Edit controls only shown to admin role.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '../../lib/supabase';
import { useMsa } from '../../contexts/MsaContext';
import { useAuth } from '../../contexts/AuthContext';
import { Brand, Spacing, Radius } from '../../lib/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MsaMember {
  id: string;
  user_id: string;
  role: 'admin' | 'editor';
  status: 'active' | 'pending' | 'rejected';
  approved_at: string | null;
  profile: {
    name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MembersScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const { user } = useAuth();
  const msaId  = activeMembership?.msaId ?? '';
  const isAdmin = activeMembership?.role === 'admin';

  const [members,    setMembers]    = useState<MsaMember[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting,     setActing]     = useState<string | null>(null); // member id being acted on

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (isRefresh = false) => {
    if (!msaId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const { data, error } = await supabase
      .from('msa_members')
      .select(`
        id,
        user_id,
        role,
        status,
        approved_at,
        profiles (
          name,
          avatar_url,
          email
        )
      `)
      .eq('msa_id', msaId)
      .order('status', { ascending: true }) // pending first
      .order('approved_at', { ascending: true });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const parsed: MsaMember[] = (data ?? []).map((row: any) => ({
        id:          row.id,
        user_id:     row.user_id,
        role:        row.role,
        status:      row.status,
        approved_at: row.approved_at,
        profile: row.profiles
          ? {
              name:       row.profiles.name       ?? null,
              avatar_url: row.profiles.avatar_url ?? null,
              email:      row.profiles.email      ?? null,
            }
          : null,
      }));
      setMembers(parsed);
    }

    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [msaId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Approve / Reject ──────────────────────────────────────────────────────

  const handleApprove = async (member: MsaMember) => {
    setActing(member.id);
    const { error } = await supabase
      .from('msa_members')
      .update({ status: 'active', approved_at: new Date().toISOString(), approved_by: user?.id })
      .eq('id', member.id);
    setActing(null);
    if (error) { Alert.alert('Error', error.message); return; }
    load();
  };

  const handleReject = (member: MsaMember) => {
    const name = member.profile?.name ?? 'this member';
    Alert.alert(
      'Reject Request',
      `Reject ${name}'s request to join?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject', style: 'destructive',
          onPress: async () => {
            setActing(member.id);
            const { error } = await supabase
              .from('msa_members')
              .update({ status: 'rejected' })
              .eq('id', member.id);
            setActing(null);
            if (error) { Alert.alert('Error', error.message); return; }
            load();
          },
        },
      ],
    );
  };

  // ── Change role ───────────────────────────────────────────────────────────

  const handleChangeRole = (member: MsaMember) => {
    const nextRole = member.role === 'admin' ? 'editor' : 'admin';
    Alert.alert(
      'Change Role',
      `Make ${member.profile?.name ?? 'this member'} an ${nextRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setActing(member.id);
            const { error } = await supabase
              .from('msa_members')
              .update({ role: nextRole })
              .eq('id', member.id);
            setActing(null);
            if (error) { Alert.alert('Error', error.message); return; }
            load();
          },
        },
      ],
    );
  };

  // ── Remove member ─────────────────────────────────────────────────────────

  const handleRemove = (member: MsaMember) => {
    const name = member.profile?.name ?? 'this member';
    Alert.alert(
      'Remove Member',
      `Remove ${name} from the MSA?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setActing(member.id);
            const { error } = await supabase
              .from('msa_members')
              .delete()
              .eq('id', member.id);
            setActing(null);
            if (error) { Alert.alert('Error', error.message); return; }
            load();
          },
        },
      ],
    );
  };

  // ── Derived lists ─────────────────────────────────────────────────────────

  const pending  = members.filter(m => m.status === 'pending');
  const active   = members.filter(m => m.status === 'active');
  const rejected = members.filter(m => m.status === 'rejected');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Members</Text>
          <Text style={s.headerSub}>{activeMembership?.msaName ?? ''}</Text>
        </View>
        <View style={s.memberCount}>
          <Text style={s.memberCountText}>{active.length}</Text>
          <Text style={s.memberCountLabel}>active</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={Brand.green} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={Brand.green}
            />
          }
        >
          {/* Pending requests */}
          {pending.length > 0 && (
            <>
              <View style={s.sectionRow}>
                <Text style={s.sectionLabel}>PENDING REQUESTS</Text>
                <View style={s.pendingBadge}>
                  <Text style={s.pendingBadgeText}>{pending.length}</Text>
                </View>
              </View>
              <View style={s.card}>
                {pending.map((m, idx) => (
                  <View key={m.id}>
                    {idx > 0 && <View style={s.divider} />}
                    <PendingCard
                      member={m}
                      acting={acting === m.id}
                      isAdmin={isAdmin}
                      onApprove={() => handleApprove(m)}
                      onReject={() => handleReject(m)}
                    />
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Active members */}
          {active.length > 0 && (
            <>
              <Text style={s.sectionLabel}>ACTIVE MEMBERS</Text>
              <View style={s.card}>
                {active.map((m, idx) => (
                  <View key={m.id}>
                    {idx > 0 && <View style={s.divider} />}
                    <ActiveCard
                      member={m}
                      acting={acting === m.id}
                      isAdmin={isAdmin}
                      isSelf={m.user_id === user?.id}
                      onChangeRole={() => handleChangeRole(m)}
                      onRemove={() => handleRemove(m)}
                    />
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Rejected (collapsed by default, just count) */}
          {rejected.length > 0 && (
            <>
              <Text style={s.sectionLabel}>REJECTED</Text>
              <View style={s.card}>
                {rejected.map((m, idx) => (
                  <View key={m.id}>
                    {idx > 0 && <View style={s.divider} />}
                    <View style={s.memberRow}>
                      <MemberAvatar member={m} />
                      <View style={s.memberInfo}>
                        <Text style={s.memberName}>{m.profile?.name ?? 'Unknown'}</Text>
                        <Text style={s.memberEmail}>{m.profile?.email ?? ''}</Text>
                      </View>
                      <View style={[s.statusBadge, s.statusRejected]}>
                        <Text style={[s.statusText, s.statusRejectedText]}>Rejected</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Empty state */}
          {members.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={38} color={Brand.textMuted} />
              <Text style={s.emptyTitle}>No members yet</Text>
              <Text style={s.emptyBody}>Share your MSA so members can request to join.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Pending Card ──────────────────────────────────────────────────────────────

function PendingCard({ member, acting, isAdmin, onApprove, onReject }: {
  member: MsaMember; acting: boolean; isAdmin: boolean;
  onApprove: () => void; onReject: () => void;
}) {
  return (
    <View style={s.memberRow}>
      <MemberAvatar member={member} />
      <View style={s.memberInfo}>
        <Text style={s.memberName}>{member.profile?.name ?? 'Unknown'}</Text>
        <Text style={s.memberEmail}>{member.profile?.email ?? ''}</Text>
      </View>
      {isAdmin && (
        <View style={s.pendingActions}>
          {acting ? (
            <ActivityIndicator size="small" color={Brand.green} />
          ) : (
            <>
              <TouchableOpacity style={s.rejectBtn} onPress={onReject} activeOpacity={0.8}>
                <Text style={s.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.approveBtn} onPress={onApprove} activeOpacity={0.8}>
                <Text style={s.approveBtnText}>Approve</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
      {!isAdmin && (
        <View style={[s.statusBadge, s.statusPending]}>
          <Text style={[s.statusText, s.statusPendingText]}>Pending</Text>
        </View>
      )}
    </View>
  );
}

// ── Active Card ───────────────────────────────────────────────────────────────

function ActiveCard({ member, acting, isAdmin, isSelf, onChangeRole, onRemove }: {
  member: MsaMember; acting: boolean; isAdmin: boolean; isSelf: boolean;
  onChangeRole: () => void; onRemove: () => void;
}) {
  return (
    <View style={s.memberRow}>
      <MemberAvatar member={member} />
      <View style={s.memberInfo}>
        <View style={s.memberNameRow}>
          <Text style={s.memberName}>{member.profile?.name ?? 'Unknown'}</Text>
          {isSelf && <Text style={s.selfTag}>(you)</Text>}
        </View>
        <Text style={s.memberEmail}>{member.profile?.email ?? ''}</Text>
      </View>
      <View style={s.memberRight}>
        <View style={[s.roleBadge, member.role === 'admin' ? s.roleAdmin : s.roleEditor]}>
          <Text style={[s.roleText, member.role === 'admin' ? s.roleAdminText : s.roleEditorText]}>
            {member.role}
          </Text>
        </View>
        {isAdmin && !isSelf && (
          acting ? (
            <ActivityIndicator size="small" color={Brand.textMuted} />
          ) : (
            <TouchableOpacity onPress={() => {}} hitSlop={8}>
              <Ionicons
                name="ellipsis-horizontal"
                size={18}
                color={Brand.textMuted}
                onPress={() => {
                  Alert.alert(
                    member.profile?.name ?? 'Member',
                    'What would you like to do?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: member.role === 'admin' ? 'Make Editor' : 'Make Admin',
                        onPress: onChangeRole,
                      },
                      { text: 'Remove', style: 'destructive', onPress: onRemove },
                    ],
                  );
                }}
              />
            </TouchableOpacity>
          )
        )}
      </View>
    </View>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function MemberAvatar({ member }: { member: MsaMember }) {
  const name = member.profile?.name ?? '?';
  const initial = name.charAt(0).toUpperCase();
  return member.profile?.avatar_url ? (
    <Image source={{ uri: member.profile.avatar_url }} style={s.avatar} contentFit="cover" />
  ) : (
    <View style={s.avatarFallback}>
      <Text style={s.avatarInitial}>{initial}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Brand.cream },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Brand.hairline,
  },
  backBtn:      { padding: 4, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: Brand.textDark },
  headerSub:    { fontSize: 12, color: Brand.textMuted, marginTop: 1 },
  memberCount: { alignItems: 'center' },
  memberCountText:  { fontSize: 18, fontWeight: '800', color: Brand.deepGreen },
  memberCountLabel: { fontSize: 10, color: Brand.textMuted },

  scroll: { padding: Spacing.md, gap: Spacing.md },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Brand.textMuted, letterSpacing: 0.8, textTransform: 'uppercase',
  },
  pendingBadge: {
    backgroundColor: Brand.amber, borderRadius: Radius.circle,
    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Brand.textDark },
  emptyBody:  { fontSize: 13, color: Brand.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: Brand.hairline, marginLeft: 64 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12, gap: 10,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: Brand.hairline,
  },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EFF6F1', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700', color: Brand.deepGreen },

  memberInfo:   { flex: 1 },
  memberNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberName:   { fontSize: 15, fontWeight: '700', color: Brand.textDark },
  selfTag:      { fontSize: 12, color: Brand.textMuted },
  memberEmail:  { fontSize: 12, color: Brand.textMuted, marginTop: 2 },
  memberRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },

  pendingActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rejectBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.chip, borderWidth: 1, borderColor: Brand.hairline,
  },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: Brand.textDark },
  approveBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.chip, backgroundColor: Brand.deepGreen,
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  roleBadge:      { borderRadius: Radius.chip, paddingHorizontal: 9, paddingVertical: 3 },
  roleAdmin:      { backgroundColor: '#EFF6F1' },
  roleEditor:     { backgroundColor: '#F5F3FF' },
  roleText:       { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  roleAdminText:  { color: Brand.deepGreen },
  roleEditorText: { color: '#6D28D9' },

  statusBadge:    { borderRadius: Radius.chip, paddingHorizontal: 9, paddingVertical: 3 },
  statusPending:  { backgroundColor: '#FFF7ED' },
  statusRejected: { backgroundColor: '#FEF2F2' },
  statusText:         { fontSize: 11, fontWeight: '700' },
  statusPendingText:  { color: '#9A3412' },
  statusRejectedText: { color: Brand.red },
});
