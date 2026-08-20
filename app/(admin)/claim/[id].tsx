import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { formatError } from '../../../lib/errors';

const GREEN = '#245737';

interface Claim {
  id: string;
  restaurant_id: string;
  user_id: string;
  contact_name: string;
  contact_email: string;
  role: string;
  message: string | null;
  proof_url: string | null;
  status: string;
  created_at: string;
  restaurants: { name: string; address: string; owner_id: string | null } | null;
  profiles: { name: string | null; avatar_url: string | null } | null;
}

export default function AdminClaimReviewScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [claim,          setClaim]          = useState<Claim | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [working,        setWorking]        = useState(false);
  const [rejectVisible,  setRejectVisible]  = useState(false);
  const [rejectReason,   setRejectReason]   = useState('');

  const loadClaim = useCallback(async () => {
    const { data, error } = await supabase
      .from('restaurant_claims')
      .select('id, restaurant_id, user_id, contact_name, contact_email, role, message, proof_url, status, created_at, restaurants(name, address, owner_id), profiles!user_id(name, avatar_url)')
      .eq('id', id)
      .single();

    if (!error && data) setClaim(data as unknown as Claim);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { loadClaim(); }, [loadClaim]));

  const approveClaim = () => {
    Alert.alert(
      'Approve Claim',
      `Grant ${claim?.contact_name} owner access to ${(claim?.restaurants as any)?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve', style: 'default',
          onPress: async () => {
            setWorking(true);
            try {
              // Set owner on the restaurant
              const { error: restErr } = await supabase
                .from('restaurants')
                .update({ owner_id: claim!.user_id })
                .eq('id', claim!.restaurant_id);
              if (restErr) throw restErr;

              // Update claim status
              const { error: claimErr } = await supabase
                .from('restaurant_claims')
                .update({ status: 'approved', reviewed_at: new Date().toISOString() })
                .eq('id', id);
              if (claimErr) throw claimErr;

              // Notify user
              supabase.functions.invoke('notify-user', {
                body: {
                  userId: claim!.user_id,
                  title: '🎉 Ownership Approved!',
                  body: `Your claim for ${(claim?.restaurants as any)?.name} has been approved. You can now manage this listing.`,
                },
              }).catch(() => {});

              Alert.alert('Approved', 'Owner access granted.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (e: any) {
              console.error('[admin/claim] approve error:', e);
              Alert.alert('Error', formatError(e));
            } finally {
              setWorking(false);
            }
          },
        },
      ],
    );
  };

  const rejectClaim = () => {
    setRejectReason('');
    setRejectVisible(true);
  };

  const doReject = async () => {
    if (!claim) return;
    setWorking(true);
    setRejectVisible(false);
    try {
      const { error } = await supabase
        .from('restaurant_claims')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      const reason = rejectReason.trim();
      supabase.functions.invoke('notify-user', {
        body: {
          userId: claim.user_id,
          title: 'Claim Not Approved',
          body: reason
            ? `We were unable to verify your ownership of ${(claim.restaurants as any)?.name}. Reason: ${reason}`
            : `We were unable to verify your ownership of ${(claim.restaurants as any)?.name}. Please contact support if you believe this is an error.`,
        },
      }).catch(() => {});

      Alert.alert('Rejected', 'Claim has been rejected.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      console.error('[admin/claim] reject error:', e);
      Alert.alert('Error', formatError(e));
    } finally {
      setWorking(false);
    }
  };

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

  if (!claim) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} />
        <View style={s.centered}>
          <Text style={{ color: '#aaa' }}>Claim not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const restaurant = claim.restaurants as any;
  const isPending  = claim.status === 'pending';

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <SafeAreaView style={s.flex}>
      <Header router={router} />

      {/* Rejection reason modal */}
      <Modal
        visible={rejectVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRejectVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalOverlay}>
            <View style={s.modalSheet}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>Reject Claim</Text>
              <Text style={s.modalSubtitle}>
                Optionally provide a reason. It will be included in the notification sent to {claim?.contact_name}.
              </Text>
              <TextInput
                style={s.modalInput}
                placeholder="e.g. Could not verify your connection to this restaurant."
                placeholderTextColor="#bbb"
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setRejectVisible(false)}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalRejectBtn} onPress={doReject}>
                  <Text style={s.modalRejectText}>Reject Claim</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}>

        {/* Status banner */}
        {!isPending && (
          <View style={[s.statusBanner, claim.status === 'approved' ? s.statusApproved : s.statusRejected]}>
            <Ionicons
              name={claim.status === 'approved' ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={claim.status === 'approved' ? GREEN : '#e53e3e'}
            />
            <Text style={[s.statusText, claim.status === 'approved' ? s.statusTextApproved : s.statusTextRejected]}>
              {claim.status === 'approved' ? 'Approved — owner access granted' : 'Rejected'}
            </Text>
          </View>
        )}

        {/* Restaurant */}
        <Text style={s.sectionLabel}>Restaurant</Text>
        <View style={s.infoCard}>
          <View style={s.infoRow}>
            <Ionicons name="storefront-outline" size={16} color={GREEN} />
            <View style={{ flex: 1 }}>
              <Text style={s.infoValue}>{restaurant?.name ?? '—'}</Text>
              <Text style={s.infoSub}>{restaurant?.address ?? '—'}</Text>
            </View>
          </View>
        </View>

        {/* Claimant */}
        <Text style={s.sectionLabel}>Claimant</Text>
        <View style={s.infoCard}>
          <DetailRow icon="person-outline" label="Name"  value={claim.contact_name} />
          <DetailRow icon="mail-outline"   label="Email" value={claim.contact_email} />
          <DetailRow icon="briefcase-outline" label="Role" value={claim.role.charAt(0).toUpperCase() + claim.role.slice(1)} />
          <DetailRow icon="calendar-outline" label="Submitted" value={formatDate(claim.created_at)} />
        </View>

        {/* Message */}
        {claim.message ? (
          <>
            <Text style={s.sectionLabel}>Their Message</Text>
            <View style={s.messageCard}>
              <Text style={s.messageText}>{claim.message}</Text>
            </View>
          </>
        ) : null}

        {/* Proof document */}
        {claim.proof_url ? (
          <>
            <Text style={s.sectionLabel}>Submitted Document</Text>
            <Image
              source={claim.proof_url}
              style={s.proofImage}
              contentFit="contain"
            />
          </>
        ) : (
          <>
            <Text style={s.sectionLabel}>Submitted Document</Text>
            <View style={s.noProofBox}>
              <Ionicons name="document-outline" size={24} color="#ccc" />
              <Text style={s.noProofText}>No document submitted</Text>
            </View>
          </>
        )}

        {/* Actions */}
        {isPending && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.approveBtn, working && s.btnDisabled]}
              onPress={approveClaim}
              disabled={working}
              activeOpacity={0.85}
            >
              {working
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={s.approveBtnText}>Approve Claim</Text>
                  </>
                )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.rejectBtn, working && s.btnDisabled]}
              onPress={rejectClaim}
              disabled={working}
              activeOpacity={0.85}
            >
              <Ionicons name="close-circle-outline" size={18} color="#e53e3e" />
              <Text style={s.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ router }: { router: any }) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color="#111" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Review Claim</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Ionicons name={icon as any} size={15} color="#aaa" />
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111', textAlign: 'center' },

  content: { padding: 16 },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  statusApproved:     { backgroundColor: '#e6f9f2', borderWidth: 1, borderColor: '#a7dfc9' },
  statusRejected:     { backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fca5a5' },
  statusText:         { fontSize: 13, fontWeight: '600' },
  statusTextApproved: { color: GREEN },
  statusTextRejected: { color: '#e53e3e' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 16, marginBottom: 8,
  },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoValue: { fontSize: 15, fontWeight: '700', color: '#111' },
  infoSub:   { fontSize: 13, color: '#aaa', marginTop: 2 },

  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailLabel: { fontSize: 13, color: '#aaa', width: 72 },
  detailValue: { flex: 1, fontSize: 14, color: '#111', fontWeight: '500' },

  messageCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  messageText: { fontSize: 14, color: '#444', lineHeight: 21 },

  proofImage: {
    width: '100%', height: 220, borderRadius: 14,
    backgroundColor: '#f0f0f0',
  },
  noProofBox: {
    backgroundColor: '#fff', borderRadius: 14, padding: 24,
    alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#f0f0f0', borderStyle: 'dashed',
  },
  noProofText: { fontSize: 13, color: '#ccc' },

  actions: { gap: 12, marginTop: 24 },
  approveBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  approveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rejectBtn: {
    borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 14,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff5f5',
  },
  rejectBtnText: { color: '#e53e3e', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },

  // Rejection modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 8 },
  modalSubtitle: { fontSize: 13, color: '#888', lineHeight: 19, marginBottom: 16 },
  modalInput: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#111', backgroundColor: '#fafafa',
    minHeight: 80, marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#666' },
  modalRejectBtn: {
    flex: 1, backgroundColor: '#fff5f5', borderWidth: 1.5, borderColor: '#fca5a5',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  modalRejectText: { fontSize: 15, fontWeight: '700', color: '#e53e3e' },
});
