import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { getGuestLoginIntent } from '../../lib/guestLoginIntent';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const RED   = Brand.red;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const RESEND_COOLDOWN = 60;

// Module-level: persists across remounts so navigate-away doesn't reset the timer.
// Keyed by email so cooldowns don't bleed across different auth flows (e.g. signup
// then forgot-password in the same session).
const cooldownMap: Record<string, number> = {};

function getRemainingCooldown(email: string) {
  return Math.max(0, Math.ceil(((cooldownMap[email] ?? 0) - Date.now()) / 1000));
}

export default function VerifyOtpScreen() {
  const { email, type, redirect } = useLocalSearchParams<{ email: string; type: string; redirect?: string }>();
  const router     = useRouter();
  const navigation = useNavigation();

  const [hasIntent, setHasIntent] = useState(() => getGuestLoginIntent());

  useFocusEffect(useCallback(() => {
    const intent = getGuestLoginIntent();
    setHasIntent(intent);
    if (!intent) {
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: '(tabs)' }] }));
    }
  }, [navigation]));

  const [digits, setDigits]           = useState(['', '', '', '', '', '']);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [cooldown, setCooldown]       = useState(() => getRemainingCooldown(email ?? ''));
  const [resending, setResending]     = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async (codeOverride?: string) => {
    const code = codeOverride ?? digits.join('');
    if (code.length < 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email!,
      token: code,
      type: (type === 'recovery' ? 'recovery' : type === 'signup' ? 'signup' : 'email') as any,
    });
    setLoading(false);
    if (err) {
      setError('Invalid or expired code. Try again or request a new one.');
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } else if (redirect) {
      // Password reset flow — navigate explicitly instead of relying on auth redirect
      router.replace(redirect as any);
    }
    // For signup flow with no redirect, AuthContext fires → layout redirects automatically
  };

  const handleDigitChange = (value: string, index: number) => {
    // Handle paste: distribute all digits across boxes
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, 6);
      if (!pasted.length) return;
      const next = Array(6).fill('').map((_, i) => pasted[i] ?? '');
      setDigits(next);
      const focusIdx = Math.min(pasted.length - 1, 5);
      inputRefs.current[focusIdx]?.focus();
      if (pasted.length === 6) handleVerify(pasted);
      return;
    }

    const digit = value.replace(/\D/g, '');
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError(null);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-submit when last box filled
    if (digit && index === 5) {
      const full = [...next.slice(0, 5), digit].join('');
      if (full.length === 6) handleVerify(full);
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    if (type === 'recovery') {
      await supabase.auth.resetPasswordForEmail(email!);
    } else {
      await supabase.auth.resend({ type: 'signup', email: email! });
    }
    setResending(false);
    cooldownMap[email!] = Date.now() + RESEND_COOLDOWN * 1000;
    setCooldown(RESEND_COOLDOWN);
    setDigits(['', '', '', '', '', '']);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  const code = digits.join('');

  if (!hasIntent) return null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="mail-open-outline" size={44} color={GREEN} />
        </View>

        <Text style={styles.title}>
          {type === 'email' ? 'Reset your password' : 'Check your email'}
        </Text>
        <Text style={styles.subtitle}>
          {type === 'email'
            ? 'Enter the 6-digit code we sent to'
            : 'We sent a 6-digit code to'}{'\n'}
          <Text style={styles.emailText}>{email}</Text>
        </Text>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={RED} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* OTP boxes */}
        <View style={styles.otpRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={ref => { inputRefs.current[i] = ref; }}
              style={[
                styles.otpBox,
                d      && styles.otpBoxFilled,
                error  && styles.otpBoxError,
              ]}
              value={d}
              onChangeText={v => handleDigitChange(v, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={6}
              selectTextOnFocus
              textAlign="center"
              caretHidden
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, (loading || code.length < 6) && styles.buttonDisabled]}
          onPress={() => handleVerify()}
          disabled={loading || code.length < 6}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Verify Email</Text>}
        </TouchableOpacity>

        <View style={styles.resendRow}>
          <Text style={styles.resendLabel}>Didn't receive it?{'  '}</Text>
          {cooldown > 0 ? (
            <Text style={styles.cooldownText}>Resend in {cooldown}s</Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              {resending
                ? <ActivityIndicator size="small" color={GREEN} />
                : <Text style={styles.resendLink}>Resend code</Text>}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={15} color={TEXT_MUTED} />
          <Text style={styles.backText}>
            {type === 'email' ? 'Back to login' : 'Use a different email'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },

  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    shadowColor: GREEN, shadowOpacity: 0.2, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },

  title: { fontSize: 26, fontWeight: '800', color: TEXT_DARK, marginBottom: 10 },
  subtitle: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  emailText: { fontWeight: '700', color: TEXT_DARK },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: 10, padding: 12, marginBottom: 20, alignSelf: 'stretch',
  },
  errorText: { flex: 1, fontSize: 13, color: RED, lineHeight: 18 },

  otpRow: {
    flexDirection: 'row', gap: 10, marginBottom: 28,
  },
  otpBox: {
    width: 46, height: 56, borderRadius: 12,
    borderWidth: 2, borderColor: HAIRLINE,
    backgroundColor: '#fff', fontSize: 22, fontWeight: '700', color: TEXT_DARK,
  },
  otpBoxFilled: { borderColor: GREEN, backgroundColor: '#f0faf6' },
  otpBoxError:  { borderColor: RED, backgroundColor: '#fff5f5' },

  button: {
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, alignSelf: 'stretch',
    alignItems: 'center', marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  resendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  resendLabel: { fontSize: 14, color: TEXT_MUTED },
  cooldownText: { fontSize: 14, color: TEXT_MUTED, fontWeight: '600' },
  resendLink: { fontSize: 14, color: GREEN, fontWeight: '700' },

  backRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  backText: { fontSize: 13, color: TEXT_MUTED },
});
