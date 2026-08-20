/**
 * /msa/manage-campus
 *
 * Entry point for users without an MSA membership.
 * Presents two paths: request access or redeem a claim code.
 */

import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Brand, Radius, Spacing, Type } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

export default function ManageCampusScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={DEEP_GREEN} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>Manage Campus MSA</Text>
          <Text style={s.subtitle}>Connect your MSA to Rihdal</Text>
        </View>
      </View>

      <View style={s.body}>
        {/* Icon hero */}
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Ionicons name="school" size={36} color={GREEN} />
          </View>
          <Text style={s.heroTitle}>Your campus MSA, powered by Rihdal</Text>
          <Text style={s.heroSub}>
            Manage events, prayer times, and announcements for your campus community.
          </Text>
        </View>

        {/* Option cards */}
        <TouchableOpacity
          style={s.card}
          onPress={() => router.push('/msa/request-access')}
          activeOpacity={0.8}
        >
          <View style={[s.cardIcon, { backgroundColor: '#f0faf6' }]}>
            <Ionicons name="ribbon-outline" size={24} color={DEEP_GREEN} />
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>Request MSA Access</Text>
            <Text style={s.cardSub}>
              Submit a request and the Rihdal team will verify and send you a claim code within 1–3 business days.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </TouchableOpacity>

        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        <TouchableOpacity
          style={s.card}
          onPress={() => router.push('/msa/redeem-code')}
          activeOpacity={0.8}
        >
          <View style={[s.cardIcon, { backgroundColor: '#f5f5ff' }]}>
            <Ionicons name="key-outline" size={24} color="#5856d6" />
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>Enter Claim Code</Text>
            <Text style={s.cardSub}>
              Already have an 8-character code? Enter it here to instantly claim your MSA page.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    paddingBottom: Spacing.md, gap: Spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: Radius.circle,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  headerText: { flex: 1 },
  title:    { ...Type.screenTitle, color: DEEP_GREEN },
  subtitle: { ...Type.caption, color: TEXT_MUTED, marginTop: 2 },

  body: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },

  hero: {
    alignItems: 'center',
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  heroIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#f0faf6',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  heroTitle: {
    ...Type.cardTitle,
    color: TEXT_DARK,
    textAlign: 'center',
    fontSize: 18,
  },
  heroSub: {
    ...Type.bodySmall,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },

  card: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#fff',
    borderRadius: Radius.card,
    borderWidth: 1, borderColor: HAIRLINE,
    padding: Spacing.md,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: { flex: 1 },
  cardTitle: { ...Type.body, color: TEXT_DARK, fontWeight: '700', marginBottom: 4 },
  cardSub:   { ...Type.caption, color: TEXT_MUTED, lineHeight: 17 },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: HAIRLINE },
  dividerText: { ...Type.caption, color: TEXT_MUTED },
});
