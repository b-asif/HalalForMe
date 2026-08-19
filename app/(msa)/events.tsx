/**
 * (msa)/events.tsx
 *
 * MSA admin events list. All events ordered by event_start DESC.
 * Tap → edit screen. Pull to refresh. New event navigates to events/new.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useMsa } from '../../contexts/MsaContext';
import { Brand, Spacing, Radius } from '../../lib/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CampusEvent {
  id: string;
  title: string;
  body: string | null;
  event_start: string | null;
  event_end: string | null;
  location: string | null;
  category: string | null;
  is_published: boolean;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  lecture:   { bg: '#EEF2FF', text: '#4338CA' },
  sisters:   { bg: '#FDF2F8', text: '#9D174D' },
  quran:     { bg: '#F0FDF4', text: '#166534' },
  youth:     { bg: '#FFF7ED', text: '#9A3412' },
  community: { bg: '#EFF6FF', text: '#1D4ED8' },
  social:    { bg: '#F5F3FF', text: '#6D28D9' },
  other:     { bg: Brand.cream, text: Brand.textMuted },
};

function getCatStyle(cat: string | null) {
  return CATEGORY_COLORS[cat ?? ''] ?? CATEGORY_COLORS.other;
}

function formatEventDate(iso: string | null): { month: string; day: string; time: string } {
  if (!iso) return { month: '—', day: '—', time: '' };
  const d = new Date(iso);
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day:   String(d.getDate()),
    time:  d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function EventsScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const msaId = activeMembership?.msaId ?? '';

  const [events,     setEvents]     = useState<CampusEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (isRefresh = false) => {
    if (!msaId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);

    const { data, error } = await supabase
      .from('campus_events')
      .select('id, title, body, event_start, event_end, location, category, is_published, created_at')
      .eq('msa_id', msaId)
      .order('event_start', { ascending: false });

    if (error) Alert.alert('Error', error.message);
    else setEvents((data ?? []) as CampusEvent[]);

    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [msaId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Render ────────────────────────────────────────────────────────────────

  const published = events.filter(e => e.is_published);
  const drafts    = events.filter(e => !e.is_published);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Events</Text>
          <Text style={s.headerSub}>{activeMembership?.msaName ?? ''}</Text>
        </View>
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => router.push('/(msa)/events/new' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={Brand.green} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={Brand.green}
            />
          }
        >
          {/* Stats strip */}
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statNum}>{events.length}</Text>
              <Text style={s.statLabel}>Total</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.statItem}>
              <Text style={s.statNum}>{published.length}</Text>
              <Text style={s.statLabel}>Published</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.statItem}>
              <Text style={s.statNum}>{drafts.length}</Text>
              <Text style={s.statLabel}>Drafts</Text>
            </View>
          </View>

          {/* Empty state */}
          {events.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={Brand.textMuted} />
              <Text style={s.emptyTitle}>No events yet</Text>
              <Text style={s.emptyBody}>Tap "New" to create your first campus event.</Text>
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => router.push('/(msa)/events/new' as any)}
                activeOpacity={0.8}
              >
                <Text style={s.emptyBtnText}>Create Event</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Drafts section */}
          {drafts.length > 0 && (
            <>
              <Text style={s.sectionLabel}>DRAFTS</Text>
              <View style={s.card}>
                {drafts.map((evt, idx) => (
                  <EventRow
                    key={evt.id}
                    event={evt}
                    isLast={idx === drafts.length - 1}
                    onPress={() => router.push(`/(msa)/events/${evt.id}` as any)}
                  />
                ))}
              </View>
            </>
          )}

          {/* Published section */}
          {published.length > 0 && (
            <>
              <Text style={s.sectionLabel}>PUBLISHED</Text>
              <View style={s.card}>
                {published.map((evt, idx) => (
                  <EventRow
                    key={evt.id}
                    event={evt}
                    isLast={idx === published.length - 1}
                    onPress={() => router.push(`/(msa)/events/${evt.id}` as any)}
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Event Row ─────────────────────────────────────────────────────────────────

function EventRow({ event, isLast, onPress }: {
  event: CampusEvent; isLast: boolean; onPress: () => void;
}) {
  const { month, day, time } = formatEventDate(event.event_start);
  const catStyle = getCatStyle(event.category);

  return (
    <>
      <TouchableOpacity style={s.eventRow} onPress={onPress} activeOpacity={0.75}>
        <View style={s.dateTile}>
          <Text style={s.dateTileMonth}>{month}</Text>
          <Text style={s.dateTileDay}>{day}</Text>
        </View>
        <View style={s.eventInfo}>
          <Text style={s.eventTitle} numberOfLines={1}>{event.title}</Text>
          <View style={s.eventMeta}>
            {time ? <Text style={s.eventTime}>{time}</Text> : null}
            {event.location ? (
              <>
                <Text style={s.metaDot}>·</Text>
                <Text style={s.eventTime} numberOfLines={1}>{event.location}</Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={s.eventRight}>
          {event.category && (
            <View style={[s.catChip, { backgroundColor: catStyle.bg }]}>
              <Text style={[s.catChipText, { color: catStyle.text }]}>
                {event.category}
              </Text>
            </View>
          )}
          {!event.is_published && (
            <View style={s.draftBadge}>
              <Text style={s.draftBadgeText}>Draft</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={15} color={Brand.textMuted} />
        </View>
      </TouchableOpacity>
      {!isLast && <View style={s.rowDivider} />}
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Brand.cream },
  flex:    { flex: 1 },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Brand.hairline,
  },
  backBtn:      { padding: 4, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: Brand.textDark },
  headerSub:    { fontSize: 12, color: Brand.textMuted, marginTop: 1 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Brand.deepGreen, borderRadius: Radius.chip,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  newBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  scroll: { padding: Spacing.md, gap: Spacing.md },

  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderRadius: Radius.card, borderWidth: 1, borderColor: Brand.hairline,
    padding: Spacing.md,
  },
  statItem:  { flex: 1, alignItems: 'center' },
  statNum:   { fontSize: 22, fontWeight: '800', color: Brand.deepGreen },
  statLabel: { fontSize: 11, color: Brand.textMuted, marginTop: 2 },
  statDiv:   { width: 1, backgroundColor: Brand.hairline },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Brand.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4,
  },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Brand.textDark },
  emptyBody:  { fontSize: 13, color: Brand.textMuted, textAlign: 'center' },
  emptyBtn: {
    marginTop: 8, backgroundColor: Brand.deepGreen,
    borderRadius: Radius.chip, paddingHorizontal: 20, paddingVertical: 10,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline, overflow: 'hidden',
  },
  rowDivider: { height: 1, backgroundColor: Brand.hairline, marginLeft: 72 },

  eventRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 13, gap: 12,
  },
  dateTile: {
    width: 44, height: 48, borderRadius: 10,
    backgroundColor: '#EFF6F1', alignItems: 'center', justifyContent: 'center',
  },
  dateTileMonth: { fontSize: 9, fontWeight: '700', color: Brand.green, letterSpacing: 0.5 },
  dateTileDay:   { fontSize: 20, fontWeight: '800', color: Brand.deepGreen, lineHeight: 24 },
  eventInfo:     { flex: 1 },
  eventTitle:    { fontSize: 14, fontWeight: '700', color: Brand.textDark },
  eventMeta:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  eventTime:     { fontSize: 12, color: Brand.textMuted },
  metaDot:       { fontSize: 12, color: Brand.hairline },
  eventRight:    { alignItems: 'flex-end', gap: 4 },
  catChip: {
    borderRadius: Radius.chip, paddingHorizontal: 8, paddingVertical: 2,
  },
  catChipText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  draftBadge: {
    backgroundColor: '#FFF7ED', borderRadius: Radius.chip,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  draftBadgeText: { fontSize: 10, fontWeight: '700', color: '#9A3412' },
});
