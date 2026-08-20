import { useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { setGuestOnboardingSeen, setOnboardingSeenThisSession } from '../lib/guestLoginIntent';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GOLD       = Brand.gold;

// ─── Exported helper (used by _layout.tsx) ───────────────────────────────────

export function markOnboardingSeen(userId?: string) {
  const key = userId ? `onboarding_seen_${userId}` : 'onboarding_seen_guest';
  return AsyncStorage.setItem(key, 'true').catch(() => {});
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
      ))}
    </View>
  );
}

// ─── Slide 1: Welcome (emotional hook) ───────────────────────────────────────

function WelcomeSlide() {
  return (
    <View style={styles.slideContent}>
      <View style={styles.welcomeHero}>
        <Image
          source={require('../assets/icon.png')}
          style={styles.heroLogo}
          resizeMode="cover"
        />
        <Text style={styles.wordmark}>RIHDAL</Text>
        <Text style={styles.wordmarkTagline}>Guide Your Journey</Text>
        <View style={styles.wordmarkDivider} />
      </View>

      <Text style={styles.welcomeGreeting}>Assalamu Alaikum</Text>
      <Text style={styles.welcomeSubtitle}>
        Prayer, mosques, halal food, and Quran — all in one place. Built for Muslims, by Muslims.
      </Text>

      <View style={styles.privacyNote}>
        <Ionicons name="shield-checkmark-outline" size={14} color={GOLD} />
        <Text style={styles.privacyNoteText}>
          No ads. No data sold. Prayer times stay on your device.
        </Text>
      </View>
    </View>
  );
}

// ─── Slide 2: Feature proof (2-column compact grid) ──────────────────────────

const FEATURES = [
  { icon: 'time-outline',       iconLib: 'ion', label: 'Prayer Times'   },
  { icon: 'compass-outline',    iconLib: 'ion', label: 'Qibla'          },
  { icon: 'book-outline',       iconLib: 'ion', label: 'Quran'          },
  { icon: 'hand-left-outline',  iconLib: 'ion', label: 'Duas'           },
  { icon: 'mosque',             iconLib: 'mc',  label: 'Mosques'        },
  { icon: 'restaurant-outline', iconLib: 'ion', label: 'Halal Food'     },
  { icon: 'barcode-outline',    iconLib: 'ion', label: 'Halal Scanner'  },
  { icon: 'school-outline',     iconLib: 'ion', label: 'Campus Hub'     },
] as const;

function FeaturesSlide() {
  return (
    <View style={styles.slideContent}>
      <Text style={styles.slideHeading}>Everything you need</Text>
      <Text style={styles.slideSubheading}>
        One app for your daily worship and Muslim lifestyle.
      </Text>

      <View style={styles.featureGrid}>
        {FEATURES.map(f => (
          <View key={f.label} style={styles.featureCell}>
            <View style={styles.featureIconWrap}>
              {f.iconLib === 'mc'
                ? <MaterialCommunityIcons name={f.icon as any} size={22} color={GOLD} />
                : <Ionicons name={f.icon as any} size={22} color={GOLD} />
              }
            </View>
            <Text style={styles.featureCellLabel}>{f.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Slide 3: Campus Hub ──────────────────────────────────────────────────────

const CAMPUS_ROWS = [
  { icon: 'school-outline',     text: 'Follow your university's MSA for prayer times and jummah updates' },
  { icon: 'calendar-outline',   text: 'Stay up to date with campus events and announcements' },
  { icon: 'restaurant-outline', text: 'Discover halal dining options on your campus' },
] as const;

function CampusSlide() {
  return (
    <View style={styles.slideContent}>
      <View style={styles.slideHeroIcon}>
        <Ionicons name="school-outline" size={28} color={GOLD} />
      </View>
      <Text style={styles.slideHeading}>Campus Hub</Text>
      <Text style={styles.slideSubheading}>
        Built for Muslim students. Your MSA, your campus — all in one place.
      </Text>

      <View style={styles.commitments}>
        {CAMPUS_ROWS.map(c => (
          <View key={c.icon} style={styles.commitmentRow}>
            <View style={styles.commitmentIcon}>
              <Ionicons name={c.icon as any} size={18} color={GOLD} />
            </View>
            <Text style={styles.commitmentText}>{c.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Slide 4: Privacy & trust ─────────────────────────────────────────────────

const COMMITMENTS = [
  { icon: 'phone-portrait-outline', text: 'Prayer times calculated on your device — never sent to a server' },
  { icon: 'location-outline',       text: 'Location used only to find nearby mosques and restaurants' },
  { icon: 'heart-outline',          text: 'Save favourites and submit restaurants with a free account' },
] as const;

function PrivacySlide() {
  return (
    <View style={styles.slideContent}>
      <View style={styles.slideHeroIcon}>
        <Ionicons name="shield-checkmark" size={28} color={GOLD} />
      </View>
      <Text style={styles.slideHeading}>Your privacy matters</Text>
      <Text style={styles.slideSubheading}>
        No ads. No data sold. No compromise.
      </Text>

      <View style={styles.commitments}>
        {COMMITMENTS.map(c => (
          <View key={c.icon} style={styles.commitmentRow}>
            <View style={styles.commitmentIcon}>
              <Ionicons name={c.icon as any} size={18} color={GOLD} />
            </View>
            <Text style={styles.commitmentText}>{c.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const SLIDE_COMPONENTS = [WelcomeSlide, FeaturesSlide, CampusSlide, PrivacySlide];
const TOTAL = SLIDE_COMPONENTS.length;

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  const isLast = step === TOTAL - 1;

  const finish = async () => {
    if (!user?.id) setGuestOnboardingSeen();
    setOnboardingSeenThisSession();
    await markOnboardingSeen(user?.id);
    router.replace('/(tabs)');
  };

  const advance = () => {
    if (isLast) { finish(); return; }
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setStep(s => s + 1), 150);
  };

  const SlideComponent = SLIDE_COMPONENTS[step];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ProgressDots total={TOTAL} current={step} />

        <Animated.View style={[styles.slideWrap, { opacity }]}>
          <SlideComponent />
        </Animated.View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={styles.ctaBtn} onPress={advance} activeOpacity={0.88}>
          <Text style={styles.ctaBtnText}>{isLast ? 'Get Started' : 'Next'}</Text>
          <Ionicons name="arrow-forward" size={18} color={DEEP_GREEN} style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        {step === 0 && (
          <TouchableOpacity onPress={finish} style={styles.skipBtn} hitSlop={12}>
            <Text style={styles.skipText}>Browse as guest</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DEEP_GREEN },
  content:   { flex: 1, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 28 },

  // Progress dots
  dots:      { flexDirection: 'row', gap: 6, marginBottom: 36 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(247,242,231,0.25)' },
  dotActive: { width: 22, backgroundColor: GOLD },

  // Slide wrapper
  slideWrap:    { flex: 0 },
  slideContent: { gap: 0 },

  // ── Welcome slide ──────────────────────────────────────────────────────────
  welcomeHero: { alignItems: 'center', marginBottom: 32 },
  heroLogo: {
    width: 84, height: 84, borderRadius: 22, marginBottom: 16,
    borderWidth: 2, borderColor: 'rgba(176,141,87,0.4)',
  },
  wordmark: {
    fontSize: 30, fontWeight: '800', color: CREAM,
    letterSpacing: 10, paddingLeft: 10, textAlign: 'center',
  },
  wordmarkTagline: {
    fontSize: 12, color: GOLD, marginTop: 5,
    letterSpacing: 3, textTransform: 'uppercase',
  },
  wordmarkDivider: {
    width: 36, height: 1.5, backgroundColor: GOLD,
    marginTop: 14, borderRadius: 1, opacity: 0.7,
  },
  welcomeGreeting: {
    fontSize: 26, fontWeight: '800', color: CREAM,
    marginBottom: 12, letterSpacing: -0.3,
  },
  welcomeSubtitle: {
    fontSize: 15, color: 'rgba(247,242,231,0.68)',
    lineHeight: 23, marginBottom: 24,
  },
  privacyNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(176,141,87,0.12)',
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: 'rgba(176,141,87,0.2)',
  },
  privacyNoteText: { flex: 1, fontSize: 12, color: 'rgba(247,242,231,0.7)', lineHeight: 17 },

  // ── Features slide ─────────────────────────────────────────────────────────
  slideHeroIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(176,141,87,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(176,141,87,0.2)',
  },
  slideHeading: {
    fontSize: 24, fontWeight: '800', color: CREAM,
    marginBottom: 8, letterSpacing: -0.4,
  },
  slideSubheading: {
    fontSize: 14, color: 'rgba(247,242,231,0.65)',
    lineHeight: 21, marginBottom: 28,
  },

  featureGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  featureCell: {
    width: '46%', flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(247,242,231,0.07)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(247,242,231,0.1)',
  },
  featureIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(176,141,87,0.15)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  featureCellLabel: {
    fontSize: 13, fontWeight: '600', color: CREAM, flex: 1,
  },

  // ── Privacy slide ──────────────────────────────────────────────────────────
  commitments: { gap: 14, marginTop: 4 },
  commitmentRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: 'rgba(247,242,231,0.07)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(247,242,231,0.1)',
  },
  commitmentIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(176,141,87,0.15)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  commitmentText: {
    flex: 1, fontSize: 13, color: 'rgba(247,242,231,0.75)',
    lineHeight: 19, paddingTop: 2,
  },

  // CTA
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CREAM, paddingVertical: 16, borderRadius: 30, width: '100%',
    marginTop: 16,
  },
  ctaBtnText: { color: DEEP_GREEN, fontSize: 17, fontWeight: '800' },

  // Skip
  skipBtn: { alignItems: 'center', paddingTop: 14 },
  skipText: { fontSize: 13, color: 'rgba(247,242,231,0.45)', fontWeight: '500' },
});
