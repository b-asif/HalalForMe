import { useEffect, useRef, useState } from 'react';
import {
  Animated, Image, Modal, Platform, StyleSheet, Text, View,
} from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { MsaProvider } from '../contexts/MsaContext';
import UpdateBanner from '../components/UpdateBanner';
import { Brand } from '../lib/theme';
import { getGuestLoginIntent, setGuestLoginIntent, getGuestOnboardingSeen, getOnboardingSeenThisSession, getBusinessSignupIntent, setBusinessSignupIntent } from '../lib/guestLoginIntent';
import { registerPushToken } from '../lib/notifications';
import * as Notifications from 'expo-notifications';

// Side-effect import only — this calls TaskManager.defineTask() at module
// load time, which MUST happen unconditionally on every app launch,
// including background launches the OS uses to run the task itself. It
// cannot be imported lazily from a settings screen or the background
// refresh will silently never fire. See lib/prayer/backgroundRefresh.ts.
import '../lib/prayer/backgroundRefresh';

// Force Expo Router to always start at (tabs), never restoring a stale auth screen
export const unstable_settings = {
  initialRouteName: '(tabs)',
};


SplashScreen.preventAutoHideAsync().catch(() => {});

// ─── Animated loading dots ─────────────────────────────────────────────────────

function LoadingDots() {
  const dot0 = useRef(new Animated.Value(0.25)).current;
  const dot1 = useRef(new Animated.Value(0.25)).current;
  const dot2 = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.25, duration: 350, useNativeDriver: true }),
          Animated.delay(540 - delay),
        ]),
      );

    const a0 = anim(dot0, 0);
    const a1 = anim(dot1, 180);
    const a2 = anim(dot2, 360);
    a0.start(); a1.start(); a2.start();
    return () => { a0.stop(); a1.stop(); a2.stop(); };
  }, []);

  return (
    <View style={sp.dotsRow}>
      {[dot0, dot1, dot2].map((dot, i) => (
        <Animated.View key={i} style={[sp.dot, { opacity: dot }]} />
      ))}
    </View>
  );
}

// ─── Splash — rendered inside a Modal so it's always above native nav layers ──

function SplashOverlay({ show }: { show: boolean }) {
  const fadeOut  = useRef(new Animated.Value(1)).current;
  const scale    = useRef(new Animated.Value(0.86)).current;
  const contentO = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(true);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 58, friction: 10, useNativeDriver: true }),
      Animated.timing(contentO, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  // Exit: fade out then hide Modal
  useEffect(() => {
    if (show) return;
    Animated.timing(fadeOut, {
      toValue: 0,
      duration: 500,
      delay: 80,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }, [show]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View style={[StyleSheet.absoluteFill, sp.root, { opacity: fadeOut }]}>
        <View style={sp.topGlow} />

        <Animated.View
          style={[sp.content, { opacity: contentO, transform: [{ scale }] }]}
        >
          <View style={sp.iconWrap}>
            <Image
              source={require('../assets/icon.png')}
              style={sp.icon}
              resizeMode="cover"
            />
          </View>
          <Text style={sp.title}>Rihdal</Text>
          <Text style={sp.tagline}>Guide Your Journey</Text>
        </Animated.View>

        <LoadingDots />
      </Animated.View>
    </Modal>
  );
}

// ─── Root nav ──────────────────────────────────────────────────────────────────

function RootLayoutNav() {
  const { session, loading, isPasswordRecovery } = useAuth();
  const router   = useRouter();
  const segments = useSegments();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [onboardingChecking, setOnboardingChecking] = useState(false);

  const [appReady, setAppReady] = useState(false);

  // Minimum time before we allow the splash to dismiss.
  // This gives Expo Router enough time to finish restoring persisted navigation
  // state from AsyncStorage — without this, auth loading can complete while
  // segments are still at the default '(tabs)' initial value, causing appReady
  // to be set before the stale auth nav state is restored and redirected away.
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

  // Let the native splash go immediately — our Modal takes over
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => setMinSplashElapsed(true), 200);
    return () => clearTimeout(t);
  }, []);

  // Register push token whenever a user signs in so every signed-in device
  // receives server-side notifications (previously only happened on Notifications screen visit).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const userId = session?.user?.id;
    if (userId) registerPushToken(userId).catch(() => {});
  }, [session?.user?.id]);

  // Handle notification taps — deep-link to the relevant screen.
  // Two cases:
  // 1. App in foreground/background: addNotificationResponseReceivedListener fires immediately.
  // 2. Cold start (app killed): the tap launches the app; getLastNotificationResponseAsync()
  //    catches it once appReady is true and the router can actually navigate.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as Record<string, any>;
      if (data?.type === 'iqama_update' && data?.mosqueOsmId) {
        const encoded = (data.mosqueOsmId as string).replace('/', ':');
        router.push(`/mosque/${encoded}` as any);
      } else if (data?.type === 'campus_notification' && data?.universityId) {
        // Navigate via slug if available, otherwise fall back to the hub
        if (data?.slug) {
          router.push(`/campus/${data.slug}` as any);
        } else {
          router.push('/campus' as any);
        }
      } else if (data?.type === 'msa_approved') {
        router.push('/(msa)/dashboard' as any);
      } else if (data?.type === 'msa_rejected') {
        router.push('/campus' as any);
      }
    };

    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [router]);

  // Cold-start: check if the app was opened by tapping a notification
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!appReady) return;
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, any>;
      if (data?.type === 'iqama_update' && data?.mosqueOsmId) {
        const encoded = (data.mosqueOsmId as string).replace('/', ':');
        router.push(`/mosque/${encoded}` as any);
      } else if (data?.type === 'campus_notification' && data?.universityId) {
        if (data?.slug) {
          router.push(`/campus/${data.slug}` as any);
        } else {
          router.push('/campus' as any);
        }
      } else if (data?.type === 'msa_approved') {
        router.push('/(msa)/dashboard' as any);
      } else if (data?.type === 'msa_rejected') {
        router.push('/campus' as any);
      }
    });
  }, [appReady]);

  // Onboarding check (guests use a shared key; logged-in users use their own).
  // If the user-specific key is missing but the guest key is set, the user saw
  // onboarding as a guest before signing in — treat it as already seen and
  // backfill the user-specific key so future launches are fast.
  useEffect(() => {
    const userId = session?.user?.id;
    const key = userId ? `onboarding_seen_${userId}` : 'onboarding_seen_guest';
    setOnboardingChecking(true);
    AsyncStorage.getItem(key)
      .then(async (v) => {
        if (v === 'true') {
          setHasSeenOnboarding(true);
        } else if (userId) {
          // Fallback: check if user already saw onboarding as a guest on this device
          const guestVal = await AsyncStorage.getItem('onboarding_seen_guest');
          if (guestVal === 'true') {
            // Backfill so next launch is immediate
            await AsyncStorage.setItem(key, 'true').catch(() => {});
            setHasSeenOnboarding(true);
          } else {
            setHasSeenOnboarding(false);
          }
        } else {
          setHasSeenOnboarding(false);
        }
      })
      .catch(() => setHasSeenOnboarding(false))
      .finally(() => setOnboardingChecking(false));
  }, [session?.user?.id]);

  // Routing
  useEffect(() => {
    if (loading) return;
    if (onboardingChecking) return;
    if (hasSeenOnboarding === null) return;

    const inAuthGroup  = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    let redirecting = false;

    if (isPasswordRecovery) {
      // Only redirect if not already on reset-password — avoids an infinite redirect loop
      if (segments[0] !== '(auth)') {
        router.replace('/(auth)/reset-password');
        redirecting = true;
      }
    } else if (!session) {
      if (!hasSeenOnboarding && !getGuestOnboardingSeen() && !inOnboarding && !inAuthGroup) {
        // First-time guest — show onboarding before the restaurant list.
        router.replace('/onboarding');
        redirecting = true;
      } else if (inAuthGroup && !getGuestLoginIntent()) {
        // On auth screen with no explicit intent — covers stale Expo Router nav state restoration.
        // Use router.replace (not CommonActions.reset) so Expo Router's URL tracking updates and
        // useSegments() reflects the new route, allowing !redirecting to become true quickly.
        router.replace('/(tabs)');
        redirecting = true;
      }
    } else if (!hasSeenOnboarding && !getOnboardingSeenThisSession()) {
      if (!inOnboarding) { router.replace('/onboarding'); redirecting = true; }
    } else if (inAuthGroup) {
      // Logged-in users who land on auth screens get bounced home, but
      // inOnboarding is intentionally excluded — the profile screen lets
      // them re-watch the tour via router.push('/onboarding').
      if (getBusinessSignupIntent()) {
        setBusinessSignupIntent(false);
        router.replace('/business-type');
      } else {
        router.replace('/(tabs)');
      }
      redirecting = true;
    }

    // Clear guest login intent once they navigate away from auth (e.g. pressed back).
    // Legal screens (privacy-policy, terms-of-service) are reachable from the sign-up
    // form, so don't clear the intent there — swiping back should return to sign-up.
    const isLegalScreen = segments[0] === 'privacy-policy' || segments[0] === 'terms-of-service';
    if (!redirecting && !session && !inAuthGroup && !isLegalScreen) setGuestLoginIntent(false);

    // Dismiss the splash once auth state is settled, no redirect is in flight,
    // and the minimum branding time has elapsed.
    // router.replace (used above instead of CommonActions.reset) keeps Expo Router's URL
    // tracking in sync, so segments update quickly and !redirecting becomes true before
    // minSplashElapsed fires in the typical case. If segments is still empty (router not yet
    // initialised), inAuthGroup is false so no redirect fires and we dismiss correctly onto
    // the (tabs) initial route set by unstable_settings.
    if (!redirecting && minSplashElapsed) setAppReady(true);
  }, [session, loading, segments, isPasswordRecovery, hasSeenOnboarding, onboardingChecking, minSplashElapsed]);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <SplashOverlay show={!appReady} />
      <UpdateBanner />
    </View>
  );
}

// ─── Root layout ───────────────────────────────────────────────────────────────

function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MsaProvider>
          <RootLayoutNav />
        </MsaProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default RootLayout;

// ─── Styles ────────────────────────────────────────────────────────────────────

const GREEN = '#245737';

const sp = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topGlow: {
    position: 'absolute',
    top: -130,
    width: 440,
    height: 440,
    borderRadius: 220,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  content: {
    alignItems: 'center',
    marginBottom: 64,
  },
  iconWrap: {
    width: 118,
    height: 118,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  icon: { width: '100%', height: '100%' },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 15,
    color: Brand.gold,
    fontWeight: '500',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 64,
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
});
