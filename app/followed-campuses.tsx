/**
 * /followed-campuses
 *
 * Settings screen — lists all campuses the user follows with per-category
 * notification toggles for each.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet,
  Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../lib/supabase';
import { getCampusNotifPrefs, setCampusNotifPref } from '../lib/campus';
import type { CampusNotifPrefs, NotifCategory } from '../lib/campus';
import { Brand, Radius, Spacing, Type } from '../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const CREAM      = Brand.cream;

const NOTIF_ROWS: { key: NotifCategory; label: string; sub: string }[] = [
  { key: 'events',        label: 'Events',        sub: 'Upcoming MSA events' },
  { key: 'announcements', label: 'Announcements', sub: 'News and updates' },
  { key: 'dining',        label: 'Dining',        sub: "Today's halal options" },
  { key: 'jummah',        label: 'Jummah',        sub: 'Time and location changes' },
  { key: 'prayer',        label: 'Prayer Times',  sub: 'Iqama time updates' },
];

interface FollowedCampus {
  universityId: string;
  universityName: string;
  slug: string;
  prefs: CampusNotifPrefs;
}

export default function FollowedCampusesScreen() {
  const router = useRouter();
  const [campuses, setCampuses] = useState<FollowedCampus[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('campus_follows')
      .select('university_id, universities(id, name, slug)')
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    const results = await Promise.all(
      (data as any[]).map(async row => {
        const uni = row.universities;
        const prefs = await getCampusNotifPrefs(uni.id);
        return {
          universityId:   uni.id,
          universityName: uni.name,
          slug:           uni.slug,
          prefs,
        } as FollowedCampus;
      })
    );

    setCampuses(results);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onToggle = useCallback(async (
    universityId: string,
    key: NotifCategory,
    val: boolean,
  ) => {
    setCampuses(prev => prev.map(c =>
      c.universityId === universityId
        ? { ...c, prefs: { ...c.prefs, [key]: val } }
        : c
    ));
    await setCampusNotifPref(universityId, key, val);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={DEEP_GREEN} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Followed Campuses</Text>
          <Text style={styles.subtitle}>Manage your campus notifications</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={GREEN} />
        </View>
      ) : campuses.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="school-outline" size={42} color={Colors.textGhost} />
          <Text style={styles.emptyTitle}>No followed campuses</Text>
          <Text style={styles.emptyBody}>
            Follow a campus from the Campus Hub to manage notifications here.
          </Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => router.push('/campus')}>
            <Text style={styles.browseBtnText}>Browse Campus Hub</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {campuses.map(campus => (
            <View key={campus.universityId} style={styles.card}>
              {/* Campus name + link */}
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => router.push(`/campus/${campus.slug}`)}
                activeOpacity={0.7}
              >
                <View style={styles.cardIconWrap}>
                  <Ionicons name="school" size={20} color={GREEN} />
                </View>
                <Text style={styles.cardName} numberOfLines={1}>{campus.universityName}</Text>
                <Ionicons name="chevron-forward" size={16} color={HAIRLINE} />
              </TouchableOpacity>

              {/* Notification toggles */}
              <View style={styles.togglesWrap}>
                <Text style={styles.togglesLabel}>Notifications</Text>
                {NOTIF_ROWS.map(({ key, label, sub }) => (
                  <View key={key} style={styles.toggleRow}>
                    <View style={styles.toggleText}>
                      <Text style={styles.toggleLabel}>{label}</Text>
                      <Text style={styles.toggleSub}>{sub}</Text>
                    </View>
                    <Switch
                      value={campus.prefs[key]}
                      onValueChange={val => onToggle(campus.universityId, key, val)}
                      trackColor={{ false: HAIRLINE, true: GREEN }}
                      thumbColor="#fff"
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    paddingBottom: Spacing.md, gap: Spacing.sm,
    backgroundColor: CREAM,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: Radius.circle,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: HAIRLINE,
  },
  headerText: { flex: 1 },
  title:    { ...Type.screenTitle, color: TEXT_DARK },
  subtitle: { ...Type.caption, color: TEXT_MUTED, marginTop: 2 },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.sm,
  },
  emptyTitle: { ...Type.cardTitle, color: TEXT_DARK, textAlign: 'center', marginTop: Spacing.sm },
  emptyBody:  { ...Type.bodySmall, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  browseBtn: {
    marginTop: Spacing.sm, paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm, backgroundColor: GREEN, borderRadius: Radius.chip,
  },
  browseBtnText: { ...Type.label, color: '#fff' },

  list: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 40 },

  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  cardIconWrap: {
    width: 36, height: 36, borderRadius: Radius.chip,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  cardName: { ...Type.cardTitle, color: TEXT_DARK, flex: 1 },

  togglesWrap: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs, backgroundColor: CREAM },
  togglesLabel: { ...Type.tiny, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  toggleText: { flex: 1, marginRight: Spacing.md },
  toggleLabel: { ...Type.body, color: TEXT_DARK, fontWeight: '600' },
  toggleSub:   { ...Type.caption, color: TEXT_MUTED, marginTop: 2 },
});
