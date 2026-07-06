import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { setGuestOnboardingSeen, setOnboardingSeenThisSession } from '../lib/guestLoginIntent';
import { Brand } from '../lib/theme';

const CREAM = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const GOLD = Brand.gold;
const TEXT_DARK = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'time-outline',
    title: 'Prayer times & reminders',
    body: 'Calculated on your device — your location is never sent to us or sold to anyone. Calculation method is set automatically for where you are, and adjustable anytime in Settings.',
  },
  {
    icon: 'compass-outline',
    title: 'Qibla direction',
    body: 'A live compass pointing the way to pray, wherever you are.',
  },
  {
    icon: 'scan-outline',
    title: 'Halal ingredient scanner',
    body: "Scan any product's barcode to check if it's halal, haram, or needs a closer look.",
  },
];

export function markOnboardingSeen(userId?: string) {
  const key = userId ? `onboarding_seen_${userId}` : 'onboarding_seen_guest';
  return AsyncStorage.setItem(key, 'true').catch(() => {});
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const finish = async () => {
    if (!user?.id) setGuestOnboardingSeen();
    setOnboardingSeenThisSession();
    await markOnboardingSeen(user?.id);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="moon" size={40} color={GREEN} />
        </View>

        <Text style={styles.title}>Assalamu Alaikum</Text>
        <Text style={styles.subtitle}>
          HalalForMe helps you stay on top of your prayers, find the Qibla, and eat with confidence — wherever you are.
        </Text>

        <View style={styles.features}>
          {FEATURES.map(f => (
            <View key={f.title} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon} size={20} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={styles.ctaBtn} onPress={finish} activeOpacity={0.85}>
          <Text style={styles.ctaBtnText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  content: { flex: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 28 },

  iconWrap: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 26, fontWeight: '800', color: TEXT_DARK, marginBottom: 10, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, color: TEXT_MUTED, lineHeight: 22, marginBottom: 32 },

  features: { gap: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  featureIconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  featureTitle: { fontSize: 15, fontWeight: '700', color: TEXT_DARK, marginBottom: 2 },
  featureBody: { fontSize: 13, color: TEXT_MUTED, lineHeight: 19 },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: DEEP_GREEN, paddingVertical: 16, borderRadius: 30, width: '100%',
  },
  ctaBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
