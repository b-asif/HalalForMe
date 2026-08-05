import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

// Required by expo-web-browser on Android to complete the auth session
// when the app is resumed from the browser.
WebBrowser.maybeCompleteAuthSession();

// Must match the redirect URL added in Supabase → Auth → URL Configuration
const REDIRECT_URI = 'halalforme://auth-callback';

/**
 * Opens Google OAuth in an in-app browser, waits for the redirect,
 * then exchanges the auth code for a Supabase session.
 * Returns an error message string on failure, null on success or user cancel.
 */
export async function signInWithGoogle(): Promise<string | null> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: REDIRECT_URI,
      skipBrowserRedirect: true, // we open the browser manually below
    },
  });

  if (error || !data.url) {
    return error?.message ?? 'Could not start Google sign-in.';
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URI);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return null; // user cancelled — not an error
  }

  if (result.type === 'success') {
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
    return sessionError?.message ?? null;
  }

  return 'Something went wrong. Please try again.';
}

/**
 * Triggers native Apple Sign-In (iOS only), then exchanges the
 * Apple identity token for a Supabase session.
 * Returns an error message string on failure, null on success or user cancel.
 */
export async function signInWithApple(): Promise<string | null> {
  if (Platform.OS !== 'ios') {
    return 'Apple Sign-In is only available on iOS.';
  }

  try {
    const AppleAuth = await import('expo-apple-authentication');

    const isAvailable = await AppleAuth.isAvailableAsync();
    if (!isAvailable) {
      return 'Apple Sign-In is not available on this device.';
    }

    const credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return 'Apple Sign-In failed — no identity token received.';
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    return error?.message ?? null;
  } catch (e: any) {
    // ERR_REQUEST_CANCELED = user dismissed the Apple sheet
    if (e.code === 'ERR_REQUEST_CANCELED') return null;
    return e.message ?? 'Apple Sign-In failed.';
  }
}
