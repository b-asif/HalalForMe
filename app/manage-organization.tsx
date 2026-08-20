import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const ORG_OPTIONS = [
  {
    icon: 'storefront-outline' as const,
    label: 'Halal Business',
    sub: 'Add or manage a halal restaurant',
    route: '/add-my-business' as const,
  },
  {
    icon: 'business-outline' as const,
    label: 'Mosque',
    sub: 'Claim or manage a mosque\'s page',
    route: '/redeem-mosque' as const,
  },
  {
    icon: 'school-outline' as const,
    label: 'Campus MSA',
    sub: 'Claim or manage your campus MSA',
    route: '/msa/manage-campus' as const,
  },
];

export default function ManageOrganizationScreen() {
  const router = useRouter();

  const handleClaimCode = () => {
    Alert.alert(
      'What type of claim code?',
      'Select the type of organisation your code is for.',
      [
        { text: 'Mosque Code',     onPress: () => router.push('/redeem-mosque') },
        { text: 'Campus MSA Code', onPress: () => router.push('/msa/redeem-code') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Manage an Organization</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        <Text style={s.intro}>
          Add your halal business, claim a mosque, or manage your campus MSA on Rihdal.
        </Text>

        <View style={s.card}>
          {ORG_OPTIONS.map((opt, idx) => (
            <TouchableOpacity
              key={opt.label}
              style={[s.row, idx < ORG_OPTIONS.length - 1 && s.rowBorder]}
              onPress={() => router.push(opt.route)}
              activeOpacity={0.7}
            >
              <View style={s.iconWrap}>
                <Ionicons name={opt.icon} size={20} color={GREEN} />
              </View>
              <View style={s.rowText}>
                <Text style={s.rowLabel}>{opt.label}</Text>
                <Text style={s.rowSub}>{opt.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Claim code link */}
        <TouchableOpacity style={s.claimRow} onPress={handleClaimCode} activeOpacity={0.7}>
          <Text style={s.claimText}>Have a claim code? </Text>
          <Text style={s.claimLink}>Enter code →</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: HAIRLINE,
  },
  title: { fontSize: 18, fontWeight: '800', color: TEXT_DARK },
  scroll: { paddingTop: 20, paddingHorizontal: 16 },
  intro: {
    fontSize: 14, color: TEXT_MUTED, lineHeight: 21,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  iconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: TEXT_DARK },
  rowSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  claimRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: 20, paddingVertical: 12,
  },
  claimText: { fontSize: 14, color: TEXT_MUTED },
  claimLink: { fontSize: 14, color: GREEN, fontWeight: '600' },
});
