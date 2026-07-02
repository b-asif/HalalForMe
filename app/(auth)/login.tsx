import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { getGuestLoginIntent } from '../../lib/guestLoginIntent';

const GREEN = '#245737';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // All hooks must come before any conditional returns (Rules of Hooks)
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused]         = useState<'email' | 'password' | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  // Track intent as state so re-focus triggers a re-render check
  const [hasIntent, setHasIntent]     = useState(() => getGuestLoginIntent());

  // Fires every time this screen is focused — including cold start, background→foreground,
  // and Expo Router restoring a stale nav state. If there's no explicit intent to be here,
  // dispatch a full stack reset so login is completely removed from history.
  useFocusEffect(useCallback(() => {
    const intent = getGuestLoginIntent();
    setHasIntent(intent);
    if (!intent) {
      router.replace('/(tabs)');
    }
  }, [router]));

  const canGoBack = router.canGoBack();

  // Don't render the login UI while the reset navigation is in flight
  if (!hasIntent) return null;

  const handleLogin = async () => {
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (authError) {
      if (authError.message.toLowerCase().includes('invalid login')) {
        setError('Incorrect email or password. Please try again.');
      } else if (authError.message.toLowerCase().includes('email not confirmed')) {
        await supabase.auth.resend({ type: 'signup', email: email.trim() });
        router.push({
          pathname: '/(auth)/verify-otp',
          params: { email: email.trim(), type: 'signup' },
        });
      } else {
        setError(authError.message);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    // On success, _layout.tsx redirect fires automatically via onAuthStateChange
  };

  return (
    <View style={styles.flex}>
    {canGoBack && (
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => router.back()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={20} color="#555" />
      </TouchableOpacity>
    )}
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
          <Text style={styles.appName}>HalalForMe</Text>
          <Text style={styles.tagline}>Find halal food near you</Text>
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.heading}>Welcome back</Text>

          {/* Inline error banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color="#c0392b" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Email */}
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, focused === 'email' && styles.inputFocused]}
            placeholder="you@example.com"
            placeholderTextColor="#bbb"
            value={email}
            onChangeText={(v) => { setEmail(v); setError(null); }}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
          />

          {/* Password label + forgot link on same row */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>Password</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.passwordRow, focused === 'password' && styles.inputFocused]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="••••••••"
              placeholderTextColor="#bbb"
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((p) => !p)}
              style={styles.eyeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#aaa"
              />
            </TouchableOpacity>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Log In</Text>}
          </TouchableOpacity>

          {/* Switch to sign up */}
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity style={styles.switchRow}>
              <Text style={styles.switchText}>
                Don't have an account?{'  '}
                <Text style={styles.switchLink}>Sign Up</Text>
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
  flex: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  logoSection: { alignItems: 'center', marginBottom: 24 },
  logoImage: { width: 90, height: 90, marginBottom: 10, borderRadius: 20, overflow: 'hidden' },
  appName: { fontSize: 28, fontWeight: '800', color: '#245737', letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: '#999', marginTop: 4 },

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  heading: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 20 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fdf2f2', borderWidth: 1, borderColor: '#f5c6c6',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: '#c0392b', lineHeight: 18 },

  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  label: { fontSize: 13, fontWeight: '600', color: '#555' },
  forgotLink: { fontSize: 13, color: '#245737', fontWeight: '600' },
  input: {
    borderWidth: 1.5, borderColor: '#ebebeb', borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 14,
    fontSize: 15, color: '#111', marginBottom: 16, backgroundColor: '#fafafa',
  },
  inputFocused: { borderColor: GREEN, backgroundColor: '#fff' },

  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#ebebeb', borderRadius: 14,
    backgroundColor: '#fafafa', marginBottom: 20,
  },
  passwordInput: {
    flex: 1, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: '#111',
  },
  eyeBtn: { paddingHorizontal: 14 },

  button: {
    backgroundColor: '#245737', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  switchRow: { alignItems: 'center', paddingVertical: 4 },
  switchText: { fontSize: 14, color: '#888' },
  switchLink: { color: '#245737', fontWeight: '700' },

  backBtn: {
    position: 'absolute', left: 16, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
});
