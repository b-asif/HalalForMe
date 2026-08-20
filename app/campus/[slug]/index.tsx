import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { InstagramIcon } from '../../../components/InstagramIcon';

import {
  fetchCampusDetail,
  followCampus,
  getCampusFollowStatus,
  getCampusNotifPrefs,
  getUserMsaRole,
  setCampusNotifPref,
  unfollowCampus,
} from '../../../lib/campus';
import type {
  CampusAnnouncement,
  CampusDetail,
  CampusDiningUpdate,
  CampusEvent,
  CampusJummah,
  CampusNotifPrefs,
  CampusPrayerSpace,
  CampusPrayerTime,
  CampusResource,
} from '../../../lib/campus';
import { useAuth } from '../../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../../lib/guestLoginIntent';
import { Brand, Radius, Shadow, Spacing, Type } from '../../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const CREAM      = Brand.cream;

const PRAYER_LABELS: Record<string, string> = {
  fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};

const PRAYER_ICONS: Record<string, string> = {
  fajr: 'moon-outline', dhuhr: 'sunny-outline',
  asr: 'partly-sunny-outline', maghrib: 'sunny', isha: 'moon',
};

const CATEGORY_COLORS: Record<string, string> = {
  lecture:   '#1B4332', sisters: '#6B2737', quran:   '#1A3A5C',
  youth:     '#4A1942', community: '#7C4700', social: '#1D4ED8', other: '#374151',
};

const RESOURCE_ICONS: Record<string, string> = {
  halal_food: 'restaurant-outline', prayer: 'location-outline',
  spiritual:  'heart-outline',      social: 'people-outline',
  academic:   'book-outline',       other:  'link-outline',
};

const PRAYER_ORDER_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

function parsePrayerMins(timeStr: string): number | null {
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

interface NextPrayerResult {
  prayer: CampusPrayerTime;
  label: string;
  timeStr: string;
  countdownText: string;
  nextIndex: number;
}

function getNextPrayer(times: CampusPrayerTime[], now: Date): NextPrayerResult | null {
  if (times.length === 0) return null;
  const curMins = now.getHours() * 60 + now.getMinutes();
  const sorted = [...times].sort(
    (a, b) => PRAYER_ORDER_KEYS.indexOf(a.prayer) - PRAYER_ORDER_KEYS.indexOf(b.prayer),
  );
  let nextIndex = sorted.findIndex(pt => {
    const m = parsePrayerMins(pt.time);
    return m !== null && m > curMins;
  });
  if (nextIndex === -1) nextIndex = 0;
  const prayer = sorted[nextIndex];
  const prayerMins = parsePrayerMins(prayer.time);
  let countdownText = '';
  if (prayerMins !== null) {
    let diffMins = prayerMins - curMins;
    if (diffMins <= 0) diffMins += 24 * 60;
    const h = Math.floor(diffMins / 60);
    const mn = diffMins % 60;
    countdownText = h > 0 ? `${h}h ${mn}m` : `${mn}m`;
  }
  return {
    prayer,
    label: PRAYER_LABELS[prayer.prayer] ?? prayer.prayer,
    timeStr: prayer.time,
    countdownText,
    nextIndex,
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  return fmtDate(iso);
}

function fmtEventDateParts(iso: string): { month: string; day: string } {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    day: String(d.getDate()),
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function NextPrayerCard({ info }: { info: NextPrayerResult }) {
  return (
    <View style={styles.nextPrayerCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.nextPrayerLabel}>NEXT PRAYER</Text>
        <Text style={styles.nextPrayerName}>{info.label}</Text>
        <Text style={styles.nextPrayerTime}>{info.timeStr}</Text>
        {!!info.countdownText && (
          <Text style={styles.nextPrayerCountdown}>in {info.countdownText}</Text>
        )}
      </View>
      <View style={styles.nextPrayerDeco}>
        <Text style={{ fontSize: 44 }}>🌅</Text>
      </View>
    </View>
  );
}

function PrayerTimesCard({
  times,
  nextIndex,
  jummah,
  mapsUrl,
}: {
  times: CampusPrayerTime[];
  nextIndex: number;
  jummah: CampusJummah[];
  mapsUrl: string;
}) {
  return (
    <View style={styles.prayerTimesRowCard}>
      {/* Five daily prayers */}
      <View style={styles.prayerTimesRow}>
        {times.map((pt, idx) => {
          const active = idx === nextIndex;
          return (
            <View key={pt.id} style={[styles.prayerCell, active && styles.prayerCellActive]}>
              <Ionicons
                name={PRAYER_ICONS[pt.prayer] as any}
                size={15}
                color={active ? DEEP_GREEN : TEXT_MUTED}
              />
              <Text style={[styles.prayerCellName, active && styles.prayerCellActiveText]}>
                {PRAYER_LABELS[pt.prayer]}
              </Text>
              <Text style={[styles.prayerCellTime, active && styles.prayerCellActiveText]}>
                {pt.time}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Jummah subsection */}
      {jummah.length > 0 && (
        <>
          <View style={styles.prayerJummahDivider} />
          <View style={styles.prayerJummahSection}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prayerJummahLabel}>JUMU'AH</Text>
              {jummah.map((j, idx) => (
                <View
                  key={j.id}
                  style={[styles.prayerJummahRow, idx > 0 && { marginTop: 6 }]}
                >
                  <Text style={styles.prayerJummahTime}>{j.time}</Text>
                  {!!(j.location || j.building) && (
                    <Text style={styles.prayerJummahDetail}>
                      <Ionicons name="location-outline" size={11} color={TEXT_MUTED} />{' '}
                      {j.location || j.building}
                    </Text>
                  )}
                  {!!j.khateeb && (
                    <Text style={styles.prayerJummahDetail}>{j.khateeb}</Text>
                  )}
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={styles.directionsBtn}
              onPress={() => Linking.openURL(mapsUrl)}
              activeOpacity={0.75}
            >
              <Ionicons name="navigate-outline" size={13} color={DEEP_GREEN} />
              <Text style={styles.directionsBtnText}>Directions</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

function UpcomingEventsSection({ events }: { events: CampusEvent[] }) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <View style={styles.eventsHeaderRow}>
        <Text style={styles.sectionTitle}>Upcoming Events</Text>
        <Text style={styles.seeAllText}>See all</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.eventsScroll}
      >
        {events.map(ev => {
          const catColor = CATEGORY_COLORS[ev.category ?? 'other'] ?? CATEGORY_COLORS.other;
          const dateParts = ev.event_start ? fmtEventDateParts(ev.event_start) : null;
          const hasRsvp = !!ev.rsvp_url;
          return (
            <TouchableOpacity
              key={ev.id}
              style={styles.eventCard}
              onPress={() => hasRsvp && Linking.openURL(ev.rsvp_url!)}
              activeOpacity={hasRsvp ? 0.85 : 1}
              disabled={!hasRsvp}
            >
              {ev.image_url ? (
                <Image source={{ uri: ev.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: catColor }]} />
              )}
              {dateParts && (
                <View style={styles.eventDateBadge}>
                  <Text style={styles.eventDateMonth}>{dateParts.month.toUpperCase()}</Text>
                  <Text style={styles.eventDateDay}>{dateParts.day}</Text>
                </View>
              )}
              {hasRsvp && (
                <View style={styles.eventRsvpBadge}>
                  <Text style={styles.eventRsvpText}>RSVP</Text>
                </View>
              )}
              <View style={styles.eventCardOverlay}>
                <Text style={styles.eventCardTitle} numberOfLines={2}>{ev.title}</Text>
                {!!ev.event_start && (
                  <Text style={styles.eventCardMeta}>
                    {fmtDate(ev.event_start)} · {fmtTime(ev.event_start)}
                  </Text>
                )}
                {!!ev.location && (
                  <Text style={styles.eventCardMeta} numberOfLines={1}>
                    <Ionicons name="location-outline" size={10} color="rgba(255,255,255,0.8)" /> {ev.location}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function AroundCampusSection({
  onPressPrayerSpaces,
  onPressWudu,
  onPressHalalFood,
  onPressResources,
}: {
  onPressPrayerSpaces: () => void;
  onPressWudu: () => void;
  onPressHalalFood: () => void;
  onPressResources: () => void;
}) {
  const chips = [
    { label: 'Prayer\nSpaces',    icon: 'man-outline',        onPress: onPressPrayerSpaces },
    { label: 'Wudu\nLocations',   icon: 'water-outline',      onPress: onPressWudu },
    { label: 'Halal\nFood',       icon: 'restaurant-outline', onPress: onPressHalalFood },
    { label: 'Resources',         icon: 'book-outline',       onPress: onPressResources },
  ] as const;
  return (
    <View style={styles.aroundWrapper}>
      <Text style={styles.sectionTitle}>Around Campus</Text>
      <View style={styles.aroundRow}>
        {chips.map(c => (
          <TouchableOpacity key={c.label} style={styles.aroundChip} onPress={c.onPress} activeOpacity={0.75}>
            <Ionicons name={c.icon as any} size={20} color={DEEP_GREEN} />
            <Text style={styles.aroundChipText}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function AboutSection({ name, description }: { name: string; description: string }) {
  return (
    <View style={styles.aboutWrapper}>
      <Text style={styles.sectionTitle}>About {name}</Text>
      <Text style={styles.aboutBody}>{description}</Text>
    </View>
  );
}

function AmenityChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon as any} size={12} color={GREEN} />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function PrayerSpacesSection({ spaces }: { spaces: CampusPrayerSpace[] }) {
  if (spaces.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={sectionStyles.header}>
        <Ionicons name="location-outline" size={18} color={GREEN} />
        <Text style={sectionStyles.title}>Prayer Spaces</Text>
      </View>
      {spaces.map(s => (
        <View key={s.id} style={styles.spaceCard}>
          <Text style={styles.spaceName}>{s.name}</Text>
          {!!s.building && (
            <Text style={styles.spaceDetail}>
              {s.building}{s.room_number ? `, Room ${s.room_number}` : ''}{s.floor ? `, ${s.floor}` : ''}
            </Text>
          )}
          {!!s.hours_text && <Text style={styles.spaceDetail}>Hours: {s.hours_text}</Text>}
          <View style={styles.amenityRow}>
            {s.wudu_available  && <AmenityChip icon="water-outline"  label="Wudu"    />}
            {s.sisters_space   && <AmenityChip icon="female-outline" label="Sisters" />}
            {!!s.capacity      && <AmenityChip icon="people-outline" label={`Cap. ${s.capacity}`} />}
          </View>
          {!!s.notes && <Text style={styles.spaceNotes}>{s.notes}</Text>}
        </View>
      ))}
    </View>
  );
}

function AnnouncementsSection({ announcements }: { announcements: CampusAnnouncement[] }) {
  if (announcements.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={sectionStyles.header}>
        <Ionicons name="megaphone-outline" size={18} color={GREEN} />
        <Text style={sectionStyles.title}>Announcements</Text>
      </View>
      {announcements.map(a => (
        <View key={a.id} style={styles.announcementCard}>
          <View style={styles.announcementHeader}>
            <Text style={styles.announcementTitle}>{a.title}</Text>
            <Text style={styles.announcementDate}>{fmtRelative(a.created_at)}</Text>
          </View>
          {!!a.body && <Text style={styles.announcementBody}>{a.body}</Text>}
        </View>
      ))}
    </View>
  );
}

function DiningSection({ diningUpdates }: { diningUpdates: CampusDiningUpdate[] }) {
  if (diningUpdates.length === 0) return null;
  const todayISO = new Date().toISOString().slice(0, 10);
  return (
    <View style={styles.section}>
      <View style={sectionStyles.header}>
        <Ionicons name="restaurant-outline" size={18} color={GREEN} />
        <Text style={sectionStyles.title}>Halal Dining Today</Text>
      </View>
      {diningUpdates.map(d => {
        const isToday = d.date === todayISO;
        return (
          <View key={d.id} style={styles.announcementCard}>
            <View style={styles.announcementHeader}>
              <Text style={styles.announcementTitle}>{d.dining_hall}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isToday && (
                  <View style={styles.diningTodayBadge}>
                    <Text style={styles.diningTodayText}>Today</Text>
                  </View>
                )}
                {!isToday && (
                  <Text style={styles.announcementDate}>
                    {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                )}
              </View>
            </View>
            <Text style={styles.announcementBody}>{d.items}</Text>
            {!!d.notes && (
              <Text style={[styles.announcementBody, { marginTop: 4, fontStyle: 'italic' }]}>{d.notes}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ResourcesSection({ resources }: { resources: CampusResource[] }) {
  if (resources.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={sectionStyles.header}>
        <Ionicons name="grid-outline" size={18} color={GREEN} />
        <Text style={sectionStyles.title}>Halal &amp; Campus Resources</Text>
      </View>
      {resources.map(r => (
        <TouchableOpacity
          key={r.id}
          style={styles.resourceCard}
          onPress={() => r.url && Linking.openURL(r.url)}
          disabled={!r.url}
          activeOpacity={r.url ? 0.7 : 1}
        >
          <View style={styles.resourceIcon}>
            <Ionicons name={(RESOURCE_ICONS[r.category ?? 'other'] ?? 'link-outline') as any} size={18} color={GREEN} />
          </View>
          <View style={styles.resourceText}>
            <Text style={styles.resourceTitle}>{r.title}</Text>
            {!!r.description && <Text style={styles.resourceDesc} numberOfLines={2}>{r.description}</Text>}
            {!!r.address     && <Text style={styles.resourceAddr}><Ionicons name="location-outline" size={11} /> {r.address}</Text>}
          </View>
          {!!r.url && <Ionicons name="open-outline" size={16} color={TEXT_MUTED} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  title:  { ...Type.sectionLabel, color: DEEP_GREEN, textTransform: 'uppercase' as const },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CampusDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();

  const [campus,    setCampus]    = useState<CampusDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<CampusNotifPrefs>({ events: true, announcements: true, jummah: true, prayer: true, dining: true });
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [isMsaAdmin, setIsMsaAdmin] = useState(false);

  // Clock for next prayer countdown
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Refs for "Around Campus" navigation
  const scrollViewRef = useRef<ScrollView>(null);
  const prayerSpacesY = useRef(0);
  const resourcesY    = useRef(0);

  // Filter states
  const [wuduFilter,      setWuduFilter]      = useState(false);
  const [halalFoodFilter, setHalalFoodFilter] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);

    const detail = await fetchCampusDetail(slug);
    if (!detail) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setCampus(detail);
    setLoading(false);

    if (user) {
      const followed = await getCampusFollowStatus(detail.university.id);
      setFollowing(followed);
      if (followed) {
        const prefs = await getCampusNotifPrefs(detail.university.id);
        setNotifPrefs(prefs);
      }
      if (detail.msa) {
        const role = await getUserMsaRole(detail.msa.id);
        setIsMsaAdmin(role?.status === 'active');
      }
    }
  }, [slug, user]);

  useEffect(() => { load(); }, [load]);

  const onToggleFollow = useCallback(async () => {
    if (!campus || !user) return;
    setFollowLoading(true);
    if (following) {
      await unfollowCampus(campus.university.id);
      setFollowing(false);
    } else {
      await followCampus(campus.university.id);
      setFollowing(true);
      const prefs = await getCampusNotifPrefs(campus.university.id);
      setNotifPrefs(prefs);
      setShowNotifModal(true);
    }
    setFollowLoading(false);
  }, [campus, following, user]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingHeader}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={DEEP_GREEN} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !campus) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingHeader}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={DEEP_GREEN} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Ionicons name="school-outline" size={48} color={HAIRLINE} />
          <Text style={styles.notFoundTitle}>Campus not found</Text>
          <Text style={styles.notFoundBody}>
            No campus page exists for this URL. It may have been removed or the link is incorrect.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { university, msa, prayerSpaces, prayerTimes, jummah, events, announcements, resources, diningUpdates } = campus;
  const location = [university.city, university.state].filter(Boolean).join(', ');
  const hasContent = msa !== null;

  const websiteUrl = msa?.website || university.website;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(university.name)}`;

  const sortedPrayerTimes = [...prayerTimes].sort(
    (a, b) => PRAYER_ORDER_KEYS.indexOf(a.prayer) - PRAYER_ORDER_KEYS.indexOf(b.prayer),
  );
  const nextPrayerInfo = prayerTimes.length > 0 ? getNextPrayer(sortedPrayerTimes, now) : null;

  const showAroundCampus = prayerSpaces.length > 0 || resources.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero banner ── */}
        <View style={styles.heroBanner}>
          {msa?.logo_url ? (
            <Image source={{ uri: msa.logo_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <View style={[StyleSheet.absoluteFill, styles.heroBannerOverlay]} />
          <TouchableOpacity style={styles.heroBack} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          {user && msa && (
            <TouchableOpacity
              style={styles.heroBookmark}
              onPress={onToggleFollow}
              disabled={followLoading}
              hitSlop={12}
            >
              {followLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons
                  name={following ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color="#fff"
                />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ── Profile sheet (curved white strip emerging from hero bottom) ── */}
        <View style={styles.profileCard}>
          {/* Name row + verified badge */}
          <View style={styles.profileNameRow}>
            <Text style={styles.profileName} numberOfLines={1}>
              {msa?.name || university.name}
            </Text>
            {msa?.is_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={13} color={GREEN} />
                <Text style={styles.verifiedBadgeText}>Verified</Text>
              </View>
            )}
          </View>

          {/* University full name */}
          <Text style={styles.profileUniversity} numberOfLines={1}>{university.name}</Text>

          {/* Location + website inline */}
          <View style={styles.profileMeta}>
            {!!location && (
              <View style={styles.profileMetaItem}>
                <Ionicons name="location-outline" size={12} color={TEXT_MUTED} />
                <Text style={styles.profileMetaText}>{location}</Text>
              </View>
            )}
            {!!websiteUrl && (
              <TouchableOpacity
                style={styles.profileMetaItem}
                onPress={() => Linking.openURL(websiteUrl!)}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-redo-outline" size={12} color={GREEN} />
                <Text style={[styles.profileMetaText, { color: GREEN }]} numberOfLines={1}>
                  {websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Social icons + follow button on one row */}
          <View style={styles.socialRow}>
            {!!msa?.instagram_handle && (
              <TouchableOpacity
                style={styles.socialCircle}
                onPress={() => Linking.openURL(`https://instagram.com/${msa.instagram_handle}`)}
                activeOpacity={0.75}
              >
                <InstagramIcon size={16} color={DEEP_GREEN} />
              </TouchableOpacity>
            )}
            {!!websiteUrl && (
              <TouchableOpacity
                style={styles.socialCircle}
                onPress={() => Linking.openURL(websiteUrl!)}
                activeOpacity={0.75}
              >
                <Ionicons name="globe-outline" size={16} color={DEEP_GREEN} />
              </TouchableOpacity>
            )}
            {!!msa?.email && (
              <TouchableOpacity
                style={styles.socialCircle}
                onPress={() => Linking.openURL(`mailto:${msa.email}`)}
                activeOpacity={0.75}
              >
                <Ionicons name="mail-outline" size={16} color={DEEP_GREEN} />
              </TouchableOpacity>
            )}

            {/* Follow pill — right-aligned */}
            {!isMsaAdmin && (
              <TouchableOpacity
                style={[styles.followPill, following && styles.followPillActive]}
                onPress={() => {
                  if (!user) {
                    setGuestLoginIntent(true);
                    router.push('/(auth)/login');
                    return;
                  }
                  onToggleFollow();
                }}
                disabled={followLoading}
                activeOpacity={0.8}
              >
                {followLoading ? (
                  <ActivityIndicator color={following ? GREEN : '#fff'} size="small" style={{ width: 16, height: 16 }} />
                ) : (
                  <>
                    <Ionicons
                      name={following ? 'checkmark' : 'add'}
                      size={14}
                      color={following ? GREEN : '#fff'}
                    />
                    <Text style={[styles.followPillText, following && styles.followPillTextActive]}>
                      {following ? 'Following' : 'Follow'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Manage this page (admins only) ── */}
        {user && isMsaAdmin && (
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={() => router.push('/(msa)/dashboard' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="settings-outline" size={16} color={DEEP_GREEN} />
            <Text style={styles.manageBtnText}>Manage this page</Text>
          </TouchableOpacity>
        )}

        {/* ── No MSA claimed yet ── */}
        {!hasContent && !campus?.msa && (
          <View style={styles.noMsa}>
            <Ionicons name="information-circle-outline" size={22} color={TEXT_MUTED} />
            <Text style={styles.noMsaText}>
              No MSA has claimed this campus yet.
            </Text>
          </View>
        )}

        {/* ── Next Prayer card ── */}
        {nextPrayerInfo && (
          <NextPrayerCard info={nextPrayerInfo} />
        )}

        {/* ── Prayer times + Jummah combined card ── */}
        {sortedPrayerTimes.length > 0 && nextPrayerInfo && (
          <PrayerTimesCard
            times={sortedPrayerTimes}
            nextIndex={nextPrayerInfo.nextIndex}
            jummah={jummah}
            mapsUrl={mapsUrl}
          />
        )}

        {/* ── Upcoming Events ── */}
        {events.length > 0 && (
          <UpcomingEventsSection events={events} />
        )}

        {/* ── Around Campus chips ── */}
        {showAroundCampus && (
          <AroundCampusSection
            onPressPrayerSpaces={() => {
              setWuduFilter(false);
              scrollViewRef.current?.scrollTo({ y: prayerSpacesY.current, animated: true });
            }}
            onPressWudu={() => {
              setWuduFilter(true);
              scrollViewRef.current?.scrollTo({ y: prayerSpacesY.current, animated: true });
            }}
            onPressHalalFood={() => {
              setHalalFoodFilter(true);
              scrollViewRef.current?.scrollTo({ y: resourcesY.current, animated: true });
            }}
            onPressResources={() => {
              setHalalFoodFilter(false);
              scrollViewRef.current?.scrollTo({ y: resourcesY.current, animated: true });
            }}
          />
        )}

        {/* ── Prayer Spaces (with wudu filter) ── */}
        <View onLayout={e => { prayerSpacesY.current = e.nativeEvent.layout.y; }}>
          <PrayerSpacesSection
            spaces={wuduFilter ? prayerSpaces.filter(s => s.wudu_available) : prayerSpaces}
          />
          {wuduFilter && (
            <TouchableOpacity
              style={styles.filterBanner}
              onPress={() => setWuduFilter(false)}
              activeOpacity={0.75}
            >
              <Text style={styles.filterBannerText}>Showing wudu locations only</Text>
              <Text style={styles.filterBannerDismiss}>Show all</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Resources (with halal food filter) ── */}
        <View onLayout={e => { resourcesY.current = e.nativeEvent.layout.y; }}>
          <ResourcesSection
            resources={halalFoodFilter ? resources.filter(r => r.category === 'halal_food') : resources}
          />
          {halalFoodFilter && (
            <TouchableOpacity
              style={styles.filterBanner}
              onPress={() => setHalalFoodFilter(false)}
              activeOpacity={0.75}
            >
              <Text style={styles.filterBannerText}>Showing halal food only</Text>
              <Text style={styles.filterBannerDismiss}>Show all</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Dining ── */}
        <DiningSection diningUpdates={diningUpdates} />

        {/* ── Announcements ── */}
        <AnnouncementsSection announcements={announcements} />

        {/* ── About ── */}
        {!!msa?.description && (
          <AboutSection name={msa.name || university.name} description={msa.description} />
        )}

        {/* ── All sections empty but MSA exists ── */}
        {hasContent && prayerTimes.length === 0 && jummah.length === 0 &&
         prayerSpaces.length === 0 && events.length === 0 &&
         announcements.length === 0 && resources.length === 0 &&
         diningUpdates.length === 0 && !msa?.description && (
          <View style={styles.emptyContent}>
            <Ionicons name="leaf-outline" size={28} color={TEXT_MUTED} />
            <Text style={styles.emptyContentText}>
              This campus page is being set up. Check back soon.
            </Text>
          </View>
        )}

        {/* ── Quiet claim link — only for unverified pages, non-admins ── */}
        {user && !isMsaAdmin && !msa?.is_verified && (
          <TouchableOpacity
            style={styles.claimLink}
            onPress={() => router.push({
              pathname: '/msa/request-access',
              params: {
                prefillUniversityId: campus.university.id,
                prefillUniversityName: campus.university.name,
                prefillMsaId: campus.msa?.id ?? '',
                prefillMsaName: campus.msa?.name ?? '',
              },
            } as any)}
            activeOpacity={0.6}
          >
            <Text style={styles.claimLinkText}>
              Are you an MSA officer? Claim this page →
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ── Notification preferences modal ── */}
      <Modal
        visible={showNotifModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotifModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotifModal(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Notify me about</Text>
            <Text style={styles.modalSub}>Choose what updates you want from this campus.</Text>

            {(
              [
                { key: 'events',        label: 'Events',        sub: 'Upcoming MSA events' },
                { key: 'announcements', label: 'Announcements', sub: 'News and updates' },
                { key: 'dining',        label: 'Dining',        sub: "Today's halal options" },
                { key: 'jummah',        label: 'Jummah',        sub: 'Time and location changes' },
                { key: 'prayer',        label: 'Prayer Times',  sub: 'Iqama time updates' },
              ] as const
            ).map(({ key, label, sub }) => (
              <View key={key} style={styles.modalRow}>
                <View style={styles.modalRowText}>
                  <Text style={styles.modalRowLabel}>{label}</Text>
                  <Text style={styles.modalRowSub}>{sub}</Text>
                </View>
                <Switch
                  value={notifPrefs[key]}
                  onValueChange={async (val) => {
                    setNotifPrefs(prev => ({ ...prev, [key]: val }));
                    await setCampusNotifPref(campus!.university.id, key, val);
                  }}
                  trackColor={{ false: HAIRLINE, true: GREEN }}
                  thumbColor="#fff"
                />
              </View>
            ))}

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setShowNotifModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>

            <Text style={styles.modalHint}>
              You can always change these in Settings → Followed Campuses
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },

  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
  },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.sm,
  },
  notFoundTitle: { ...Type.sheetTitle, color: TEXT_DARK, textAlign: 'center', marginTop: Spacing.sm },
  notFoundBody:  { ...Type.bodySmall, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  backBtn: {
    marginTop: Spacing.md, paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm, backgroundColor: GREEN, borderRadius: Radius.chip,
  },
  backBtnText: { ...Type.label, color: '#fff' },

  scroll: { paddingBottom: Spacing.xl },

  // ── Hero ──
  heroBanner: {
    height: 220, backgroundColor: DEEP_GREEN, overflow: 'hidden',
  },
  heroBannerOverlay: { backgroundColor: 'rgba(0,0,0,0.30)' },
  heroBack: {
    position: 'absolute', top: 12, left: 12,
    width: 36, height: 36, borderRadius: Radius.circle,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBookmark: {
    position: 'absolute', top: 12, right: 12,
    width: 36, height: 36, borderRadius: Radius.circle,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Profile sheet ──
  profileCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  profileNameRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm,
  },
  profileName: {
    fontSize: 18, fontWeight: '800', color: DEEP_GREEN, flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    backgroundColor: '#f0faf6', borderRadius: Radius.chip,
  },
  verifiedBadgeText: { fontSize: 11, fontWeight: '700', color: GREEN },
  profileUniversity: {
    ...Type.caption, color: TEXT_MUTED, marginTop: 3,
  },
  profileMeta: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  profileMetaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  profileMetaText: { ...Type.caption, color: TEXT_MUTED },
  socialRow: {
    flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm,
  },
  socialCircle: {
    width: 32, height: 32, borderRadius: Radius.circle,
    backgroundColor: CREAM, borderWidth: 1, borderColor: HAIRLINE,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Next Prayer card ──
  nextPrayerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: DEEP_GREEN,
    borderRadius: Radius.card,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    padding: Spacing.md,
    ...Shadow.strong,
  },
  nextPrayerLabel: {
    ...Type.sectionLabel, color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase', marginBottom: 2,
  },
  nextPrayerName: {
    fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 32,
  },
  nextPrayerTime: {
    ...Type.cardTitle, color: '#fff', marginTop: 2,
  },
  nextPrayerCountdown: {
    ...Type.bodySmall, color: 'rgba(255,255,255,0.75)', marginTop: 2,
  },
  nextPrayerDeco: {
    width: 64, alignItems: 'center', justifyContent: 'center',
  },

  // ── Prayer times + Jummah card ──
  prayerTimesRowCard: {
    backgroundColor: '#fff',
    borderRadius: Radius.card,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.xs,
    ...Shadow.light,
  },
  prayerTimesRow: {
    flexDirection: 'row',
  },
  prayerCell: {
    flex: 1, alignItems: 'center', gap: 3,
    paddingVertical: 6, paddingHorizontal: 2,
    borderRadius: Radius.chip,
  },
  prayerCellActive: {
    backgroundColor: CREAM,
  },
  prayerCellName: {
    ...Type.tiny, color: TEXT_MUTED, fontWeight: '600',
  },
  prayerCellTime: {
    ...Type.tiny, color: TEXT_MUTED, fontWeight: '700',
  },
  prayerCellActiveText: {
    color: DEEP_GREEN,
  },
  prayerJummahDivider: {
    height: 1, backgroundColor: HAIRLINE,
    marginHorizontal: Spacing.sm, marginTop: 6,
  },
  prayerJummahSection: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 4,
    gap: Spacing.sm,
  },
  prayerJummahLabel: {
    ...Type.sectionLabel, color: TEXT_MUTED,
    textTransform: 'uppercase', marginBottom: 4,
  },
  prayerJummahRow: { gap: 1 },
  prayerJummahTime: {
    fontSize: 15, fontWeight: '700', color: DEEP_GREEN,
  },
  prayerJummahDetail: {
    ...Type.caption, color: TEXT_MUTED,
  },
  directionsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 9, paddingVertical: 6,
    borderRadius: Radius.chip, borderWidth: 1, borderColor: HAIRLINE,
    backgroundColor: '#fff',
  },
  directionsBtnText: { ...Type.label, color: DEEP_GREEN, fontSize: 12 },

  // ── Events ──
  eventsHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: Spacing.md, marginBottom: 4,
  },
  sectionTitle: { ...Type.cardTitle, color: DEEP_GREEN },
  seeAllText:   { ...Type.caption, color: GREEN, fontWeight: '600' },
  eventsScroll: { paddingHorizontal: Spacing.md, gap: 10, paddingVertical: Spacing.sm },
  eventCard: {
    width: 176, height: 176,
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: HAIRLINE,
    ...Shadow.medium,
  },
  eventDateBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: '#fff',
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
    alignItems: 'center',
  },
  eventDateMonth: { ...Type.tiny, color: TEXT_MUTED, fontWeight: '700' },
  eventDateDay:   { fontSize: 17, fontWeight: '800', color: TEXT_DARK, lineHeight: 20 },
  eventRsvpBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: Brand.gold,
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  eventRsvpText: {
    fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5,
  },
  eventCardOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 8, backgroundColor: 'rgba(0,0,0,0.48)',
  },
  eventCardTitle: { ...Type.label, color: '#fff', lineHeight: 18 },
  eventCardMeta:  { ...Type.tiny, color: 'rgba(255,255,255,0.82)', marginTop: 2 },

  // ── Around Campus ──
  aroundWrapper: { marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  aroundRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  aroundChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: CREAM,
    borderRadius: Radius.card,
    borderWidth: 1, borderColor: HAIRLINE,
    gap: 7,
    ...Shadow.light,
  },
  aroundChipText: {
    ...Type.tiny, color: DEEP_GREEN, fontWeight: '600', flex: 1,
  },

  // ── About ──
  aboutWrapper: { marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  aboutBody: { ...Type.bodySmall, color: TEXT_MUTED, lineHeight: 22, marginTop: Spacing.sm },

  // ── Filter banner ──
  filterBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: Spacing.md, marginTop: -Spacing.sm, marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    backgroundColor: '#f0faf6', borderRadius: Radius.chip,
    borderWidth: 1, borderColor: '#c3e8d8',
  },
  filterBannerText:    { ...Type.caption, color: DEEP_GREEN },
  filterBannerDismiss: { ...Type.caption, color: GREEN, fontWeight: '700' },

  // ── Follow pill (inside profile card) ──
  followPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginLeft: 'auto' as any,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: DEEP_GREEN,
    borderRadius: Radius.chip,
  },
  followPillActive: {
    backgroundColor: '#f0faf6',
    borderWidth: 1, borderColor: '#c3e8d8',
  },
  followPillText:       { ...Type.tiny, color: '#fff', fontWeight: '700' },
  followPillTextActive: { color: GREEN },

  // ── Manage (admins only) ──
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    paddingVertical: 10, paddingHorizontal: Spacing.md,
    backgroundColor: '#f0faf6', borderRadius: Radius.chip,
    borderWidth: 1, borderColor: '#c3e8d8',
    justifyContent: 'center',
  },
  manageBtnText: { ...Type.label, color: DEEP_GREEN, fontWeight: '700' },

  // ── Quiet claim text link ──
  claimLink: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  claimLinkText: {
    ...Type.caption,
    color: TEXT_MUTED,
  },

  // ── No MSA ──
  noMsa: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    padding: Spacing.md, backgroundColor: '#fffbeb',
    borderRadius: Radius.card, borderWidth: 1, borderColor: '#f6d860',
  },
  noMsaText: { ...Type.bodySmall, color: TEXT_DARK, flex: 1, lineHeight: 20 },

  // ── Generic section card (prayer spaces, announcements, resources) ──
  section: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    padding: Spacing.md, ...Shadow.light,
  },

  // Prayer spaces
  spaceCard: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  spaceName:    { ...Type.label, color: TEXT_DARK, marginBottom: 2 },
  spaceDetail:  { ...Type.caption, color: TEXT_MUTED, marginTop: 1 },
  spaceNotes:   { ...Type.caption, color: TEXT_MUTED, marginTop: Spacing.xs, fontStyle: 'italic' as const },
  amenityRow:   { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs, flexWrap: 'wrap' as const },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: '#f0faf6', borderRadius: Radius.chip,
  },
  chipText: { ...Type.tiny, color: GREEN, fontWeight: '600' },

  // Announcements
  announcementCard: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  announcementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  announcementTitle:  { ...Type.label, color: TEXT_DARK, flex: 1, marginRight: Spacing.sm },
  announcementDate:   { ...Type.tiny, color: TEXT_MUTED },
  announcementBody:   { ...Type.bodySmall, color: TEXT_MUTED, lineHeight: 20 },
  diningTodayBadge: {
    backgroundColor: '#fff7ed', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  diningTodayText: { fontSize: 11, fontWeight: '700', color: '#ea580c' },

  // Resources
  resourceCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  resourceIcon: {
    width: 36, height: 36, borderRadius: Radius.chip,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
  },
  resourceText:  { flex: 1 },
  resourceTitle: { ...Type.label, color: TEXT_DARK },
  resourceDesc:  { ...Type.caption, color: TEXT_MUTED, lineHeight: 16, marginTop: 2 },
  resourceAddr:  { ...Type.tiny, color: TEXT_MUTED, marginTop: 2 },

  // Empty content
  emptyContent: {
    alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  emptyContentText: { ...Type.bodySmall, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },

  // Notification modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CREAM,
    borderTopLeftRadius: Radius.card * 2,
    borderTopRightRadius: Radius.card * 2,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 36 : Spacing.xl,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: Spacing.lg,
  },
  modalTitle: { ...Type.screenTitle, color: DEEP_GREEN, marginBottom: 4 },
  modalSub:   { ...Type.bodySmall, color: TEXT_MUTED, marginBottom: Spacing.lg },
  modalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  modalRowText: { flex: 1, marginRight: Spacing.md },
  modalRowLabel: { ...Type.body, color: TEXT_DARK, fontWeight: '600' },
  modalRowSub:   { ...Type.caption, color: TEXT_MUTED, marginTop: 2 },
  modalDoneBtn: {
    marginTop: Spacing.lg, backgroundColor: GREEN,
    borderRadius: Radius.chip, paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  modalDoneText: { ...Type.label, color: '#fff' },
  modalHint: {
    ...Type.tiny, color: TEXT_MUTED, textAlign: 'center',
    marginTop: Spacing.md, lineHeight: 16,
  },
});
