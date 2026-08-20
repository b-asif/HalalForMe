/**
 * /(admin)/msa-requests
 *
 * Rihdal admin screen — review and approve/reject MSA onboarding requests.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, Share,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { InstagramIcon } from '../../components/InstagramIcon';

import { supabase } from '../../lib/supabase';
import { Brand, Radius, Spacing, Type } from '../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const CREAM      = Brand.cream;
const RED        = Brand.red;
const AMBER      = Brand.amber;

interface MsaRequest {
  id: string;
  user_id: string;
  university_id: string | null;
  msa_id: string | null;
  proposed_university_name: string | null;
  proposed_msa_name: string | null;
  message: string | null;
  status: 'pending' | 'code_sent' | 'approved' | 'rejected';
  reviewer_notes: string | null;
  contact_email: string | null;
  contact_instagram: string | null;
  created_at: string;
  universities: { name: string; slug: string } | null;
  msas: { name: string } | null;
  profiles: { name: string | null; } | null;
}

type Tab = 'pending' | 'code_sent' | 'approved' | 'rejected';

export default function MsaRequestsScreen() {
  const router = useRouter();

  const [tab, setTab]           = useState<Tab>('pending');
  const [requests, setRequests] = useState<MsaRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing]     = useState<string | null>(null); // request id being acted on

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('msa_onboarding_requests')
      .select(`
        id, user_id, university_id, msa_id, proposed_msa_name, proposed_university_name,
        message, status, reviewer_notes, contact_email, contact_instagram, created_at,
        universities(name, slug),
        msas(name),
        profiles(name)
      `)
      .eq('status', tab)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[msa-requests] load error:', JSON.stringify(error));
      Alert.alert('Load failed', error.message);
    }
    setRequests((data as any[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tab]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleApprove = useCallback((req: MsaRequest) => {
    Alert.alert(
      'Approve Request',
      `Grant ${(req.profiles as any)?.name ?? 'this user'} admin access to "${req.msas?.name ?? req.proposed_msa_name ?? 'new MSA'}" at ${req.universities?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActing(req.id);
            const { error } = await supabase.rpc('approve_msa_request', { p_request_id: req.id });
            setActing(null);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              load();
              supabase.functions.invoke('notify-user', {
                body: {
                  userId: req.user_id,
                  title: 'MSA Access Approved!',
                  body: `Your request for ${req.msas?.name ?? req.proposed_msa_name ?? 'your MSA'} has been approved. Tap to open your dashboard.`,
                  data: { type: 'msa_approved' },
                },
              }).catch((e: unknown) => console.warn('notify-user failed:', e));
            }
          },
        },
      ],
    );
  }, [load]);

  const handleGenerateCode = useCallback((req: MsaRequest) => {
    Alert.alert(
      'Generate Claim Code',
      `Generate a one-time code for "${req.msas?.name ?? req.proposed_msa_name ?? 'new MSA'}" at ${(req.universities as any)?.name}? Send it to the MSA via email or DM — they'll enter it in the app to claim their page.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setActing(req.id);
            const { data, error } = await supabase.rpc('generate_msa_claim_code', {
              p_university_id: req.university_id,
              p_msa_id:        req.msa_id ?? null,
              p_request_id:    req.id,
            });
            setActing(null);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              const code = data as string;
              load();
              const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
              const msaName = req.msas?.name ?? req.proposed_msa_name ?? 'your MSA';
              const contactLine = req.contact_email
                ? `\n\nEmail: ${req.contact_email}`
                : req.contact_instagram
                  ? `\n\nInstagram: @${req.contact_instagram}`
                  : '';
              Share.share({
                message: `Hi! Here's your Rihdal Campus Hub claim code for ${msaName}:\n\n${formatted}\n\nEnter it in the Rihdal app under Campus Hub → "Have a claim code?" to activate your MSA page. It expires in 30 days.${contactLine}`,
                title: `Rihdal Claim Code — ${formatted}`,
              });
            }
          },
        },
      ],
    );
  }, [load]);

  const handleReject = useCallback((req: MsaRequest) => {
    Alert.prompt(
      'Reject Request',
      'Optional: add a note for the requester.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async (notes?: string) => {
            setActing(req.id);
            const { error } = await supabase.rpc('reject_msa_request', {
              p_request_id: req.id,
              p_notes: notes?.trim() || null,
            });
            setActing(null);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              load();
              supabase.functions.invoke('notify-user', {
                body: {
                  userId: req.user_id,
                  title: 'MSA Request Update',
                  body: `Your request for ${req.msas?.name ?? req.proposed_msa_name ?? 'your MSA'} was not approved at this time.`,
                  data: { type: 'msa_rejected' },
                },
              }).catch((e: unknown) => console.warn('notify-user failed:', e));
            }
          },
        },
      ],
      'plain-text',
    );
  }, [load]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={DEEP_GREEN} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>MSA Requests</Text>
          <Text style={s.subtitle}>Campus access requests</Text>
        </View>
        <View style={s.headerIcon}>
          <Ionicons name="school-outline" size={20} color={GREEN} />
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['pending', 'code_sent', 'approved', 'rejected'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && s.tabActive]}
            onPress={() => { setTab(t); setLoading(true); }}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'code_sent' ? 'Code Sent' : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator color={GREEN} size="large" />
        </View>
      ) : requests.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#d0d0d0" />
          <Text style={s.emptyText}>No {tab} requests</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
        >
          {requests.map(req => (
            <View key={req.id} style={s.card}>
              {/* University + MSA */}
              <View style={s.cardHeader}>
                <View style={s.cardIconWrap}>
                  <Ionicons name="school-outline" size={18} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardUni} numberOfLines={1}>
                    {(req.universities as any)?.name ?? req.proposed_university_name ?? '—'}
                    {req.proposed_university_name && !req.university_id ? '  (new)' : ''}
                  </Text>
                  <Text style={s.cardMsa} numberOfLines={1}>
                    {req.msas?.name
                      ? req.msas.name
                      : req.proposed_msa_name
                        ? `${req.proposed_msa_name}  (new)`
                        : '—'}
                  </Text>
                </View>
                <View style={[s.statusBadge, tab === 'pending' && s.statusPending, tab === 'code_sent' && s.statusCodeSent, tab === 'approved' && s.statusApproved, tab === 'rejected' && s.statusRejected]}>
                  <Text style={[s.statusText, tab === 'pending' && { color: AMBER }, tab === 'code_sent' && { color: '#0891b2' }, tab === 'approved' && { color: GREEN }, tab === 'rejected' && { color: RED }]}>
                    {tab === 'code_sent' ? 'Code Sent' : tab}
                  </Text>
                </View>
              </View>

              {/* Requester */}
              <View style={s.row}>
                <Ionicons name="person-outline" size={14} color={TEXT_MUTED} />
                <Text style={s.rowText}>
                  {(req.profiles as any)?.name ?? 'Unknown user'}
                </Text>
                <Text style={s.dateText}>{formatDate(req.created_at)}</Text>
              </View>

              {/* Contact info */}
              {(req.contact_email || req.contact_instagram) ? (
                <View style={s.contactBox}>
                  <Text style={s.contactLabel}>Send code to</Text>
                  {req.contact_email ? (
                    <View style={s.contactRow}>
                      <Ionicons name="mail-outline" size={13} color={TEXT_MUTED} />
                      <Text style={s.contactText}>{req.contact_email}</Text>
                    </View>
                  ) : null}
                  {req.contact_instagram ? (
                    <View style={s.contactRow}>
                      <InstagramIcon size={13} color={TEXT_MUTED} />
                      <Text style={s.contactText}>@{req.contact_instagram}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Message */}
              {req.message ? (
                <View style={s.messageBox}>
                  <Text style={s.messageText}>{req.message}</Text>
                </View>
              ) : null}

              {/* Reviewer notes (rejected only) */}
              {req.reviewer_notes ? (
                <View style={s.notesBox}>
                  <Text style={s.notesLabel}>Reviewer note</Text>
                  <Text style={s.notesText}>{req.reviewer_notes}</Text>
                </View>
              ) : null}

              {/* Actions */}
              {(tab === 'pending' || tab === 'code_sent') && (
                <View style={s.actions}>
                  <TouchableOpacity
                    style={s.rejectBtn}
                    onPress={() => handleReject(req)}
                    disabled={acting === req.id}
                  >
                    {acting === req.id
                      ? <ActivityIndicator size="small" color={RED} />
                      : <Text style={s.rejectBtnText}>Reject</Text>
                    }
                  </TouchableOpacity>
                  {tab === 'pending' && (
                    <TouchableOpacity
                      style={s.codeBtn}
                      onPress={() => handleGenerateCode(req)}
                      disabled={acting === req.id}
                    >
                      <Ionicons name="key-outline" size={14} color="#0891b2" />
                      <Text style={s.codeBtnText}>Send Code</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={s.approveBtn}
                    onPress={() => handleApprove(req)}
                    disabled={acting === req.id}
                  >
                    {acting === req.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={s.approveBtnText}>Approve</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: Spacing.md,
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: Radius.circle,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title:    { fontSize: 20, fontWeight: '800', color: TEXT_DARK },
  subtitle: { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },

  tabs: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  tab: {
    flex: 1, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: GREEN },
  tabText:       { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  tabTextActive: { color: GREEN },

  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: TEXT_MUTED, fontWeight: '500' },

  listContent: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 40 },

  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: HAIRLINE,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  cardIconWrap: {
    width: 36, height: 36, borderRadius: Radius.chip,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cardUni:  { ...Type.body, color: TEXT_DARK, fontWeight: '700' },
  cardMsa:  { ...Type.caption, color: GREEN, fontWeight: '600', marginTop: 1 },

  statusBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  statusPending:  { backgroundColor: '#fef9c3' },
  statusCodeSent: { backgroundColor: '#e0f2fe' },
  statusApproved: { backgroundColor: '#dcfce7' },
  statusRejected: { backgroundColor: '#fee2e2' },
  statusText:     { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  rowText:  { ...Type.caption, color: TEXT_MUTED, flex: 1 },
  dateText: { ...Type.tiny, color: TEXT_MUTED },

  messageBox: {
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: CREAM, borderRadius: Radius.chip,
    padding: Spacing.sm,
  },
  messageText: { ...Type.caption, color: TEXT_DARK, lineHeight: 18 },

  contactBox: {
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: '#f0faf6', borderRadius: Radius.chip,
    padding: Spacing.sm, gap: 4,
  },
  contactLabel: { ...Type.tiny, color: GREEN, fontWeight: '700', marginBottom: 2 },
  contactRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contactText:  { ...Type.caption, color: TEXT_DARK },

  notesBox: {
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: '#fff5f5', borderRadius: Radius.chip,
    padding: Spacing.sm,
  },
  notesLabel: { ...Type.tiny, color: RED, fontWeight: '700', marginBottom: 2 },
  notesText:  { ...Type.caption, color: TEXT_DARK, lineHeight: 18 },

  actions: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  rejectBtn: {
    flex: 1, paddingVertical: 11, borderRadius: Radius.chip,
    backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fca5a5',
    alignItems: 'center',
  },
  rejectBtnText:  { fontSize: 14, fontWeight: '700', color: RED },
  codeBtn: {
    flex: 2, paddingVertical: 11, borderRadius: Radius.chip,
    backgroundColor: '#e0f2fe', borderWidth: 1, borderColor: '#bae6fd',
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  codeBtnText: { fontSize: 14, fontWeight: '700', color: '#0891b2' },
  approveBtn: {
    flex: 2, paddingVertical: 11, borderRadius: Radius.chip,
    backgroundColor: DEEP_GREEN, alignItems: 'center',
  },
  approveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
