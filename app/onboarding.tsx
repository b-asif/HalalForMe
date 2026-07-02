import { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { setGuestOnboardingSeen, setOnboardingSeenThisSession } from '../lib/guestLoginIntent';

const GREEN = '#245737';

const SLIDES = [
  {
    icon: 'leaf' as const,
    iconColor: GREEN,
    bg: '#E8F5F0',
    title: 'Welcome to HalalForMe',
    description:
      'Your trusted guide to finding halal-certified restaurants and verifying halal ingredients — wherever you are.',
  },
  {
    icon: 'map' as const,
    iconColor: '#2196F3',
    bg: '#E3F2FD',
    title: 'Discover Halal Restaurants',
    description:
      'Browse restaurants on an interactive map or scroll a list sorted by distance. Find certified halal spots near you in seconds.',
  },
  {
    icon: 'funnel' as const,
    iconColor: '#9C27B0',
    bg: '#F3E5F5',
    title: 'Search & Filter by Certifier',
    description:
      'Filter by certification body — ISNA, IFANCA, HMA, HFSAA, MUI, and more — so you always know exactly which standard applies.',
  },
  {
    icon: 'shield-checkmark' as const,
    iconColor: '#059669',
    bg: '#ECFDF5',
    title: 'How We Verify',
    description:
      'Every submitted restaurant is reviewed by our admin team before it goes live. Certification photos are checked against the claimed certifier. Listings that slip through can be flagged by the community — keeping the directory honest.',
  },
  {
    icon: 'scan' as const,
    iconColor: '#FF5722',
    bg: '#FBE9E7',
    title: 'Scan Ingredients',
    description:
      "Unsure about a product? Scan its barcode to instantly check E-numbers and ingredients — Halal, Haram, or Needs Review.",
  },
  {
    icon: 'storefront' as const,
    iconColor: '#FF9800',
    bg: '#FFF3E0',
    title: 'Submit, Save & Review',
    description:
      "Know a halal spot we're missing? Submit it. Bookmark your favourites, write reviews, and help the community grow.",
  },
  {
    icon: 'trophy' as const,
    iconColor: '#F59E0B',
    bg: '#FFFBEB',
    title: 'Earn Points & Badges',
    description:
      'Every approved submission earns 50 pts, reviews 15 pts, and photos 10 pts. Climb the Community leaderboard and unlock badges as you contribute.',
  },
  {
    icon: 'business' as const,
    iconColor: '#0EA5E9',
    bg: '#E0F2FE',
    title: 'Own a Restaurant?',
    description:
      'Claim your listing to keep your details accurate. Open any restaurant page, tap "Claim this listing", and our team will verify you within 1–3 days.',
  },
];

export function markOnboardingSeen(userId?: string) {
  const key = userId ? `onboarding_seen_${userId}` : 'onboarding_seen_guest';
  return AsyncStorage.setItem(key, 'true').catch(() => {});
}

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const router = useRouter();
  const { user } = useAuth();

  const finish = async () => {
    if (!user?.id) setGuestOnboardingSeen();
    setOnboardingSeenThisSession();
    await markOnboardingSeen(user?.id);
    router.replace('/(tabs)');
  };

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setCurrentIndex(next);
    } else {
      finish();
    }
  };

  const onScroll = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip */}
      <View style={styles.header}>
        <TouchableOpacity onPress={finish} style={styles.skipBtn} hitSlop={12}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={[styles.iconCircle, { backgroundColor: slide.bg }]}>
              <Ionicons name={slide.icon} size={76} color={slide.iconColor} />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.description}>{slide.description}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>
            {isLast ? 'Get Started' : 'Next'}
          </Text>
          {!isLast && (
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  skipBtn: { padding: 8 },
  skipText: { color: '#888', fontSize: 15, fontWeight: '600' },

  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 32,
  },
  iconCircle: {
    width: 172,
    height: 172,
    borderRadius: 86,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 44,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    lineHeight: 25,
    color: '#555',
    textAlign: 'center',
  },

  footer: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 20,
  },
  dots: { flexDirection: 'row', gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
  },
  dotActive: {
    width: 26,
    backgroundColor: GREEN,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    paddingVertical: 16,
    borderRadius: 30,
    width: '100%',
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
