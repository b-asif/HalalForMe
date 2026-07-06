import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { formatError } from '../../lib/errors';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const RED   = Brand.red;
const AMBER = Brand.amber;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [focused,         setFocused]         = useState<'password' | 'confirm' | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

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

  const handleUpdate = async () => {
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(formatError(err));
      return;
    }

    // Sign out so the user logs in fresh with their new password
    await supabase.auth.signOut();
    setGuestLoginIntent(true);
    router.replace('/(auth)/login');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="key-outline" size={40} color={GREEN} />
        </View>

        <Text style={styles.heading}>Create new password</Text>
        <Text style={styles.subheading}>
          Choose something strong that you haven't used before.
        </Text>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={RED} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* New password */}
        <Text style={styles.label}>New Password</Text>
        <View style={[styles.passwordRow, focused === 'password' && styles.inputFocused]}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Min. 6 characters"
            placeholderTextColor={TEXT_MUTED}
            value={password}
            onChangeText={v => { setPassword(v); setError(null); }}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            returnKeyType="next"
          />
          <TouchableOpacity
            onPress={() => setShowPassword(p => !p)}
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

        {/* Strength meter */}
        {password.length > 0 && (
          <View style={styles.strengthRow}>
            <View style={styles.strengthBars}>
              {[1, 2, 3, 4].map(i => (
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

        {/* Confirm password */}
        <Text style={styles.label}>Confirm Password</Text>
        <View style={[styles.passwordRow, focused === 'confirm' && styles.inputFocused]}>
          <TextInput
            style={styles.passwordInput}
            placeholder="••••••••"
            placeholderTextColor={TEXT_MUTED}
            value={confirmPassword}
            onChangeText={v => { setConfirmPassword(v); setError(null); }}
            onFocus={() => setFocused('confirm')}
            onBlur={() => setFocused(null)}
            secureTextEntry={!showConfirm}
            returnKeyType="done"
            onSubmitEditing={handleUpdate}
          />
          <TouchableOpacity
            onPress={() => setShowConfirm(p => !p)}
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

        {/* Match indicator */}
        {confirmPassword.length > 0 && (
          <View style={styles.matchRow}>
            <Ionicons
              name={password === confirmPassword ? 'checkmark-circle' : 'close-circle'}
              size={15}
              color={password === confirmPassword ? GREEN : RED}
            />
            <Text style={[
              styles.matchText,
              { color: password === confirmPassword ? GREEN : RED },
            ]}>
              {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleUpdate}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Update Password</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  container: { flexGrow: 1, padding: 24, paddingTop: 64, justifyContent: 'center' },

  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, alignSelf: 'flex-start',
    shadowColor: GREEN, shadowOpacity: 0.15, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },

  heading:    { fontSize: 28, fontWeight: '800', color: TEXT_DARK, marginBottom: 10 },
  subheading: { fontSize: 15, color: TEXT_MUTED, lineHeight: 22, marginBottom: 28 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: RED, lineHeight: 18 },

  label: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED, marginBottom: 7 },

  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 14,
    backgroundColor: CREAM, marginBottom: 10,
  },
  inputFocused: { borderColor: GREEN, backgroundColor: '#fff' },
  passwordInput: {
    flex: 1, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: TEXT_DARK,
  },
  eyeBtn: { paddingHorizontal: 14 },

  strengthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
  },
  strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar:  { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '600', width: 44, textAlign: 'right' },

  matchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20, marginTop: 4,
  },
  matchText: { fontSize: 13, fontWeight: '500' },

  button: {
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
