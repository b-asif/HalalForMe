/**
 * MSA Admin Portal — Dashboard
 */

import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useMsa } from '../../contexts/MsaContext';
import { useAuth } from '../../contexts/AuthContext';
import { Brand, Radius, Spacing, Type } from '../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const CREAM      = Brand.cream;
const HAIRLINE   = Brand.hairline;

interface QuickAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  description: string;
  route: string;
  color: string;
  bg: string;
}

const ACTIONS: QuickAction[] = [
  { icon: 'time-outline',       label: 'Prayer Times',   description: 'Daily iqama schedule',       route: '/(msa)/prayer-times',   color: DEEP_GREEN, bg: '#e6f4ec' },
  { icon: 'people-outline',     label: 'Jummah',         description: 'Friday prayer details',      route: '/(msa)/jummah',         color: '#7c3aed',  bg: '#f3f0ff' },
  { icon: 'calendar-outline',   label: 'Events',         description: 'Create & manage events',     route: '/(msa)/events',         color: '#0891b2',  bg: '#e0f7fa' },
  { icon: 'megaphone-outline',  label: 'Announcements',  description: 'Post updates',               route: '/(msa)/announcements',  color: '#b45309',  bg: '#fef3c7' },
  { icon: 'location-outline',   label: 'Prayer Spaces',  description: 'Rooms & wudu areas',         route: '/(msa)/prayer-spaces',  color: '#059669',  bg: '#d1fae5' },
  { icon: 'bookmark-outline',   label: 'Resources',      description: 'Halal food, links & more',   route: '/(msa)/resources',      color: '#dc2626',  bg: '#fee2e2' },
  { icon: 'person-add-outline', label: 'Members',        description: 'Manage team access',         route: '/(msa)/members',        color: '#6d28d9',  bg: '#ede9fe' },
  { icon: 'image-outline',      label: 'MSA Profile',    description: 'Photo, Instagram & info',    route: '/(msa)/profile',        color: '#0369a1',  bg: '#e0f2fe' },
];

export default function MsaDashboard() {
  const router = useRouter();
  const { activeMsaId: paramMsaId } = useLocalSearchParams<{ activeMsaId?: string }>();
  const { user, isAdmin, signOut } = useAuth();
  const { activeMembership, setActiveMsaId } = useMsa();

  // If we arrived from code redemption, steer to the newly created MSA
  useEffect(() => {
    if (paramMsaId) setActiveMsaId(paramMsaId);
  }, [paramMsaId]);

  const msaName        = activeMembership?.msaName        ?? (isAdmin ? 'Rihdal Admin' : '');
  const universityName = activeMembership?.universityName ?? '';
  const role           = activeMembership?.role           ?? (isAdmin ? 'admin' : 'editor');
  const slug           = activeMembership?.universitySlug ?? '';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.greeting}>MSA Admin Portal</Text>
          <Text style={s.msaName} numberOfLines={1}>{msaName || 'No MSA selected'}</Text>
          {!!universityName && (
            <Text style={s.uniName} numberOfLines={1}>{universityName}</Text>
          )}
        </View>
        <View style={s.roleBadge}>
          <Text style={s.roleText}>{role}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Quick actions grid */}
        <Text style={s.sectionLabel}>Manage</Text>
        <View style={s.grid}>
          {ACTIONS.map(action => (
            <TouchableOpacity
              key={action.route}
              style={s.card}
              onPress={() => router.push(action.route as any)}
              activeOpacity={0.8}
            >
              <View style={[s.cardIcon, { backgroundColor: action.bg }]}>
                <Ionicons name={action.icon} size={22} color={action.color} />
              </View>
              <Text style={s.cardLabel}>{action.label}</Text>
              <Text style={s.cardDesc} numberOfLines={1}>{action.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bottom actions */}
        <Text style={s.sectionLabel}>More</Text>
        <View style={s.moreList}>
          {!!slug && (
            <TouchableOpacity
              style={s.moreRow}
              onPress={() => router.push(`/campus/${slug}` as any)}
              activeOpacity={0.8}
            >
              <View style={[s.moreIcon, { backgroundColor: '#e6f4ec' }]}>
                <Ionicons name="eye-outline" size={18} color={GREEN} />
              </View>
              <View style={s.moreText}>
                <Text style={s.moreLabel}>View Public Page</Text>
                <Text style={s.moreDesc}>See your campus hub as students see it</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={s.moreRow}
            onPress={signOut}
            activeOpacity={0.8}
          >
            <View style={[s.moreIcon, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="log-out-outline" size={18} color="#dc2626" />
            </View>
            <View style={s.moreText}>
              <Text style={[s.moreLabel, { color: '#dc2626' }]}>Sign Out</Text>
              <Text style={s.moreDesc}>Return to the main app</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: HAIRLINE,
    gap: Spacing.sm,
  },
  headerLeft: { flex: 1, gap: 2 },
  greeting:   { fontSize: 12, fontWeight: '600', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  msaName:    { fontSize: 20, fontWeight: '800', color: DEEP_GREEN },
  uniName:    { ...Type.caption, color: TEXT_MUTED },
  roleBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    backgroundColor: '#e6f4ec', borderRadius: Radius.chip, alignSelf: 'flex-start', marginTop: 4,
  },
  roleText: { fontSize: 11, fontWeight: '700', color: GREEN, textTransform: 'uppercase', letterSpacing: 0.5 },

  scroll: { padding: Spacing.md, paddingBottom: 40, gap: Spacing.md },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: -4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  card: {
    width: '47%', backgroundColor: '#fff',
    borderRadius: Radius.card, borderWidth: 1, borderColor: HAIRLINE,
    padding: Spacing.md, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  cardDesc:  { fontSize: 12, color: TEXT_MUTED },

  moreList: { gap: Spacing.sm },
  moreRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: HAIRLINE,
    padding: Spacing.md,
  },
  moreIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  moreText:  { flex: 1, gap: 2 },
  moreLabel: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  moreDesc:  { fontSize: 12, color: TEXT_MUTED },
});
