import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';

import { Link, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { getGuestLoginIntent, setBusinessSignupIntent } from '../../lib/guestLoginIntent';

import { Brand } from '../../lib/theme';

const CREAM = Brand.cream;
const GREEN = Brand.green;
const GOLD  = Brand.gold;
const RED   = Brand.red;
const AMBER = Brand.amber;
const DARK_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

type FocusedField = 'name' | 'email' | 'password' | 'confirm' | null;

export default function SignupScreen() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();

  const [hasIntent, setHasIntent] = useState(() => getGuestLoginIntent());

  useFocusEffect(useCallback(() => {
    const intent = getGuestLoginIntent();
    setHasIntent(intent);
    if (!intent) {
      router.replace('/(tabs)');
    }
  }, [router]));

  const canGoBack = router.canGoBack();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focused, setFocused] = useState<FocusedField>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms,    setAgreedToTerms]    = useState(false);
  const [isBusinessOwner,  setIsBusinessOwner]  = useState(false);

  const clearError = () => setError(null);

  const passwordStrength = (() => {
    if (password.length === 0) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][passwordStrength];
  const strengthColor = [HAIRLINE, RED, AMBER, '#3b82f6', GREEN][passwordStrength];

  const handleSignup = async () => {
    setError(null);

    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (passwordStrength <= 1) { setError('Password is too weak. Add uppercase letters, numbers, or symbols.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!agreedToTerms) { setError('Please agree to the Terms of Service and Privacy Policy.'); return; }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim(), tos_accepted_at: new Date().toISOString() } },
      });

      setLoading(false);

      if (authError) {
        if (authError.message.toLowerCase().includes('already registered')) {
          setError('An account with this email already exists. Try logging in.');
        } else {
          setError(authError.message);
        }
        setLoading(false);
      } else {
        setBusinessSignupIntent(isBusinessOwner);
        router.replace({
          pathname: '/(auth)/verify-otp',
          params: { email: email.trim(), type: 'signup' },
        });
      }
    } catch (e: any) {
      setLoading(false);
      setError(e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  if (!hasIntent) return null;

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button in flow */}
        {canGoBack && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={20} color={CREAM} />
          </TouchableOpacity>
        )}
        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
          <Text style={styles.appName}>Rihdal</Text>
          <Text style={styles.tagline}>Guide Your Journey</Text>
          <View style={styles.taglineDivider} />
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.heading}>Create account</Text>

          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color={RED} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={[styles.input, focused === 'name' && styles.inputFocused]}
            placeholder="Aisha Khan"
            placeholderTextColor={TEXT_MUTED}
            value={name}
            onChangeText={(v) => { setName(v); clearError(); }}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="next"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, focused === 'email' && styles.inputFocused]}
            placeholder="you@example.com"
            placeholderTextColor={TEXT_MUTED}
            value={email}
            onChangeText={(v) => { setEmail(v); clearError(); }}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
          />

          <Text style={styles.label}>Password</Text>
          <View style={[styles.passwordRow, focused === 'password' && styles.inputFocused]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Min. 8 characters"
              placeholderTextColor={TEXT_MUTED}
              value={password}
              onChangeText={(v) => { setPassword(v); clearError(); }}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              returnKeyType="next"
            />
            <TouchableOpacity
              onPress={() => setShowPassword((p) => !p)}
              style={styles.eyeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={TEXT_MUTED}
              />
            </TouchableOpacity>
          </View>

          {password.length > 0 && (
            <View style={styles.strengthRow}>
              <View style={styles.strengthBars}>
                {[1, 2, 3, 4].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.strengthBar,
                      { backgroundColor: i <= passwordStrength ? strengthColor : HAIRLINE },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.strengthLabel, { color: strengthColor }]}>
                {strengthLabel}
              </Text>
            </View>
          )}

          <Text style={styles.label}>Confirm Password</Text>
          <View style={[styles.passwordRow, focused === 'confirm' && styles.inputFocused]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="••••••••"
              placeholderTextColor={TEXT_MUTED}
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); clearError(); }}
              onFocus={() => setFocused('confirm')}
              onBlur={() => setFocused(null)}
              secureTextEntry={!showConfirm}
              returnKeyType="done"
              onSubmitEditing={handleSignup}
            />
            <TouchableOpacity
              onPress={() => setShowConfirm((p) => !p)}
              style={styles.eyeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={TEXT_MUTED}
              />
            </TouchableOpacity>
          </View>

          {/* Business / masjid owner toggle */}
          <TouchableOpacity
            style={styles.businessRow}
            onPress={() => setIsBusinessOwner(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, isBusinessOwner && styles.checkboxChecked]}>
              {isBusinessOwner && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.businessLabel}>I'm registering as a business or masjid</Text>
              <Text style={styles.businessSub}>Restaurant, cafe, masjid, or other halal business</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.agreeRow}
            onPress={() => setAgreedToTerms(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
              {agreedToTerms && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <Text style={styles.agreeText}>
              I agree to the{' '}
              <Text style={styles.agreeLink} onPress={() => router.push('/terms-of-service')}>
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text style={styles.agreeLink} onPress={() => router.push('/privacy-policy')}>
                Privacy Policy
              </Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (loading || !agreedToTerms) && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading || !agreedToTerms}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Create Account</Text>}
          </TouchableOpacity>

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.switchRow}>
              <Text style={styles.switchText}>
                Already have an account?{'  '}
                <Text style={styles.switchLink}>Log In</Text>
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>

    </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: DARK_GREEN },
  container: { flexGrow: 1, padding: 24, paddingTop: 16, paddingBottom: 40 },

  logoSection: { alignItems: 'center', marginBottom: 20 },
  logoImage: { width: 72, height: 72, marginBottom: 8, borderRadius: 16 },
  appName: { fontSize: 20, fontWeight: '800', color: CREAM, letterSpacing: 7, textTransform: 'uppercase', textAlign: 'center', paddingLeft: 7 },
  tagline: { fontSize: 10, color: GOLD, letterSpacing: 4, textTransform: 'uppercase', marginTop: 5, paddingLeft: 4 },
  taglineDivider: { width: 36, height: 1.5, backgroundColor: GOLD, marginTop: 8, borderRadius: 1 },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  heading: { fontSize: 20, fontWeight: '700', color: TEXT_DARK, marginBottom: 16 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: RED, lineHeight: 18 },

  label: { fontSize: 12, fontWeight: '600', color: TEXT_MUTED, marginBottom: 5 },
  input: {
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 14,
    fontSize: 14, color: TEXT_DARK, marginBottom: 12, backgroundColor: CREAM,
  },
  inputFocused: { borderColor: GREEN, backgroundColor: '#fff' },

  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 12,
    backgroundColor: CREAM, marginBottom: 8,
  },
  passwordInput: {
    flex: 1, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: TEXT_DARK,
  },
  eyeBtn: { paddingHorizontal: 14 },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '600', width: 44, textAlign: 'right' },

  businessRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#f0faf6', borderWidth: 1.5, borderColor: '#c3e8d8',
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  businessLabel: { fontSize: 13, fontWeight: '600', color: TEXT_DARK },
  businessSub:   { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },

  agreeRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 4, marginBottom: 14,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: TEXT_MUTED,
    backgroundColor: '#fff', flexShrink: 0, marginTop: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: GREEN, borderColor: GREEN },
  agreeText: { flex: 1, fontSize: 13, color: TEXT_MUTED, lineHeight: 20 },
  agreeLink: { color: GREEN, fontWeight: '600' },

  button: {
    backgroundColor: DARK_GREEN, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  switchRow: { alignItems: 'center', paddingVertical: 4 },
  switchText: { fontSize: 14, color: TEXT_MUTED },
  switchLink: { color: DARK_GREEN, fontWeight: '700' },

  backBtn: {
    alignSelf: 'flex-start',
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
});

