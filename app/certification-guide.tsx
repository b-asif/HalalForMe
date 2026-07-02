import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const GREEN  = '#245737';
const AMBER  = '#b7791f';
const GREY   = '#888';

// ── Certifier data ────────────────────────────────────────────────────────────

const CERTIFIERS = [
  {
    key: 'ISNA',
    name: 'ISNA — Islamic Society of North America',
    badge: 'ISNA Certified',
    tier: 'certified' as const,
    description:
      'One of the largest Muslim organisations in North America. ISNA Halal certifies food products and restaurants by verifying ingredients, suppliers, and preparation processes against Islamic dietary law.',
  },
  {
    key: 'IFANCA',
    name: 'IFANCA — Islamic Food and Nutrition Council of America',
    badge: 'IFANCA Certified',
    tier: 'certified' as const,
    description:
      'A non-profit halal certification body based in Chicago. IFANCA audits facilities and products globally and is widely recognised by Muslim consumers in North America.',
  },
  {
    key: 'HMA',
    name: 'HMA — Halal Monitoring Authority',
    badge: 'HMA Certified',
    tier: 'certified' as const,
    description:
      'An independent halal certifier operating primarily in the UK and North America. HMA conducts unannounced inspections and requires full supply-chain traceability.',
  },
  {
    key: 'HFA',
    name: 'HFA — Halal Food Authority',
    badge: 'HFA Certified',
    tier: 'certified' as const,
    description:
      'A UK-based organisation that certifies restaurants, processors, and food manufacturers. HFA issues unique certification numbers and maintains a public register.',
  },
  {
    key: 'HFSAA',
    name: 'HFSAA — Halal Food Standards Alliance of America',
    badge: 'HFSAA Certified',
    tier: 'certified' as const,
    description:
      'An American body that certifies products and food-service establishments. HFSAA requires regular audits and prohibits cross-contamination with non-halal items.',
  },
  {
    key: 'HMS',
    name: 'HMS — Halal Monitoring Services',
    badge: 'HMS Certified',
    tier: 'certified' as const,
    description:
      'A halal certification and monitoring body that conducts regular inspections of restaurants and food businesses. HMS verifies halal compliance throughout the supply chain and is recognised by Muslim communities in North America.',
  },
  {
    key: 'MUI',
    name: 'MUI — Majelis Ulama Indonesia',
    badge: 'MUI Certified',
    tier: 'certified' as const,
    description:
      "Indonesia's leading Islamic authority. MUI certification is one of the most recognised halal standards in the world, particularly in South-East Asia. Many global brands carry MUI certification.",
  },
  {
    key: 'self_certified',
    name: 'Self Certified',
    badge: 'Self Certified',
    tier: 'self' as const,
    description:
      "The restaurant or supplier claims to serve halal food but has not been independently verified by a third-party certifier. This can mean the owner is Muslim and follows halal practices, but there is no external audit. Use your own judgement and ask staff about sourcing if in doubt.",
  },
  {
    key: 'uncertified',
    name: 'Not Certified / Unknown',
    badge: 'Not Certified',
    tier: 'uncertified' as const,
    description:
      'No halal certification information is available for this restaurant. It may have been added by a community member without full details. We recommend contacting the restaurant directly to ask about their halal status before visiting.',
  },
];

// ── Badge component ───────────────────────────────────────────────────────────

function Badge({ tier, label }: { tier: 'certified' | 'self' | 'uncertified'; label: string }) {
  const color = tier === 'certified' ? GREEN : tier === 'self' ? AMBER : GREY;
  const bg    = tier === 'certified' ? '#e6f4ec' : tier === 'self' ? '#fefce8' : '#f5f5f5';
  const icon  = tier === 'certified' ? 'checkmark-circle' : 'help-circle-outline';
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Certifier accordion item ──────────────────────────────────────────────────

function CertifierItem({ item }: { item: typeof CERTIFIERS[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      style={s.certItem}
      onPress={() => setOpen(v => !v)}
      activeOpacity={0.8}
    >
      <View style={s.certHeader}>
        <View style={s.certHeaderLeft}>
          <Badge tier={item.tier} label={item.badge} />
          <Text style={s.certName}>{item.name}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#aaa" />
      </View>
      {open && <Text style={s.certDesc}>{item.description}</Text>}
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CertificationGuideScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.flex}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Certification Guide</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Intro card */}
        <View style={s.introCard}>
          <Ionicons name="shield-checkmark" size={32} color={GREEN} style={{ marginBottom: 10 }} />
          <Text style={s.introTitle}>Understanding Halal Certification</Text>
          <Text style={s.introText}>
            Halal certification confirms that food is prepared according to Islamic dietary law. In HalalForMe, every restaurant displays a badge showing its certification status. Here's what each one means.
          </Text>
        </View>

        {/* Tier overview */}
        <Text style={s.sectionLabel}>CERTIFICATION TIERS</Text>
        <View style={s.tiersCard}>
          <View style={s.tierRow}>
            <Badge tier="certified" label="Third-party Certified" />
            <Text style={s.tierDesc}>Verified by an independent halal authority</Text>
          </View>
          <View style={s.tierDivider} />
          <View style={s.tierRow}>
            <Badge tier="self" label="Self Certified" />
            <Text style={s.tierDesc}>Restaurant claims halal — not independently verified</Text>
          </View>
          <View style={s.tierDivider} />
          <View style={s.tierRow}>
            <Badge tier="uncertified" label="Not Certified" />
            <Text style={s.tierDesc}>No certification information available</Text>
          </View>
        </View>

        {/* Certifier details */}
        <Text style={s.sectionLabel}>CERTIFIER DETAILS</Text>
        <View style={s.certCard}>
          {CERTIFIERS.map((item, i) => (
            <View key={item.key}>
              {i > 0 && <View style={s.certDivider} />}
              <CertifierItem item={item} />
            </View>
          ))}
        </View>

        {/* Footer note */}
        <View style={s.footerNote}>
          <Ionicons name="information-circle-outline" size={16} color="#aaa" />
          <Text style={s.footerNoteText}>
            If you know a restaurant's certification status is incorrect, open its page and submit a review with updated information.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f5f5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },

  content: { padding: 16, paddingBottom: 40 },

  introCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  introTitle: { fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 10 },
  introText:  { fontSize: 14, color: '#666', lineHeight: 21, textAlign: 'center' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#aaa',
    letterSpacing: 0.6, marginBottom: 10, marginLeft: 2,
  },

  tiersCard: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  tierDesc:    { flex: 1, fontSize: 13, color: '#666', lineHeight: 18 },
  tierDivider: { height: 1, backgroundColor: '#f5f5f5', marginHorizontal: 16 },

  certCard: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  certItem:   { paddingHorizontal: 16, paddingVertical: 14 },
  certHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  certHeaderLeft: { flex: 1, gap: 6 },
  certName:   { fontSize: 13, fontWeight: '600', color: '#333' },
  certDesc:   { fontSize: 13, color: '#666', lineHeight: 20, marginTop: 10 },
  certDivider: { height: 1, backgroundColor: '#f5f5f5', marginHorizontal: 16 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },

  footerNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  footerNoteText: { flex: 1, fontSize: 12, color: '#aaa', lineHeight: 18 },
});
