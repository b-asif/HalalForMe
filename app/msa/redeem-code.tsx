/**
 * /msa/redeem-code
 *
 * Lets a user enter an 8-character claim code that a Rihdal admin sent them.
 * On success, the user becomes an active MSA admin and is routed to the dashboard.
 */

import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

export default function RedeemCodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [code, setCode]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRedeem = async () => {
    const trimmed = code.trim().toUpperCase().replace(/-/g, '');
    if (trimmed.length < 8) {
      Alert.alert('Code required', 'Enter the full 8-character code you received.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('redeem_msa_claim_code', { p_code: trimmed });
      if (error) throw new Error(error.message.replace('ERROR: ', ''));

      const msaId = (data as any)?.msaId ?? '';
      Alert.alert('Access granted!', "You're now an admin of your MSA's page.", [
        { text: 'Open Dashboard', onPress: () => router.replace({ pathname: '/(msa)/dashboard' as any, params: { activeMsaId: msaId } }) },
      ]);
    } catch (e: any) {
      Alert.alert('Invalid Code', e.message ?? 'That code is invalid or has already been used.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Claim MSA Page</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={s.iconWrap}>
            <Ionicons name="key-outline" size={32} color={GREEN} />
          </View>
          <Text style={s.title}>Enter Claim Code</Text>
          <Text style={s.subtitle}>
            If we've verified your MSA, we'll have sent you an 8-character code via email or Instagram DM. Enter it below to claim your page.
          </Text>

          <TextInput
            style={s.input}
            placeholder="e.g. AB12CD34"
            placeholderTextColor={TEXT_MUTED}
            value={code}
            onChangeText={t => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
            autoFocus
          />

          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitBtnDisabled]}
            onPress={handleRedeem}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitBtnText}>Claim Page</Text>}
          </TouchableOpacity>

          <Text style={s.hint}>
            Don't have a code? Submit an access request from the Campus Hub and we'll send one once your MSA is verified.
          </Text>
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
  subtitle: {
    fontSize: 14, color: TEXT_MUTED, textAlign: 'center',
    lineHeight: 20, marginBottom: 28,
  },

  input: {
    width: '100%', backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 20, fontWeight: '700', color: TEXT_DARK, textAlign: 'center',
    letterSpacing: 4, marginBottom: 16,
  },
  submitBtn: {
    width: '100%', backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  hint: {
    fontSize: 13, color: TEXT_MUTED, textAlign: 'center',
    lineHeight: 18, marginTop: 20,
  },
});
