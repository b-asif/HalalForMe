import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, Share,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Brand } from '../../../lib/theme';

const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const RED        = Brand.red;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const CREAM      = Brand.cream;
const GOLD       = '#C68B2F';
const ORANGE     = '#D97706';
const BG         = CREAM;

// ── Types ──────────────────────────────────────────────────────────────────────

interface JummahSession { time: string; khateeb: string | null; hall?: string | null }

interface MosqueRow {
  id: string;
  name: string;
  address: string | null;
  owner_id: string | null;
  cover_image_url: string | null;
  iqama_times: Record<string, string> | null;
  jummah_sessions: JummahSession[] | null;
  amenities: Record<string, boolean> | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  last_website_sync_at: string | null;
}


// ── Helpers ────────────────────────────────────────────────────────────────────

function parseIqamaMins(t: string): number | null {
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = parseInt(m12[2], 10);
    if (m12[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m12[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
  return null;
}

const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
const PRAYER_LABELS: Record<string, string> = {
  fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};
const PRAYER_ICONS: Record<string, string> = {
  fajr: 'moon-outline', dhuhr: 'sunny-outline', asr: 'partly-sunny-outline',
  maghrib: 'sunny', isha: 'moon', jummah: 'people-outline',
};

function getNextPrayer(iqamaTimes: Record<string, string> | null) {
  if (!iqamaTimes) return null;
  const now = new Date();
  const curMins = now.getHours() * 60 + now.getMinutes();
  for (const key of PRAYER_ORDER) {
    const timeStr = iqamaTimes[key];
    if (!timeStr) continue;
    const mins = parseIqamaMins(timeStr);
    if (mins !== null && mins > curMins) {
      return { key, label: PRAYER_LABELS[key], time: timeStr, minsUntil: mins - curMins };
    }
  }
  // After Isha → wrap to tomorrow's Fajr
  const fajrStr = iqamaTimes['fajr'];
  if (fajrStr) {
    const fajrMins = parseIqamaMins(fajrStr);
    if (fajrMins !== null) {
      return { key: 'fajr', label: 'Fajr', time: fajrStr, minsUntil: 24 * 60 - curMins + fajrMins };
    }
  }
  return null;
}

function formatCountdown(mins: number): string {
  if (mins < 60) return `In ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `In ${h}h` : `In ${h}h ${m}m`;
}


// ── Main component ─────────────────────────────────────────────────────────────

export default function MosquePortalScreen() {
  const { id: mosqueId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();

  const [mosque,       setMosque]       = useState<MosqueRow | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [deleting,     setDeleting]     = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const loadData = useCallback(async () => {
    if (!mosqueId || !user) return;
    setLoading(true);

    const { data: m } = await supabase
      .from('mosques')
      .select('id, name, address, owner_id, cover_image_url, iqama_times, jummah_sessions, amenities, contact_phone, contact_email, website, last_website_sync_at')
      .eq('id', mosqueId)
      .maybeSingle();

    if (!m || (m.owner_id !== user.id && !isAdmin)) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    setMosque(m as MosqueRow);
    setLoading(false);
  }, [mosqueId, user, isAdmin]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleDelete = () => {
    Alert.alert(
      'Delete Mosque',
      `Permanently delete "${mosque?.name}"? This removes all posts and sync data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase.from('mosques').delete().eq('id', mosqueId);
              if (error) throw new Error(error.message);
              router.replace('/mosques');
            } catch (e: any) {
              Alert.alert('Error', e.message);
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  // ── Loading / Unauthorized ──────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.flex}>
        <View style={[s.loadingHero, { paddingTop: insets.top }]} />
        <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
      </View>
    );
  }

  if (unauthorized || !mosque) {
    return (
      <View style={s.flex}>
        <View style={[s.loadingHero, { paddingTop: insets.top }]} />
        <View style={s.centered}>
          <Ionicons name="lock-closed-outline" size={40} color={TEXT_MUTED} />
          <Text style={s.muted}>You don't manage this mosque's page.</Text>
        </View>
      </View>
    );
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const nextPrayer = getNextPrayer(mosque.iqama_times);
  const hasIqama   = !!mosque.iqama_times && Object.keys(mosque.iqama_times).length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={s.flex}>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <View style={[s.heroContainer, { paddingTop: insets.top }]}>
        {mosque.cover_image_url ? (
          <>
            <Image source={{ uri: mosque.cover_image_url }} style={s.heroBg} contentFit="cover" />
            {/* light tint across whole image */}
            <View style={s.heroOverlay} />
            {/* heavy scrim at bottom so name is always readable on any photo */}
            <View style={s.heroScrim} />
          </>
        ) : (
          <>
            <View style={[s.heroBg, { backgroundColor: DEEP_GREEN }]} />
            {/* subtle gradient-like darkening toward the bottom for consistency */}
            <View style={s.heroScrimDark} />
          </>
        )}

        <TouchableOpacity style={[s.heroBackBtn, { top: insets.top + 12 }]} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.heroShareBtn, { top: insets.top + 12 }]}
          onPress={() => Share.share({ message: `Check out ${mosque.name} on Rihdal.` })}
          hitSlop={10}
        >
          <Ionicons name="share-outline" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Name + badge pinned to the bottom of the hero */}
        <View style={s.heroContent}>
          <View style={s.portalBadge}>
            <Text style={s.portalBadgeText}>MASJID PORTAL</Text>
          </View>
          <Text style={s.heroName} numberOfLines={2}>{mosque.name}</Text>
          {mosque.address ? (
            <View style={s.heroAddressRow}>
              <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.8)" />
              <Text style={s.heroAddress} numberOfLines={1}>{mosque.address}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Scrollable content ────────────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Today's Prayer card ─────────────────────────────────────── */}
        {hasIqama ? (
          <View style={s.prayerCard}>
            <View style={s.prayerCardLeft}>
              <View style={s.prayerCardLabelRow}>
                <Ionicons name={PRAYER_ICONS[nextPrayer?.key ?? 'fajr'] as any} size={14} color="rgba(255,255,255,0.7)" />
                <Text style={s.prayerCardLabel}>Today's Prayer</Text>
              </View>
              <Text style={s.prayerCardName}>{nextPrayer?.label ?? '—'}</Text>
              <Text style={s.prayerCardTime}>{nextPrayer?.time ?? ''}</Text>
            </View>
            <View style={s.prayerCardRight}>
              {nextPrayer && nextPrayer.minsUntil < 180 ? (
                <View style={s.countdownBadge}>
                  <Text style={s.countdownText}>{formatCountdown(nextPrayer.minsUntil)}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={s.viewAllBtn}
                onPress={() => router.push({ pathname: `/mosque/${mosqueId}/prayer-times` as any, params: { section: 'iqama' } })}
                activeOpacity={0.85}
              >
                <Text style={s.viewAllBtnText}>View All</Text>
                <Ionicons name="chevron-forward" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ── Quick Actions ────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>QUICK ACTIONS</Text>
        <View style={s.quickActionsRow}>
          <QuickAction
            icon="add"
            iconBg={DEEP_GREEN}
            label="Add Event"
            onPress={() => router.push(`/mosque/${mosqueId}/posts` as any)}
          />
          <QuickAction
            icon="megaphone-outline"
            iconBg={GOLD}
            label="Updates"
            onPress={() => router.push({ pathname: `/mosque/${mosqueId}/posts` as any, params: { tab: 'announcements' } })}
          />
          <QuickAction
            icon="time-outline"
            iconBg={DEEP_GREEN}
            label="Prayer Times"
            onPress={() => router.push({ pathname: `/mosque/${mosqueId}/prayer-times` as any, params: { section: 'iqama' } })}
          />
          <QuickAction
            icon="people-outline"
            iconBg={DEEP_GREEN}
            label="Jummah"
            onPress={() => router.push({ pathname: `/mosque/${mosqueId}/prayer-times` as any, params: { section: 'jummah' } })}
          />
        </View>

        {/* ── Grouped nav rows ─────────────────────────────────────────── */}
        <View style={s.navCard}>
          <TouchableOpacity style={s.navRow} onPress={() => router.back()} activeOpacity={0.7}>
            <View style={[s.navIcon, { backgroundColor: '#E8F4FF' }]}>
              <Ionicons name="eye-outline" size={17} color="#2563EB" />
            </View>
            <Text style={s.navLabel}>View Public Page</Text>
            <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
          </TouchableOpacity>

          <View style={s.navDivider} />

          <TouchableOpacity style={s.navRow} onPress={() => router.push(`/mosque/${mosqueId}/portal-settings` as any)} activeOpacity={0.7}>
            <View style={[s.navIcon, { backgroundColor: '#F3F4F6' }]}>
              <Ionicons name="settings-outline" size={17} color={TEXT_MUTED} />
            </View>
            <Text style={s.navLabel}>Page Settings</Text>
            <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
          </TouchableOpacity>
        </View>

        {/* ── Admin: delete ────────────────────────────────────────────── */}
        {isAdmin && (
          <TouchableOpacity
            style={[s.deleteLink, deleting && s.btnDisabled]}
            onPress={handleDelete}
            disabled={deleting}
            activeOpacity={0.7}
          >
            {deleting
              ? <ActivityIndicator size="small" color={RED} />
              : <Text style={s.deleteLinkText}>Delete Mosque</Text>}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function QuickAction({ icon, iconBg, label, onPress }: {
  icon: string; iconBg: string; label: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.quickAction} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.quickActionIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={22} color="#fff" />
      </View>
      <Text style={s.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}


// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center' },
  loadingHero: { height: 220, backgroundColor: DEEP_GREEN },

  // Hero
  heroContainer: { height: 220, position: 'relative', overflow: 'hidden' },
  heroBg:        { position: 'absolute', width: '100%', height: '100%' },
  heroOverlay:   { position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.25)' },
  heroScrim:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 140, backgroundColor: 'rgba(0,0,0,0.60)' },
  heroScrimDark: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, backgroundColor: 'rgba(0,0,0,0.30)' },
  heroBackBtn: {
    position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  heroShareBtn: {
    position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  heroContent:    { position: 'absolute', bottom: 16, left: 16, right: 72, gap: 6 },
  portalBadge:    { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  portalBadgeText:{ fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 1.2 },
  heroName:       { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 28 },
  heroAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroAddress:    { fontSize: 12, color: 'rgba(255,255,255,0.8)', flex: 1 },

  // Scroll / content
  scroll:  { flex: 1 },
  content: { padding: 16, gap: 0 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: TEXT_MUTED, letterSpacing: 0.8, marginTop: 28, marginBottom: 10 },

  // Card base
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: 'hidden',
  },

  // Today's Prayer card
  prayerCard: {
    backgroundColor: DEEP_GREEN, borderRadius: 16, padding: 18,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: DEEP_GREEN, shadowOpacity: 0.3, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
    marginTop: 16,
  },
  prayerCardLeft:    { flex: 1 },
  prayerCardLabelRow:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  prayerCardLabel:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  prayerCardName:    { fontSize: 26, fontWeight: '800', color: '#fff', lineHeight: 30 },
  prayerCardTime:    { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  prayerCardRight:   { alignItems: 'flex-end', gap: 10 },
  countdownBadge:    { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  countdownText:     { fontSize: 13, fontWeight: '700', color: '#5EFCA0' },
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  viewAllBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Quick Actions
  quickActionsRow: { flexDirection: 'row', gap: 10 },
  quickAction: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  quickActionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel:{ fontSize: 12, fontWeight: '700', color: TEXT_DARK, textAlign: 'center', lineHeight: 16 },

  // Needs Attention
  attentionRow: { gap: 10, paddingRight: 4 },
  attentionCard: {
    width: 148, borderRadius: 14, padding: 14, gap: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  attentionCardDone:    { backgroundColor: '#F0FAF6', borderWidth: 1, borderColor: '#A8DFC8' },
  attentionCardMissing: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  attentionTitle:       { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  attentionTitleDone:   { color: DEEP_GREEN },
  attentionTitleMissing:{ color: '#92400E' },
  attentionSub:         { fontSize: 11, color: TEXT_MUTED },

  // Upcoming Events
  emptyEvents:     { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyEventsText: { fontSize: 13, color: TEXT_MUTED },
  eventDivider:    { height: 1, backgroundColor: HAIRLINE, marginLeft: 64 },
  eventRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  dateTile: {
    width: 44, height: 48, borderRadius: 10,
    backgroundColor: '#EFF6F1', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dateTileMonth: { fontSize: 9, fontWeight: '700', color: GREEN, letterSpacing: 0.5 },
  dateTileDay:   { fontSize: 20, fontWeight: '800', color: DEEP_GREEN, lineHeight: 24 },
  eventInfo:     { flex: 1 },
  eventTitle:    { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  eventTime:     { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  publishedBadge:    { backgroundColor: '#E6F9F2', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  publishedBadgeText:{ fontSize: 11, fontWeight: '600', color: GREEN },

  addEventBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10,
    shadowColor: DEEP_GREEN, shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  addEventBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Prayer Times grid
  timesRow:            { gap: 0, paddingHorizontal: 8, paddingVertical: 16 },
  timeCell:            { alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  timeCellActive:      { backgroundColor: DEEP_GREEN, paddingHorizontal: 14, paddingVertical: 8 },
  timeCellJummah:      { borderLeftWidth: 1, borderLeftColor: HAIRLINE },
  timeCellLabel:       { fontSize: 11, color: TEXT_MUTED, fontWeight: '500' },
  timeCellActiveLabel: { color: 'rgba(255,255,255,0.75)' },
  timeCellTime:        { fontSize: 12, fontWeight: '700', color: TEXT_DARK },
  timeCellActiveTime:  { color: '#fff' },
  timeCellEmpty:       { color: TEXT_MUTED, fontWeight: '400' },
  timesEmptyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16,
  },
  timesEmptyText: { flex: 1, fontSize: 13, color: TEXT_MUTED },

  // Grouped nav card
  navCard: {
    marginTop: 28, backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  navIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  navLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: TEXT_DARK },
  navDivider: { height: 1, backgroundColor: HAIRLINE, marginLeft: 62 },

  // Delete — subtle text link, not a button
  deleteLink: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  deleteLinkText: { fontSize: 13, color: RED, fontWeight: '500' },

  btnDisabled: { opacity: 0.65 },
});
