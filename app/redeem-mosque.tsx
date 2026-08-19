import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

interface OwnedMosque { id: string; name: string }

export default function RedeemMosqueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // A code, once redeemed, grants permanent ownership (mosques.owner_id) —
  // there was nothing here checking for that, so this screen re-prompted
  // for a code every time even for someone who already manages a mosque.
  // Re-checked on every focus (not just mount) so redeeming a code and
  // coming straight back here reflects the new ownership immediately.
  const [checkingOwnership, setCheckingOwnership] = useState(true);
  const [ownedMosques, setOwnedMosques] = useState<OwnedMosque[]>([]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setCheckingOwnership(false); setOwnedMosques([]); return; }
      setCheckingOwnership(true);
      const { data, error } = await supabase
        .from('mosques')
        .select('id, name')
        .eq('owner_id', user.id);
      if (cancelled) return;
      if (error) { setCheckingOwnership(false); return; }

      const rows = (data as OwnedMosque[]) ?? [];
      if (rows.length === 1) {
        // manage.tsx's [id] is the mosques table UUID, not the OSM id.
        router.replace(`/mosque/${rows[0].id}/manage`);
        return; // navigating away — leave checkingOwnership true, no flash of the form
      }
      setOwnedMosques(rows);
      setCheckingOwnership(false);
    })();
    return () => { cancelled = true; };
  }, [user, router]));

  const handleRedeem = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please log in to manage a mosque page.');
      return;
    }
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert('Code required', 'Enter the invite code you were given.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: mosqueId, error } = await supabase.rpc('redeem_mosque_invite', { p_code: trimmed });
      if (error) throw new Error(error.message);
      if (!mosqueId) throw new Error('Invalid or already-used code.');

      // Notify admin — fire-and-forget, same pattern as restaurant claim/submission.
      supabase.functions.invoke('notify-admin', {
        body: { type: 'mosque_claimed', link_id: mosqueId },
      }).catch((err: unknown) => console.warn('notify-admin failed:', err));

      Alert.alert('Success', "You're now the manager of this mosque's page.", [
        { text: 'OK', onPress: () => router.replace(`/mosque/${mosqueId}/manage`) },
      ]);
    } catch (e: any) {
      Alert.alert('Invalid Code', e.message ?? 'That code is invalid or has already been used.');
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingOwnership) {
    return (
      <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Manage a Mosque</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={s.content}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  // Rare (a person managing more than one mosque), but handled rather than
  // silently only ever navigating to the first one found.
  if (ownedMosques.length > 1) {
    return (
      <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Manage a Mosque</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={[s.content, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={s.subtitle}>Choose which mosque to manage:</Text>
          {ownedMosques.map(m => (
            <TouchableOpacity
              key={m.id}
              style={s.mosqueRow}
              onPress={() => router.push(`/mosque/${m.id}/manage`)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="mosque" size={20} color={GREEN} />
              <Text style={s.mosqueRowText} numberOfLines={1}>{m.name}</Text>
              <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Manage a Mosque</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={s.iconWrap}>
            <MaterialCommunityIcons name="mosque" size={32} color={GREEN} />
          </View>
          <Text style={s.title}>Enter Invite Code</Text>
          <Text style={s.subtitle}>
            If Rihdal has partnered with your mosque, you'll have received a short invite code to claim and manage its page — events, announcements, and prayer times.
          </Text>

          <TextInput
            style={s.input}
            placeholder="e.g. 7K3PQXM2"
            placeholderTextColor={TEXT_MUTED}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
          />

          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitBtnDisabled]}
            onPress={handleRedeem}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitBtnText}>Redeem Code</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },

  content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800', color: TEXT_DARK, marginBottom: 8 },
  subtitle: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 28 },

  input: {
    width: '100%', backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 20, fontWeight: '700', color: TEXT_DARK, textAlign: 'center',
    letterSpacing: 3, marginBottom: 16,
  },
  submitBtn: {
    width: '100%', backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  mosqueRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginTop: 10,
  },
  mosqueRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: TEXT_DARK },
});
