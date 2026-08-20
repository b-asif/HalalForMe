import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../lib/theme';
import { useAuth } from '../contexts/AuthContext';

const CREAM      = Brand.cream;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

interface SettingsRow {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Text style={s.sectionLabel}>{label}</Text>
  );
}

function SettingsItem({
  row, isLast,
}: { row: SettingsRow; isLast: boolean }) {
  return (
    <TouchableOpacity
      style={[s.row, !isLast && s.rowBorder]}
      onPress={row.onPress}
      activeOpacity={0.7}
    >
      <View style={s.iconWrap}>
        <Ionicons name={row.icon} size={19} color={GREEN} />
      </View>
      <Text style={s.rowLabel}>{row.label}</Text>
      <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router  = useRouter();
  const { isAdmin } = useAuth();

  const accountRows: SettingsRow[] = [
    { icon: 'notifications-outline', label: 'Notifications',    onPress: () => router.push('/notifications') },
    { icon: 'school-outline',        label: 'Followed Campuses', onPress: () => router.push('/followed-campuses') },
    { icon: 'help-circle-outline',   label: 'Help & Support',   onPress: () => router.push('/help') },
    { icon: 'document-text-outline', label: 'Privacy Policy',   onPress: () => router.push('/privacy-policy') },
    { icon: 'reader-outline',        label: 'Terms of Service', onPress: () => router.push('/terms-of-service') },
  ];

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        <SectionLabel label="Account" />
        <View style={s.card}>
          {accountRows.map((row, idx) => (
            <SettingsItem key={row.label} row={row} isLast={idx === accountRows.length - 1} />
          ))}
        </View>

        {isAdmin && (
          <>
            <SectionLabel label="Admin" />
            <View style={s.card}>
              <SettingsItem
                row={{ icon: 'settings-outline', label: 'Admin Panel', onPress: () => router.push('/(admin)') }}
                isLast
              />
            </View>
          </>
        )}

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
  title: { fontSize: 20, fontWeight: '800', color: TEXT_DARK },
  scroll: { paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: TEXT_MUTED,
    letterSpacing: 0.5, textTransform: 'uppercase',
    marginTop: 24, marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  iconWrap: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
    marginRight: 13,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: TEXT_DARK },
});
