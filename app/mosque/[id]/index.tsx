import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, Platform,
  ScrollView, SectionList, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../../lib/guestLoginIntent';
import { Brand } from '../../../lib/theme';
import { generateInviteCode, searchMosquesByName } from '../../../lib/mosques/manual';
import { loadPrayerSettings, updatePrayerSettings } from '../../../lib/prayer/settingsStore';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const IQAMA_LABELS: { key: string; label: string }[] = [
  { key: 'fajr',    label: 'Fajr'    },
  { key: 'dhuhr',   label: 'Dhuhr'   },
  { key: 'asr',     label: 'Asr'     },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha',    label: 'Isha'    },
];

const IQAMA_ICONS: Record<string, any> = {
  fajr:    'moon-outline',
  dhuhr:   'sunny-outline',
  asr:     'partly-sunny-outline',
  maghrib: 'sunny',
  isha:    'moon',
};

const IQAMA_COLORS: Record<string, string> = {
  fajr:    DEEP_GREEN,
  dhuhr:   '#C68B2F',
  asr:     '#C68B2F',
  maghrib: '#C68B2F',
  isha:    DEEP_GREEN,
};

// Parse "1:15 PM", "5:30 AM", or "13:00" → minutes since midnight, or null.
function parseIqamaMins(t: string): number | null {
  if (!t) return null;
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

// Returns which prayer key is currently active (last iqama that passed)
// and which is next (soonest iqama that hasn't passed yet).
function getIqamaState(iqamaTimes: Record<string, string>): {
  active: string | null;
  next: string | null;
} {
  const now = new Date();
  const curMins = now.getHours() * 60 + now.getMinutes();

  const prayers = IQAMA_LABELS
    .map(l => ({ key: l.key, mins: parseIqamaMins(iqamaTimes[l.key] ?? '') }))
    .filter((p): p is { key: string; mins: number } => p.mins !== null);

  let active: string | null = null;
  let next:   string | null = null;

  for (const p of prayers) {
    if (p.mins <= curMins) active = p.key;
    else if (next === null) next = p.key;
  }

  // Before Fajr: nothing active yet, Fajr is next
  if (active === null && prayers.length > 0) next = prayers[0].key;

  return { active, next };
}

interface Amenities {
  sisters_section?: boolean;
  wudu?: boolean;
  wheelchair?: boolean;
  parking?: boolean;
  kids_area?: boolean;
  halal_food?: boolean;
}

const AMENITY_LABELS: { key: keyof Amenities; label: string; icon: string }[] = [
  { key: 'sisters_section', label: "Sisters' Section",   icon: 'people-outline' },
  { key: 'wudu',            label: 'Wudu Facilities',    icon: 'water-outline' },
  { key: 'wheelchair',      label: 'Wheelchair Access',  icon: 'accessibility-outline' },
  { key: 'parking',         label: 'Parking',            icon: 'car-outline' },
  { key: 'kids_area',       label: 'Kids Area',          icon: 'happy-outline' },
  { key: 'halal_food',      label: 'Halal Food',         icon: 'restaurant-outline' },
];

interface MosqueRow {
  id: string;
  osm_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  owner_id: string | null;
  cover_image_url: string | null;
  amenities: Amenities | null;
  // invite_code is NOT selectable here — see 022_mosque_invite_code_lockdown.sql.
  // Admins read it via the get_mosque_invite_code() RPC into adminInviteCode
  // state below, not off this row.
  description: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  iqama_times: Record<string, string> | null;
  jummah_sessions: JummahSession[] | null;
  iqama_updated_at: string | null;
}



interface JummahSession {
  time: string;
  khateeb: string | null;
}

interface MosquePost {
  id: string;
  type: 'event' | 'announcement';
  title: string;
  body: string | null;
  categories: string[];
  category: string | null;
  event_start: string | null;
  event_end: string | null;
  source_url: string | null;
}

/** Splits the body into {description, location}.
 *  extractJsonLdEvents() appends "Location: ..." as the last line of body. */
function parseEventBody(raw: string | null): { description: string | null; location: string | null } {
  if (!raw) return { description: null, location: null };
  const clean = stripHtml(raw);
  const locMatch = clean.match(/\nLocation:\s*(.+)$/);
  if (locMatch) {
    const description = clean.slice(0, locMatch.index).trim() || null;
    return { description, location: locMatch[1].trim() };
  }
  return { description: clean || null, location: null };
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\\n/g, ' ')   // literal \n escape sequences from JSON-LD sources
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatIqamaUpdated(iso: string): string {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Updated today';
  if (diffDays === 1) return 'Updated yesterday';
  if (diffDays < 7) return `Updated ${diffDays} days ago`;
  return `Updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function formatEventRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const startStr = start.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  if (!endIso) return startStr;
  const end = new Date(endIso);
  const endStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${startStr} – ${endStr}`;
}

export default function MosqueDetailScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; address?: string; lat?: string; lng?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();

  // osm_id in URLs uses ':' instead of '/' (e.g. "node:123456789") to avoid
  // React Navigation splitting the path on a decoded %2F before route matching.
  const osmId = decodeURIComponent(params.id ?? '').replace(':', '/');

  const [mosque,  setMosque]  = useState<MosqueRow | null>(null);
  const [posts,   setPosts]   = useState<MosquePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  // When this OSM element has no page but another element with a matching
  // name does — OSM commonly has more than one element (a building "way"
  // and a separate POI "node") for the same physical mosque — this points
  // at the existing page instead of silently offering to create a duplicate.
  const [possibleExisting, setPossibleExisting] = useState<{ osmId: string; name: string } | null>(null);
  // Admin-only, fetched via RPC (invite_code is no longer a selectable
  // column for anyone — see 022_mosque_invite_code_lockdown.sql).
  const [adminInviteCode, setAdminInviteCode] = useState<string | null>(null);
  // Local device preference (lib/prayer/settingsStore.ts), independent of
  // the mosque row lookup above — re-read on every focus so toggling it
  // here or clearing it from Home's settings sheet stays in sync.
  const [followedMosqueId, setFollowedMosqueId] = useState<string | null>(null);
  const [selectedEvent,  setSelectedEvent]  = useState<MosquePost | null>(null);
  const [activeReminder,  setActiveReminder]  = useState<{ lead_minutes: number } | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);

  useEffect(() => {
    if (!selectedEvent?.event_start || !user) { setActiveReminder(null); return; }
    supabase
      .from('event_reminders')
      .select('lead_minutes')
      .eq('post_id', selectedEvent.id)
      .eq('user_id', user.id)
      .eq('sent', false)
      .maybeSingle()
      .then(({ data }) => setActiveReminder(data ?? null));
  }, [selectedEvent?.id, user?.id]);

  const saveReminder = async (leadMinutes: number) => {
    if (!selectedEvent) return;
    setReminderLoading(true);
    const { error } = await supabase.functions.invoke('set-event-reminder', {
      body: { postId: selectedEvent.id, leadMinutes },
    });
    if (error) Alert.alert('Error', 'Could not save reminder. Please try again.');
    else setActiveReminder({ lead_minutes: leadMinutes });
    setReminderLoading(false);
  };

  const removeReminder = async () => {
    if (!selectedEvent || !activeReminder) return;
    setReminderLoading(true);
    await supabase.functions.invoke('set-event-reminder', {
      body: { postId: selectedEvent.id, leadMinutes: activeReminder.lead_minutes, action: 'delete' },
    });
    setActiveReminder(null);
    setReminderLoading(false);
  };

  const promptSetReminder = () => {
    Alert.alert('Set Reminder', 'How far in advance?', [
      { text: '1 hour before',  onPress: () => saveReminder(60) },
      { text: '1 day before',   onPress: () => saveReminder(1440) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  useFocusEffect(useCallback(() => {
    loadPrayerSettings(null).then(s => setFollowedMosqueId(s.followedMosqueId));
  }, []));

  const toggleFollow = async () => {
    if (!mosque) return;
    const isFollowing = followedMosqueId === mosque.id;
    const next = await updatePrayerSettings({ followedMosqueId: isFollowing ? null : mosque.id });
    setFollowedMosqueId(next.followedMosqueId);

    // Sync to DB for signed-in users so the server can notify them on updates.
    // Guest follows remain local only (AsyncStorage) — no push token to target.
    if (user) {
      if (isFollowing) {
        supabase.from('mosque_follows')
          .delete()
          .eq('user_id', user.id)
          .eq('mosque_id', mosque.id)
          .then(() => {}).catch(() => {});
      } else {
        supabase.from('mosque_follows')
          .upsert({ user_id: user.id, mosque_id: mosque.id }, { onConflict: 'user_id,mosque_id' })
          .then(() => {}).catch(() => {});
      }
    }
  };

  const loadData = useCallback(async () => {
    if (!osmId) return;
    setLoading(true);

    const { data: m } = await supabase
      .from('mosques')
      .select('id, osm_id, name, address, lat, lng, owner_id, cover_image_url, amenities, description, contact_phone, contact_email, website, iqama_times, jummah_sessions, iqama_updated_at')
      .eq('osm_id', osmId)
      .maybeSingle();

    setMosque(m as MosqueRow | null);
    setPossibleExisting(null);
    // Unblock the main render here rather than after the second query below —
    // everything shown above the events/announcements cards (including
    // Jummah, which lives on this same row) is already known at this point,
    // so there's no reason to keep it behind a spinner while posts load too.
    setLoading(false);

    if (m) {
      const eventCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: p } = await supabase
        .from('mosque_posts')
        .select('id, type, title, body, categories, category, event_start, event_end, source_url')
        .eq('mosque_id', m.id)
        .or(`type.eq.announcement,event_start.is.null,event_start.gte.${eventCutoff}`)
        .order('event_start', { ascending: true, nullsFirst: false });
      setPosts((p as MosquePost[]) ?? []);

      if (isAdmin && !m.owner_id) {
        const { data: code } = await supabase.rpc('get_mosque_invite_code', { p_mosque_id: m.id });
        setAdminInviteCode(code ?? null);
      } else {
        setAdminInviteCode(null);
      }
    } else {
      setAdminInviteCode(null);
      setPosts([]);

      // Generic OSM fallback labels aren't real names — searching for
      // "Mosque" would match nearly everything, so skip the fallback then.
      const nameToCheck = params.name;
      if (nameToCheck && nameToCheck !== 'Mosque' && nameToCheck !== 'Musalla / Prayer Room') {
        // distanceMi isn't used here (only .id/.name), so the anchor point
        // is arbitrary — reuse whatever coords came along with this element.
        const anchorLat = params.lat ? Number(params.lat) : 0;
        const anchorLng = params.lng ? Number(params.lng) : 0;
        const matches = await searchMosquesByName(nameToCheck, anchorLat, anchorLng).catch(() => []);
        const match = matches.find(x => x.id !== osmId);
        if (match) setPossibleExisting({ osmId: match.id, name: match.name });
      }
    }
  }, [osmId, params.name]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Fallback display fields sourced from the OSM list result (passed via
  // nav params) so an unclaimed mosque doesn't need a second network call.
  const displayName    = mosque?.name    ?? params.name    ?? 'Mosque';
  const displayAddress = mosque?.address ?? params.address ?? null;

  const openDirections = () => {
    if (!displayAddress) return;
    const q = encodeURIComponent(displayAddress);
    const url = Platform.OS === 'ios' ? `maps://0,0?q=${q}` : `geo:0,0?q=${q}`;
    Linking.canOpenURL(url).then(ok => Linking.openURL(ok ? url : `https://maps.google.com/?q=${q}`));
  };

  const createPage = async () => {
    setCreating(true);
    try {
      const inviteCode = generateInviteCode();
      const { data, error } = await supabase
        .from('mosques')
        .upsert(
          {
            osm_id: osmId,
            name: params.name ?? displayName,
            address: params.address ?? null,
            lat: params.lat ? Number(params.lat) : null,
            lng: params.lng ? Number(params.lng) : null,
            invite_code: inviteCode,
            invite_code_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'osm_id' },
        )
        // invite_code deliberately excluded — no longer a selectable column
        // for anyone (see 022_mosque_invite_code_lockdown.sql). We already
        // have the value we just generated in `inviteCode` above, so there's
        // nothing to read back.
        .select('id, osm_id, name, address, lat, lng, owner_id, cover_image_url, amenities, description, contact_phone, contact_email, website, iqama_times, jummah_sessions')
        .single();

      if (error) throw new Error(error.message);
      setMosque(data as MosqueRow);
      setAdminInviteCode(inviteCode);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCreating(false);
    }
  };

  const shareInviteCode = async () => {
    if (!mosque || !adminInviteCode) return;
    await Share.share({
      message: `You've been invited to manage ${mosque.name}'s page on Rihdal. Open the app, go to Profile → Manage a Mosque, and enter this code: ${adminInviteCode}`,
    });
  };

  const isOwner = !!user && mosque?.owner_id === user.id;
  const canManage = isOwner || (isAdmin && !!mosque);

  const upcomingEvents = posts.filter(p => p.type === 'event' && (!p.event_start || new Date(p.event_start) >= new Date()));
  const announcements  = posts.filter(p => p.type === 'announcement');
  const [showEventsModal, setShowEventsModal] = useState(false);
  const previewEvents = upcomingEvents.slice(0, 3);

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.heroPlaceholder} />
        <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.flex}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* ── Hero ── */}
        <View style={s.heroContainer}>
          <Image
            source={mosque?.cover_image_url
              ? { uri: mosque.cover_image_url }
              : require('../../../explore/MasjidPage.png')}
            style={s.heroImage}
            contentFit="cover"
          />
          {/* Dark overlay only when showing a custom cover photo (decorative bg is already styled) */}
          {mosque?.cover_image_url ? <View style={s.heroOverlay} /> : null}
          {/* back button overlaid */}
          <TouchableOpacity
            style={[s.heroBackBtn, { top: insets.top + 12 }]}
            onPress={() => router.back()}
            hitSlop={10}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Identity block ── */}
        <View style={s.identityBlock}>
          {/* avatar tile */}
          <View style={s.avatarTile}>
            <MaterialCommunityIcons name="mosque" size={28} color={GREEN} />
          </View>

          <View style={s.identityText}>
            <View style={s.nameRow}>
              <Text style={s.name} numberOfLines={2}>{displayName}</Text>
              {mosque?.owner_id ? (
                <Ionicons name="checkmark-circle" size={18} color={GREEN} style={{ marginLeft: 6, marginTop: 2 }} />
              ) : null}
            </View>
            {displayAddress ? (
              <TouchableOpacity style={s.addressRow} onPress={openDirections}>
                <Ionicons name="location-outline" size={13} color={GREEN} />
                <Text style={s.addressText} numberOfLines={1}>{displayAddress}</Text>
                <Ionicons name="chevron-forward" size={12} color={GREEN} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {mosque?.description ? (
          <Text style={s.description}>{mosque.description}</Text>
        ) : null}

        {/* iqama times */}
        {mosque?.iqama_times && Object.keys(mosque.iqama_times).length > 0 ? (() => {
          const { active, next } = getIqamaState(mosque.iqama_times!);
          return (
            <View style={s.card}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Iqama Times</Text>
                {mosque.iqama_updated_at ? (
                  <Text style={s.iqamaUpdated}>{formatIqamaUpdated(mosque.iqama_updated_at)}</Text>
                ) : null}
              </View>
              <View style={s.iqamaGrid}>
                {IQAMA_LABELS.map((l, i) => {
                  const time    = mosque.iqama_times?.[l.key];
                  const isNext  = l.key === next;
                  const isActive = l.key === active;
                  return (
                    <View
                      key={l.key}
                      style={[
                        s.iqamaCell,
                        i < IQAMA_LABELS.length - 1 && s.iqamaCellBorder,
                        isNext   && s.iqamaCellNext,
                        isActive && s.iqamaCellActive,
                      ]}
                    >
                      <Ionicons
                        name={IQAMA_ICONS[l.key]}
                        size={22}
                        color={isNext ? '#fff' : IQAMA_COLORS[l.key]}
                      />
                      <Text style={[s.iqamaLabel, isNext && s.iqamaLabelNext]}>
                        {l.label}
                      </Text>
                      <Text style={[s.iqamaTime, !time && s.iqamaTimeMuted, isNext && s.iqamaTimeNext]}>
                        {time ?? '—'}
                      </Text>
                      {isNext && (
                        <View style={s.nextBadge}>
                          <Text style={s.nextBadgeText}>NEXT</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })() : null}

        {/* follow for Iqama times — placed after the iqama grid so the
            payoff (actual times) is visible before asking for the follow */}
        {mosque && (
          <TouchableOpacity
            style={followedMosqueId === mosque.id ? s.followBtnActive : s.followBtn}
            onPress={toggleFollow}
            activeOpacity={0.85}
          >
            <Ionicons
              name={followedMosqueId === mosque.id ? 'checkmark-circle' : 'notifications-outline'}
              size={16}
              color={followedMosqueId === mosque.id ? GREEN : '#fff'}
            />
            <Text style={followedMosqueId === mosque.id ? s.followBtnTextActive : s.followBtnText}>
              {followedMosqueId === mosque.id ? 'Following for Iqama Times' : 'Follow for Iqama Times'}
            </Text>
            {followedMosqueId !== mosque.id && <Ionicons name="chevron-forward" size={14} color="#fff" />}
          </TouchableOpacity>
        )}
        {mosque && followedMosqueId === mosque.id && !user && (
          <Text style={s.followNote}>Sign in to get notified when times change.</Text>
        )}

        {/* jummah sessions — multiple slots, each with its own khateeb,
            re-entered weekly by the mosque, so shown separately from the
            otherwise-static iqama times above */}
        {mosque?.jummah_sessions && mosque.jummah_sessions.length > 0 ? (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Jummah</Text>
            {mosque.jummah_sessions.map((j, i) => (
              <View key={i} style={s.jummahRow}>
                <Text style={s.iqamaTime}>{j.time}</Text>
                {j.khateeb ? <Text style={s.jummahKhateeb}>Khateeb: {j.khateeb}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* contact info */}
        {(mosque?.contact_phone || mosque?.contact_email || mosque?.website) ? (
          <View style={s.card}>
            {mosque.contact_phone ? (
              <TouchableOpacity style={s.detailRow} onPress={() => Linking.openURL(`tel:${mosque.contact_phone}`)}>
                <Ionicons name="call-outline" size={18} color={GREEN} />
                <Text style={[s.detailText, s.link]}>{mosque.contact_phone}</Text>
              </TouchableOpacity>
            ) : null}
            {mosque.contact_email ? (
              <TouchableOpacity style={s.detailRow} onPress={() => Linking.openURL(`mailto:${mosque.contact_email}`)}>
                <Ionicons name="mail-outline" size={18} color={GREEN} />
                <Text style={[s.detailText, s.link]} numberOfLines={1}>{mosque.contact_email}</Text>
              </TouchableOpacity>
            ) : null}
            {mosque.website ? (
              <TouchableOpacity style={s.detailRow} onPress={() => Linking.openURL(mosque.website!)}>
                <Ionicons name="globe-outline" size={18} color={GREEN} />
                <Text style={[s.detailText, s.link]} numberOfLines={1}>{mosque.website}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* ── Amenities / Facilities ── */}
        {mosque?.amenities && Object.values(mosque.amenities).some(Boolean) ? (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Facilities</Text>
            <View style={s.amenitiesRow}>
              {AMENITY_LABELS.filter(a => mosque.amenities?.[a.key]).map(a => (
                <View key={a.key} style={s.amenityChip}>
                  <Ionicons name={a.icon as any} size={13} color={DEEP_GREEN} />
                  <Text style={s.amenityChipText}>{a.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* upcoming events */}
        {upcomingEvents.length > 0 ? (
          <View style={s.card}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Upcoming Events</Text>
              {upcomingEvents.length > 3 ? (
                <TouchableOpacity onPress={() => setShowEventsModal(true)} hitSlop={8}>
                  <Text style={s.viewAll}>View all ({upcomingEvents.length})</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {previewEvents.map((ev, i) => {
              const { location } = parseEventBody(ev.body);
              const date = ev.event_start ? new Date(ev.event_start) : null;
              const month = date ? date.toLocaleString('en-US', { month: 'short' }).toUpperCase() : null;
              const day   = date ? date.getDate() : null;
              const time  = date ? date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
              return (
                <TouchableOpacity
                  key={ev.id}
                  style={[s.eventRow, i > 0 && s.eventRowBorder]}
                  onPress={() => setSelectedEvent(ev)}
                  activeOpacity={0.7}
                >
                  {date ? (
                    <View style={s.dateTile}>
                      <Text style={s.dateTileMonth}>{month}</Text>
                      <Text style={s.dateTileDay}>{day}</Text>
                    </View>
                  ) : (
                    <View style={s.dateTile}>
                      <Ionicons name="calendar-outline" size={20} color={GREEN} />
                    </View>
                  )}
                  <View style={s.eventDetails}>
                    <Text style={s.eventTitle} numberOfLines={1}>{ev.title}</Text>
                    {time ? <Text style={s.eventMeta} numberOfLines={1}>{time}</Text> : null}
                    {location ? (
                      <View style={s.eventLocationRow}>
                        <Ionicons name="location-outline" size={11} color={TEXT_MUTED} />
                        <Text style={s.eventLocation} numberOfLines={1}>{location}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={s.eventRight}>
                    <View style={s.upcomingBadge}>
                      <Text style={s.upcomingBadgeText}>Upcoming</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={TEXT_MUTED} style={{ marginTop: 4 }} />
                  </View>
                </TouchableOpacity>
              );
            })}
            {upcomingEvents.length > 3 && (
              <TouchableOpacity
                style={s.viewAllRow}
                onPress={() => setShowEventsModal(true)}
                activeOpacity={0.75}
              >
                <Text style={s.viewAllRowText}>View all {upcomingEvents.length} events</Text>
                <Ionicons name="arrow-forward" size={14} color={GREEN} />
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* all events modal */}
        <AllEventsModal
          visible={showEventsModal}
          onClose={() => setShowEventsModal(false)}
          events={upcomingEvents}
          mosqueName={displayName}
          user={user}
          router={router}
        />

        {/* event detail modal */}
        <Modal
          visible={!!selectedEvent}
          animationType="slide"
          transparent
          onRequestClose={() => setSelectedEvent(null)}
        >
          <TouchableOpacity
            style={s.modalOverlay}
            activeOpacity={1}
            onPress={() => setSelectedEvent(null)}
          >
            <TouchableOpacity activeOpacity={1} style={[s.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
              {selectedEvent ? (() => {
                const { description, location } = parseEventBody(selectedEvent.body);
                return (
                  <>
                    <View style={s.modalHandle} />

                    <ScrollView showsVerticalScrollIndicator={false}>
                      {(selectedEvent.categories?.length > 0 ? selectedEvent.categories : selectedEvent.category ? [selectedEvent.category] : []).map(cat => (
                        <Text key={cat} style={s.modalCategory}>{cat.toUpperCase()}</Text>
                      ))}

                      <Text style={s.modalTitle}>{selectedEvent.title}</Text>

                      {selectedEvent.event_start ? (
                        <View style={s.modalRow}>
                          <Ionicons name="time-outline" size={16} color={GREEN} />
                          <Text style={s.modalRowText}>
                            {formatEventRange(selectedEvent.event_start, selectedEvent.event_end)}
                          </Text>
                        </View>
                      ) : null}

                      {location ? (
                        <View style={s.modalRow}>
                          <Ionicons name="location-outline" size={16} color={GREEN} />
                          <Text style={s.modalRowText}>{location}</Text>
                        </View>
                      ) : null}

                      {description ? (
                        <Text style={s.modalBody}>{description}</Text>
                      ) : null}
                    </ScrollView>

                    {selectedEvent.source_url ? (
                      <TouchableOpacity
                        style={s.modalLinkBtn}
                        onPress={() => Linking.openURL(selectedEvent.source_url!)}
                      >
                        <Ionicons name="open-outline" size={15} color={GREEN} />
                        <Text style={s.modalLinkBtnText}>View on website</Text>
                      </TouchableOpacity>
                    ) : null}

                    {selectedEvent.event_start && new Date(selectedEvent.event_start) > new Date() && (
                      <TouchableOpacity
                        style={[s.modalCloseBtn, s.modalReminderBtn, activeReminder && s.modalReminderBtnActive]}
                        onPress={() => {
                          if (!user) {
                            setSelectedEvent(null);
                            setGuestLoginIntent(true);
                            router.push('/(auth)/login');
                          } else if (activeReminder) {
                            Alert.alert(
                              'Remove Reminder',
                              `Remove your ${activeReminder.lead_minutes === 60 ? '1 hour' : '1 day'} reminder?`,
                              [
                                { text: 'Remove', style: 'destructive', onPress: removeReminder },
                                { text: 'Cancel', style: 'cancel' },
                              ],
                            );
                          } else {
                            promptSetReminder();
                          }
                        }}
                        disabled={reminderLoading}
                      >
                        {reminderLoading
                          ? <ActivityIndicator size="small" color={activeReminder ? GREEN : TEXT_MUTED} />
                          : <Ionicons
                              name={activeReminder ? 'notifications' : 'notifications-outline'}
                              size={16}
                              color={activeReminder ? GREEN : TEXT_MUTED}
                            />
                        }
                        <Text style={[s.modalReminderBtnText, activeReminder && { color: GREEN }]}>
                          {activeReminder
                            ? `Reminder set (${activeReminder.lead_minutes === 60 ? '1 hr' : '1 day'} before) · Remove`
                            : !user ? 'Sign in to set a reminder' : 'Set Reminder'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={s.modalCloseBtn} onPress={() => setSelectedEvent(null)}>
                      <Text style={s.modalCloseBtnText}>Close</Text>
                    </TouchableOpacity>
                  </>
                );
              })() : null}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* announcements */}
        {announcements.length > 0 ? (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Announcements</Text>
            {announcements.map(a => (
              <View key={a.id} style={s.postRow}>
                <Ionicons name="megaphone-outline" size={16} color={GREEN} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.postTitle}>{a.title}</Text>
                  {a.body ? <Text style={s.postBody}>{a.body}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* manage entry point */}
        {canManage && (
          <TouchableOpacity
            style={s.manageBtn}
            onPress={() => router.push(`/mosque/${mosque!.id}/manage` as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={16} color={GREEN} />
            <Text style={s.manageBtnText}>Manage this page</Text>
            <Ionicons name="chevron-forward" size={14} color={GREEN} />
          </TouchableOpacity>
        )}

        {/* this OSM element has no page, but another element with a
            matching name does — OSM often has more than one element (a
            building outline + a separate POI marker) for the same mosque */}
        {!mosque && possibleExisting && (
          <TouchableOpacity
            style={s.existingBanner}
            onPress={() => router.push(`/mosque/${possibleExisting.osmId.replace('/', ':')}` as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="information-circle-outline" size={18} color={GREEN} />
            <View style={{ flex: 1 }}>
              <Text style={s.existingBannerTitle}>This mosque may already have a page</Text>
              <Text style={s.existingBannerText}>{possibleExisting.name} — tap to view it</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={GREEN} />
          </TouchableOpacity>
        )}

        {/* admin: create page */}
        {isAdmin && !mosque && (
          <View style={s.adminCard}>
            <Text style={s.adminCardTitle}>Admin</Text>
            <Text style={s.adminCardText}>
              This mosque doesn't have a Rihdal page yet. Create one if you're onboarding this mosque as a partner.
            </Text>
            <TouchableOpacity style={s.adminBtn} onPress={createPage} disabled={creating} activeOpacity={0.85}>
              {creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.adminBtnText}>Create Page for This Mosque</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* admin: share invite code while unclaimed */}
        {isAdmin && mosque && !mosque.owner_id && adminInviteCode && (
          <View style={s.adminCard}>
            <Text style={s.adminCardTitle}>Invite Code</Text>
            <Text style={s.adminCardText}>
              Share this code with the mosque's contact so they can claim and manage this page.
            </Text>
            <Text style={s.inviteCode}>{adminInviteCode}</Text>
            <TouchableOpacity style={s.adminBtn} onPress={shareInviteCode} activeOpacity={0.85}>
              <Text style={s.adminBtnText}>Share Invite Code</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Hero ──
  heroPlaceholder: { height: 220, backgroundColor: DEEP_GREEN },
  heroContainer:   { height: 220, position: 'relative' },
  heroImage:       { width: '100%', height: 220 },
  heroOverlay:     { position: 'absolute', width: '100%', height: 220, backgroundColor: 'rgba(0,0,0,0.35)' },
  heroBackBtn: {
    position: 'absolute', left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Identity block ──
  identityBlock: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 14,
  },
  avatarTile: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: '#EFF6F1',
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
    marginTop: -28,
  },
  identityText: { flex: 1, paddingTop: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { flex: 1, fontSize: 20, fontWeight: '800', color: TEXT_DARK, lineHeight: 26 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  addressText: { flex: 1, fontSize: 12, color: TEXT_MUTED },

  description: { fontSize: 14, color: TEXT_MUTED, lineHeight: 20, marginHorizontal: 16, marginTop: 6, marginBottom: 4 },

  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    gap: 12,
  },
  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailText: { flex: 1, fontSize: 14, color: TEXT_DARK, lineHeight: 20 },
  link:       { color: GREEN, textDecorationLine: 'underline' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },
  iqamaUpdated: { fontSize: 11, color: TEXT_MUTED, fontWeight: '500' },
  viewAll: { fontSize: 13, fontWeight: '600', color: GREEN },
  viewAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  viewAllRowText: { fontSize: 14, fontWeight: '700', color: GREEN },

  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  eventRowBorder: { borderTopWidth: 1, borderTopColor: HAIRLINE },
  dateTile: {
    width: 52, height: 56, borderRadius: 12,
    backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  dateTileMonth: { fontSize: 10, fontWeight: '700', color: GREEN, letterSpacing: 0.5 },
  dateTileDay:   { fontSize: 22, fontWeight: '800', color: DEEP_GREEN, lineHeight: 26 },
  eventDetails:  { flex: 1, gap: 2 },
  eventTitle:    { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  eventMeta:     { fontSize: 12, color: TEXT_MUTED },
  eventLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eventLocation:    { fontSize: 12, color: TEXT_MUTED, flex: 1 },
  eventRight: { alignItems: 'center', gap: 2, flexShrink: 0 },
  upcomingBadge: {
    backgroundColor: '#EFF6F1', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  upcomingBadgeText: { fontSize: 11, fontWeight: '600', color: GREEN },

  iqamaGrid: { flexDirection: 'row', marginTop: 4 },
  iqamaCell: {
    flex: 1, alignItems: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 10,
  },
  iqamaCellBorder: { borderRightWidth: 1, borderRightColor: HAIRLINE },
  // Next upcoming prayer — deep green fill
  iqamaCellNext: {
    backgroundColor: DEEP_GREEN, borderRadius: 10,
    borderRightWidth: 0,
    marginHorizontal: 2,
    shadowColor: DEEP_GREEN, shadowOpacity: 0.3, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  // Currently active prayer (iqama has passed, window ongoing) — subtle tint
  iqamaCellActive: {
    backgroundColor: DEEP_GREEN + '14', borderRadius: 10,
    borderRightWidth: 0, marginHorizontal: 2,
  },
  iqamaLabel:      { fontSize: 11, color: TEXT_MUTED, fontWeight: '500' },
  iqamaLabelNext:  { color: 'rgba(255,255,255,0.75)' },
  iqamaTime:       { fontSize: 12, fontWeight: '700', color: TEXT_DARK },
  iqamaTimeNext:   { color: '#fff' },
  iqamaTimeMuted:  { color: TEXT_MUTED, fontWeight: '400' },
  nextBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginTop: 1,
  },
  nextBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  jummahRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: HAIRLINE },
  jummahKhateeb: { fontSize: 13, color: TEXT_MUTED, marginTop: 2 },

  // ── Amenities ──
  amenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  amenityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#EFF6F1', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  amenityChipText: { fontSize: 12, fontWeight: '600', color: DEEP_GREEN },

  postRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  postTitle: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  postMeta:  { fontSize: 12, color: GREEN, fontWeight: '600', marginTop: 1 },
  postBody:  { fontSize: 13, color: TEXT_MUTED, marginTop: 3, lineHeight: 18 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 20,
  },
  modalCategory: {
    fontSize: 11, fontWeight: '700', color: GREEN,
    letterSpacing: 0.8, marginBottom: 6,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: TEXT_DARK, lineHeight: 26, marginBottom: 16 },
  modalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  modalRowText: { flex: 1, fontSize: 14, color: TEXT_DARK, lineHeight: 20 },
  modalBody: {
    fontSize: 14, color: TEXT_MUTED, lineHeight: 22,
    marginTop: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  modalLinkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 20, borderWidth: 1.5, borderColor: GREEN,
    borderRadius: 14, paddingVertical: 13,
  },
  modalLinkBtnText: { fontSize: 14, fontWeight: '600', color: GREEN },
  modalCloseBtn: {
    marginTop: 10, backgroundColor: DEEP_GREEN,
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  modalCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalReminderBtn: {
    flexDirection: 'row', gap: 6, justifyContent: 'center',
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  modalReminderBtnActive: {
    backgroundColor: GREEN + '12', borderColor: GREEN + '40',
  },
  modalReminderBtnText: { color: TEXT_MUTED, fontSize: 15, fontWeight: '700' },

  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#f0faf6', borderWidth: 1.5, borderColor: '#c3e8d8',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
  },
  manageBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: GREEN },

  followBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  followBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#fff' },
  followBtnActive: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#f0faf6', borderWidth: 1.5, borderColor: '#c3e8d8',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
  },
  followBtnTextActive: { flex: 1, fontSize: 14, fontWeight: '600', color: GREEN },
  followNote: { fontSize: 11, color: TEXT_MUTED, textAlign: 'center', marginTop: 6, marginHorizontal: 16 },

  existingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#f0faf6', borderWidth: 1.5, borderColor: '#c3e8d8',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
  },
  existingBannerTitle: { fontSize: 13, fontWeight: '700', color: GREEN },
  existingBannerText: { fontSize: 12, color: TEXT_DARK, marginTop: 1 },

  adminCard: {
    marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 16,
    backgroundColor: '#fefce8', borderWidth: 1.5, borderColor: '#f6d860', gap: 10,
  },
  adminCardTitle: { fontSize: 12, fontWeight: '700', color: '#B7791F', textTransform: 'uppercase', letterSpacing: 0.5 },
  adminCardText:  { fontSize: 13, color: TEXT_DARK, lineHeight: 19 },
  adminBtn: { backgroundColor: DEEP_GREEN, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  adminBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  inviteCode: {
    fontSize: 22, fontWeight: '800', color: TEXT_DARK, letterSpacing: 3,
    textAlign: 'center', backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10,
  },
});

// ─── All Events Modal ────────────────────────────────────────────────────────

function AllEventsModal({
  visible, onClose, events, mosqueName, user, router,
}: {
  visible: boolean;
  onClose: () => void;
  events: MosquePost[];
  mosqueName: string;
  user: any;
  router: any;
}) {
  const insets = useSafeAreaInsets();
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [detailEv, setDetailEv] = useState<MosquePost | null>(null);
  const [activeReminder, setActiveReminder] = useState<{ lead_minutes: number } | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);

  // Reset filter and detail when modal opens/closes
  useEffect(() => {
    if (visible) setCategoryFilter(null);
    else setDetailEv(null);
  }, [visible]);

  useEffect(() => {
    if (!detailEv?.event_start || !user) { setActiveReminder(null); return; }
    supabase
      .from('event_reminders')
      .select('lead_minutes')
      .eq('post_id', detailEv.id)
      .eq('user_id', user.id)
      .eq('sent', false)
      .maybeSingle()
      .then(({ data }) => setActiveReminder(data ?? null));
  }, [detailEv?.id, user?.id]);

  const saveReminder = async (leadMinutes: number) => {
    if (!detailEv) return;
    setReminderLoading(true);
    const { error } = await supabase.functions.invoke('set-event-reminder', {
      body: { postId: detailEv.id, leadMinutes },
    });
    if (error) Alert.alert('Error', 'Could not save reminder. Please try again.');
    else setActiveReminder({ lead_minutes: leadMinutes });
    setReminderLoading(false);
  };

  const removeReminder = async () => {
    if (!detailEv || !activeReminder) return;
    setReminderLoading(true);
    await supabase.functions.invoke('set-event-reminder', {
      body: { postId: detailEv.id, leadMinutes: activeReminder.lead_minutes, action: 'delete' },
    });
    setActiveReminder(null);
    setReminderLoading(false);
  };

  const promptSetReminder = () => {
    Alert.alert('Set Reminder', 'How far in advance?', [
      { text: '1 hour before', onPress: () => saveReminder(60) },
      { text: '1 day before',  onPress: () => saveReminder(1440) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const ev of events) {
      (ev.categories ?? []).forEach(c => { if (c) cats.add(c); });
      if (ev.category) cats.add(ev.category);
    }
    return Array.from(cats).sort();
  }, [events]);

  const sections = useMemo(() => {
    const filtered = categoryFilter
      ? events.filter(e =>
          (e.categories ?? []).includes(categoryFilter) || e.category === categoryFilter,
        )
      : events;

    const byMonth: Record<string, MosquePost[]> = {};
    for (const ev of filtered) {
      const key = ev.event_start
        ? new Date(ev.event_start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : 'No Date';
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(ev);
    }
    return Object.entries(byMonth).map(([title, data]) => ({ title, data }));
  }, [events, categoryFilter]);

  const filteredCount = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[am.flex, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={am.header}>
          <TouchableOpacity style={am.backBtn} onPress={onClose} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={am.headerTitle}>Upcoming Events</Text>
            <Text style={am.headerSub} numberOfLines={1}>{mosqueName}</Text>
          </View>
          <Text style={am.headerCount}>{filteredCount} event{filteredCount !== 1 ? 's' : ''}</Text>
        </View>

        {/* Category filter chips */}
        {categories.length > 0 && (
          <View style={am.chipsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={am.chipsRow}
            >
              <TouchableOpacity
                style={[am.chip, !categoryFilter && am.chipActive]}
                onPress={() => setCategoryFilter(null)}
                activeOpacity={0.75}
              >
                <Text style={[am.chipText, !categoryFilter && am.chipTextActive]}>All</Text>
              </TouchableOpacity>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[am.chip, categoryFilter === cat && am.chipActive]}
                  onPress={() => setCategoryFilter(prev => prev === cat ? null : cat)}
                  activeOpacity={0.75}
                >
                  <Text style={[am.chipText, categoryFilter === cat && am.chipTextActive]}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Events list */}
        {sections.length === 0 ? (
          <View style={am.empty}>
            <Ionicons name="calendar-outline" size={40} color={HAIRLINE} />
            <Text style={am.emptyText}>No events in this category</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, index) => `${index}-${item.id}`}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <View style={am.monthHeader}>
                <Text style={am.monthHeaderText}>{section.title.toUpperCase()}</Text>
              </View>
            )}
            renderItem={({ item: ev, index, section }) => {
              const { location } = parseEventBody(ev.body);
              const date  = ev.event_start ? new Date(ev.event_start) : null;
              const month = date ? date.toLocaleString('en-US', { month: 'short' }).toUpperCase() : null;
              const day   = date ? date.getDate() : null;
              const time  = date
                ? date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
                : null;
              const isLast = index === section.data.length - 1;

              return (
                <TouchableOpacity
                  style={[am.eventRow, !isLast && am.eventRowBorder]}
                  onPress={() => setDetailEv(ev)}
                  activeOpacity={0.7}
                >
                  {date ? (
                    <View style={am.dateTile}>
                      <Text style={am.dateTileMonth}>{month}</Text>
                      <Text style={am.dateTileDay}>{day}</Text>
                    </View>
                  ) : (
                    <View style={am.dateTile}>
                      <Ionicons name="calendar-outline" size={20} color={GREEN} />
                    </View>
                  )}
                  <View style={am.eventDetails}>
                    <Text style={am.eventTitle} numberOfLines={2}>{ev.title}</Text>
                    {time ? <Text style={am.eventTime}>{time}</Text> : null}
                    {location ? (
                      <View style={am.locationRow}>
                        <Ionicons name="location-outline" size={11} color={TEXT_MUTED} />
                        <Text style={am.locationText} numberOfLines={1}>{location}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={TEXT_MUTED} />
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Event detail overlay — rendered inside this modal to avoid iOS stacked-modal issues */}
        {detailEv ? (() => {
          const { description, location } = parseEventBody(detailEv.body);
          return (
            <TouchableOpacity
              style={am.detailOverlay}
              activeOpacity={1}
              onPress={() => setDetailEv(null)}
            >
              <TouchableOpacity activeOpacity={1} style={[am.detailSheet, { paddingBottom: insets.bottom + 24 }]}>
                <View style={am.detailHandle} />
                <ScrollView showsVerticalScrollIndicator={false}>
                  {(detailEv.categories?.length > 0 ? detailEv.categories : detailEv.category ? [detailEv.category] : []).map(cat => (
                    <Text key={cat} style={am.detailCategory}>{cat.toUpperCase()}</Text>
                  ))}
                  <Text style={am.detailTitle}>{detailEv.title}</Text>
                  {detailEv.event_start ? (
                    <View style={am.detailRow}>
                      <Ionicons name="time-outline" size={16} color={GREEN} />
                      <Text style={am.detailRowText}>{formatEventRange(detailEv.event_start, detailEv.event_end)}</Text>
                    </View>
                  ) : null}
                  {location ? (
                    <View style={am.detailRow}>
                      <Ionicons name="location-outline" size={16} color={GREEN} />
                      <Text style={am.detailRowText}>{location}</Text>
                    </View>
                  ) : null}
                  {description ? <Text style={am.detailBody}>{description}</Text> : null}
                </ScrollView>
                {detailEv.source_url ? (
                  <TouchableOpacity style={am.detailLinkBtn} onPress={() => Linking.openURL(detailEv.source_url!)}>
                    <Ionicons name="open-outline" size={15} color={GREEN} />
                    <Text style={am.detailLinkBtnText}>View on website</Text>
                  </TouchableOpacity>
                ) : null}
                {detailEv.event_start && new Date(detailEv.event_start) > new Date() && (
                  <TouchableOpacity
                    style={[am.detailBtn, am.detailReminderBtn, activeReminder && am.detailReminderBtnActive]}
                    onPress={() => {
                      if (!user) {
                        setDetailEv(null);
                        onClose();
                        setGuestLoginIntent(true);
                        router.push('/(auth)/login');
                      } else if (activeReminder) {
                        Alert.alert(
                          'Remove Reminder',
                          `Remove your ${activeReminder.lead_minutes === 60 ? '1 hour' : '1 day'} reminder?`,
                          [
                            { text: 'Remove', style: 'destructive', onPress: removeReminder },
                            { text: 'Cancel', style: 'cancel' },
                          ],
                        );
                      } else {
                        promptSetReminder();
                      }
                    }}
                    disabled={reminderLoading}
                  >
                    {reminderLoading
                      ? <ActivityIndicator size="small" color={activeReminder ? GREEN : TEXT_MUTED} />
                      : <Ionicons name={activeReminder ? 'notifications' : 'notifications-outline'} size={16} color={activeReminder ? GREEN : TEXT_MUTED} />
                    }
                    <Text style={[am.detailReminderBtnText, activeReminder && { color: GREEN }]}>
                      {activeReminder
                        ? `Reminder set (${activeReminder.lead_minutes === 60 ? '1 hr' : '1 day'} before) · Remove`
                        : !user ? 'Sign in to set a reminder' : 'Set Reminder'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={am.detailBtn} onPress={() => setDetailEv(null)}>
                  <Text style={am.detailBtnText}>Close</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })() : null}
      </View>
    </Modal>
  );
}

const am = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },
  headerSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
  headerCount: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },

  chipsContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  chipsRow: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: HAIRLINE, backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  chipText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  chipTextActive: { color: '#fff' },

  monthHeader: {
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  monthHeaderText: { fontSize: 11, fontWeight: '700', color: TEXT_MUTED, letterSpacing: 0.8 },

  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#fff',
  },
  eventRowBorder: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },

  dateTile: {
    width: 48, height: 52, borderRadius: 12,
    backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dateTileMonth: { fontSize: 10, fontWeight: '700', color: GREEN, letterSpacing: 0.5 },
  dateTileDay:   { fontSize: 20, fontWeight: '800', color: DEEP_GREEN, lineHeight: 24 },
  dateTileEmpty: { width: 48, flexShrink: 0 },

  eventDetails: { flex: 1, gap: 2 },
  eventTitle:   { fontSize: 14, fontWeight: '700', color: TEXT_DARK, lineHeight: 20 },
  eventTime:    { fontSize: 12, color: TEXT_MUTED },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  locationText: { fontSize: 12, color: TEXT_MUTED, flex: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 14, color: TEXT_MUTED },

  // Event detail overlay (shown inside this modal, no nested modal needed)
  detailOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12,
    maxHeight: '85%',
  },
  detailHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 20,
  },
  detailCategory: { fontSize: 11, fontWeight: '700', color: GREEN, letterSpacing: 0.8, marginBottom: 6 },
  detailTitle:    { fontSize: 20, fontWeight: '800', color: TEXT_DARK, lineHeight: 26, marginBottom: 16 },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  detailRowText:  { flex: 1, fontSize: 14, color: TEXT_DARK, lineHeight: 20 },
  detailBody: {
    fontSize: 14, color: TEXT_MUTED, lineHeight: 22,
    marginTop: 16, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  detailLinkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 20, borderWidth: 1.5, borderColor: GREEN,
    borderRadius: 14, paddingVertical: 13,
  },
  detailLinkBtnText: { fontSize: 14, fontWeight: '600', color: GREEN },
  detailBtn: {
    marginTop: 10, backgroundColor: DEEP_GREEN,
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  detailBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  detailReminderBtn: {
    flexDirection: 'row', gap: 6, justifyContent: 'center',
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  detailReminderBtnActive: { backgroundColor: GREEN + '12', borderColor: GREEN + '40' },
  detailReminderBtnText:   { color: TEXT_MUTED, fontSize: 15, fontWeight: '700' },
});
