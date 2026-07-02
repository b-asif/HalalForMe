import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const GREEN = '#245737';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do you determine if a restaurant is halal?',
    a: 'We use a combination of official halal certifications (ISNA, IFANCA, HMA, HFA, MUI), community reports, and cuisine-based classification. Each restaurant shows its certification status on its detail page.',
  },
  {
    q: 'What does the barcode scanner check?',
    a: 'The scanner looks up packaged food products via Open Food Facts and checks the ingredient list for known haram ingredients (pork, lard, alcohol, carmine E120, non-fish gelatin) and unclear ingredients (natural flavors, rennet, L-Cysteine).',
  },
  {
    q: 'How do I report incorrect halal information?',
    a: 'Open the restaurant detail page and submit a review with a halal compliance rating. You can also use the report button on the barcode scanner results screen.',
  },
  {
    q: 'How do I save a restaurant?',
    a: 'Open any restaurant detail page and tap the heart icon in the top-right corner. Saved restaurants appear under Profile → Saved Restaurants.',
  },
  {
    q: 'Why does my location not appear on the map?',
    a: 'HalalForMe needs location permission to show restaurants near you. Go to your device Settings → HalalForMe → Location and enable it.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      style={s.faqItem}
      onPress={() => setOpen(v => !v)}
      activeOpacity={0.8}
    >
      <View style={s.faqHeader}>
        <Text style={s.faqQ}>{q}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#aaa"
        />
      </View>
      {open ? <Text style={s.faqA}>{a}</Text> : null}
    </TouchableOpacity>
  );
}

export default function HelpScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={s.title}>Help & Support</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        <Text style={s.sectionTitle}>Frequently Asked Questions</Text>
        <View style={s.faqCard}>
          {FAQS.map((item, i) => (
            <View key={i}>
              <FaqItem q={item.q} a={item.a} />
              {i < FAQS.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Contact Us</Text>
        <TouchableOpacity
          style={s.contactCard}
          onPress={() => Linking.openURL('mailto:infor.halalforme@gmail.com')}
          activeOpacity={0.8}
        >
          <View style={s.contactIcon}>
            <Ionicons name="mail-outline" size={20} color={GREEN} />
          </View>
          <View style={s.contactInfo}>
            <Text style={s.contactLabel}>Email Support</Text>
            <Text style={s.contactValue}>infor.halalforme@gmail.com</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d0d0d0" />
        </TouchableOpacity>

        <Text style={s.version}>HalalForMe v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111' },
  scroll: { padding: 16, paddingBottom: 40 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 16, marginBottom: 10, marginLeft: 4,
  },

  faqCard: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: 'hidden',
  },
  faqItem: { paddingHorizontal: 16, paddingVertical: 14 },
  faqHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faqQ: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111', lineHeight: 20 },
  faqA: { fontSize: 14, color: '#555', lineHeight: 21, marginTop: 10 },
  divider: { height: 1, backgroundColor: '#f5f5f5', marginHorizontal: 16 },

  contactCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  contactIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },
  contactInfo: { flex: 1 },
  contactLabel: { fontSize: 15, fontWeight: '600', color: '#111' },
  contactValue: { fontSize: 13, color: '#aaa', marginTop: 2 },

  version: { textAlign: 'center', fontSize: 12, color: '#ccc', marginTop: 32 },
});
