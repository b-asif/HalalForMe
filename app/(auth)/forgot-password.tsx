import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { formatError } from '../../lib/errors';
import { getGuestLoginIntent } from '../../lib/guestLoginIntent';

const GREEN = '#245737';

export default function ForgotPasswordScreen() {
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

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: 'halalforme://reset-password',
      });

      if (err) {
        setError(formatError(err));
        return;
      }

      router.push({
      pathname: "/(auth)/verify-otp",
      params: {
        email: trimmed,
        type: "recovery",
        redirect: "/(auth)/reset-password",
      },
    });
  } catch (e) {
      setError('Unexpected error sending reset code. Please try again.');
  } finally {
      setLoading(false);
  }
  };

  if (!hasIntent) return null;

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
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#555" />
        </TouchableOpacity>

        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="lock-open-outline" size={40} color={GREEN} />
        </View>

        <Text style={styles.heading}>Forgot password?</Text>
        <Text style={styles.subheading}>
          Enter the email linked to your account and we'll send you a reset code.
        </Text>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#c0392b" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={[styles.input, focused && styles.inputFocused]}
          placeholder="you@example.com"
          placeholderTextColor="#bbb"
          value={email}
          onChangeText={v => { setEmail(v); setError(null); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="done"
          onSubmitEditing={handleSend}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Send Reset Code</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginRow} onPress={() => router.back()}>
          <Text style={styles.loginText}>
            Remembered it?{'  '}
            <Text style={styles.loginLink}>Back to Log In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { flexGrow: 1, padding: 24, paddingTop: 60 },

  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, alignSelf: 'flex-start',
    shadowColor: GREEN, shadowOpacity: 0.15, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },

  heading: { fontSize: 28, fontWeight: '800', color: '#111', marginBottom: 10 },
  subheading: { fontSize: 15, color: '#777', lineHeight: 22, marginBottom: 28 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fdf2f2', borderWidth: 1, borderColor: '#f5c6c6',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: '#c0392b', lineHeight: 18 },

  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 7 },
  input: {
    borderWidth: 1.5, borderColor: '#ebebeb', borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 14,
    fontSize: 15, color: '#111', marginBottom: 20, backgroundColor: '#fafafa',
  },
  inputFocused: { borderColor: GREEN, backgroundColor: '#fff' },

  button: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  loginRow: { alignItems: 'center', paddingVertical: 4 },
  loginText: { fontSize: 14, color: '#888' },
  loginLink: { color: GREEN, fontWeight: '700' },
});
