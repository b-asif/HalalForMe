import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { formatError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { setGuestLoginIntent } from '../lib/guestLoginIntent';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const AMBER = Brand.amber;
const RED   = Brand.red;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

type SubmissionStatus = 'pending' | 'approved' | 'rejected';

interface Submission {
  id: string;
  name: string;
  address: string;
  cuisine_type: string | null;
  status: SubmissionStatus;
  reviewer_notes: string | null;
  created_at: string;
}

const STATUS_CFG: Record<SubmissionStatus, { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  pending:  { label: 'Pending Review', color: AMBER, icon: 'time-outline' },
  approved: { label: 'Approved',       color: GREEN, icon: 'checkmark-circle' },
  rejected: { label: 'Not Approved',   color: RED,   icon: 'close-circle' },
};

export default function MySubmissionsScreen() {
  const router   = useRouter();
  const { user } = useAuth();

  const [rows,    setRows]    = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('submissions')
      .select('id, name, address, cuisine_type, status, reviewer_notes, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (err) setError(formatError(err));
    else setRows((data as Submission[]) ?? []);

    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (!user) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
          <Text style={s.title}>My Submissions</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.centered}>
          <Ionicons name="storefront-outline" size={56} color={TEXT_MUTED} />
          <Text style={s.emptyTitle}>Sign in to see your submissions</Text>
          <Text style={s.emptyText}>Restaurants you've submitted will appear here once you're signed in.</Text>
          <TouchableOpacity style={s.signInBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}>
            <Text style={s.signInText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>My Submissions</Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => router.push('/submit-restaurant')}
        >
          <Ionicons name="add" size={22} color={GREEN} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={36} color={TEXT_MUTED} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="storefront-outline" size={52} color={TEXT_MUTED} />
          <Text style={s.emptyTitle}>No submissions yet</Text>
          <Text style={s.emptyText}>
            Know a halal restaurant? Add it and we'll verify it for the community.
          </Text>
          <TouchableOpacity
            style={s.submitBtn}
            onPress={() => router.push('/submit-restaurant')}
          >
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={s.submitBtnText}>Submit a Restaurant</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.pending;
            return (
              <View style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.cardInfo}>
                    <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
                    {item.cuisine_type && (
                      <Text style={s.cardCuisine}>{item.cuisine_type}</Text>
                    )}
                    <Text style={s.cardAddress} numberOfLines={1}>{item.address}</Text>
                    <Text style={s.cardDate}>Submitted {formatDate(item.created_at)}</Text>
                  </View>

                  <View style={[s.badge, { backgroundColor: cfg.color + '18', borderColor: cfg.color }]}>
                    <Ionicons name={cfg.icon} size={13} color={cfg.color} />
                    <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>

                {item.status === 'approved' && (
                  <View style={s.approvedNote}>
                    <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                    <Text style={s.approvedNoteText}>Now live on Rihdal</Text>
                  </View>
                )}

                {item.status === 'rejected' && item.reviewer_notes && (
                  <View style={s.rejectedNote}>
                    <Text style={s.rejectedNoteLabel}>Reviewer note:</Text>
                    <Text style={s.rejectedNoteText}>{item.reviewer_notes}</Text>
                  </View>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CREAM, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE, gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardInfo: { flex: 1, gap: 2 },
  cardName:    { fontSize: 16, fontWeight: '700', color: TEXT_DARK },
  cardCuisine: { fontSize: 13, color: TEXT_MUTED },
  cardAddress: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  cardDate:    { fontSize: 11, color: TEXT_MUTED, marginTop: 4 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 5,
    alignSelf: 'flex-start', flexShrink: 0,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },

  approvedNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  approvedNoteText: { fontSize: 12, color: GREEN, fontWeight: '600' },

  rejectedNote: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  rejectedNoteLabel: { fontSize: 11, color: TEXT_MUTED, fontWeight: '600', marginBottom: 2 },
  rejectedNoteText:  { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },

  errorText:  { fontSize: 14, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn:   { marginTop: 4, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, backgroundColor: DEEP_GREEN },
  retryText:  { fontSize: 13, color: '#fff', fontWeight: '700' },

  emptyTitle: { fontSize: 18, fontWeight: '700', color: TEXT_MUTED },
  emptyText:  { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  signInBtn: { marginTop: 8, backgroundColor: DEEP_GREEN, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 14 },
  signInText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 24, marginTop: 8,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
