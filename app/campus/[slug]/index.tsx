import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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
  CampusEvent,
  CampusJummah,
  CampusNotifPrefs,
  CampusPrayerSpace,
  CampusPrayerTime,
  CampusResource,
} from '../../../lib/campus';
import { useAuth } from '../../../contexts/AuthContext';
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

// ─── Section components ───────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={sectionStyles.header}>
      <Ionicons name={icon as any} size={18} color={GREEN} />
      <Text style={sectionStyles.title}>{title}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  title:  { ...Type.sectionLabel, color: DEEP_GREEN, textTransform: 'uppercase' as const },
});

function PrayerTimesSection({ times }: { times: CampusPrayerTime[] }) {
  if (times.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader icon="time-outline" title="Prayer Times" />
      {times.map(pt => (
        <View key={pt.id} style={styles.prayerRow}>
          <Ionicons name={PRAYER_ICONS[pt.prayer] as any} size={16} color={DEEP_GREEN} style={styles.prayerIcon} />
          <Text style={styles.prayerLabel}>{PRAYER_LABELS[pt.prayer]}</Text>
          <Text style={styles.prayerTime}>{pt.time}</Text>
          {!!pt.location && <Text style={styles.prayerLocation}> · {pt.location}</Text>}
        </View>
      ))}
    </View>
  );
}

function JummahSection({ jummah }: { jummah: CampusJummah[] }) {
  if (jummah.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader icon="podium-outline" title="Jummah" />
      {jummah.map((j, idx) => (
        <View key={j.id} style={[styles.jummahCard, idx < jummah.length - 1 && styles.jummahDivider]}>
          <Text style={styles.jummahTime}>{j.time}</Text>
          {!!j.khateeb   && <Text style={styles.jummahDetail}>Khateeb: {j.khateeb}</Text>}
          {!!j.location  && <Text style={styles.jummahDetail}><Ionicons name="location-outline" size={12} /> {j.location}</Text>}
          {!!j.building  && <Text style={styles.jummahDetail}>{j.building}</Text>}
          {j.language !== 'English' && <Text style={styles.jummahDetail}>Language: {j.language}</Text>}
          {!!j.notes     && <Text style={styles.jummahNotes}>{j.notes}</Text>}
        </View>
      ))}
    </View>
  );
}

function PrayerSpacesSection({ spaces }: { spaces: CampusPrayerSpace[] }) {
  if (spaces.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader icon="location-outline" title="Prayer Spaces" />
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

function AmenityChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon as any} size={12} color={GREEN} />
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function EventsSection({ events }: { events: CampusEvent[] }) {
  if (events.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader icon="calendar-outline" title="Upcoming Events" />
      {events.map(ev => {
        const catColor = CATEGORY_COLORS[ev.category ?? 'other'] ?? CATEGORY_COLORS.other;
        return (
          <View key={ev.id} style={styles.eventCard}>
            <View style={styles.eventMeta}>
              {!!ev.category && (
                <View style={[styles.catChip, { backgroundColor: catColor + '18' }]}>
                  <Text style={[styles.catChipText, { color: catColor }]}>
                    {ev.category.charAt(0).toUpperCase() + ev.category.slice(1)}
                  </Text>
                </View>
              )}
              {!!ev.event_start && (
                <Text style={styles.eventDate}>{fmtDate(ev.event_start)}</Text>
              )}
            </View>
            <Text style={styles.eventTitle}>{ev.title}</Text>
            {!!ev.event_start && (
              <Text style={styles.eventTime}>
                {fmtTime(ev.event_start)}{ev.event_end ? ` – ${fmtTime(ev.event_end)}` : ''}
              </Text>
            )}
            {!!ev.location && (
              <Text style={styles.eventLocation}>
                <Ionicons name="location-outline" size={12} /> {ev.location}
              </Text>
            )}
            {!!ev.body && <Text style={styles.eventBody} numberOfLines={2}>{ev.body}</Text>}
            {!!ev.rsvp_url && (
              <TouchableOpacity
                style={styles.rsvpBtn}
                onPress={() => Linking.openURL(ev.rsvp_url!)}
                activeOpacity={0.75}
              >
                <Text style={styles.rsvpText}>RSVP →</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

function AnnouncementsSection({ announcements }: { announcements: CampusAnnouncement[] }) {
  if (announcements.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader icon="megaphone-outline" title="Announcements" />
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

function ResourcesSection({ resources }: { resources: CampusResource[] }) {
  if (resources.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader icon="grid-outline" title="Halal & Campus Resources" />
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
  const [notifPrefs, setNotifPrefs] = useState<CampusNotifPrefs>({ events: true, announcements: true, jummah: true, prayer: true });
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [isMsaAdmin, setIsMsaAdmin] = useState(false);

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

    // Check follow state, notification prefs, and MSA role in background
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

  const { university, msa, prayerSpaces, prayerTimes, jummah, events, announcements, resources } = campus;
  const location = [university.city, university.state].filter(Boolean).join(', ');
  const hasContent = msa !== null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Back button */}
      <View style={styles.loadingHeader}>
        <TouchableOpacity
          style={styles.backCircle}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={DEEP_GREEN} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* University hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="school" size={32} color={GREEN} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroName}>{university.name}</Text>
            {!!location && (
              <Text style={styles.heroLocation}>
                <Ionicons name="location-outline" size={13} color={TEXT_MUTED} /> {location}
              </Text>
            )}
            {!!university.website && (
              <TouchableOpacity onPress={() => Linking.openURL(university.website!)}>
                <Text style={styles.heroLink}>{university.website.replace(/^https?:\/\//, '')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* MSA info card */}
        {msa && (
          <View style={styles.msaCard}>
            <View style={styles.msaHeader}>
              <View style={styles.msaBadge}>
                <Ionicons name="people" size={16} color={GREEN} />
              </View>
              <View style={styles.msaInfo}>
                <Text style={styles.msaName}>{msa.name}</Text>
                {msa.is_verified && (
                  <View style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={13} color={GREEN} />
                    <Text style={styles.verifiedText}>Verified MSA</Text>
                  </View>
                )}
              </View>
            </View>
            {!!msa.description && (
              <Text style={styles.msaDesc}>{msa.description}</Text>
            )}
            <View style={styles.msaLinks}>
              {!!msa.email && (
                <TouchableOpacity style={styles.msaLinkBtn} onPress={() => Linking.openURL(`mailto:${msa.email}`)}>
                  <Ionicons name="mail-outline" size={15} color={GREEN} />
                  <Text style={styles.msaLinkText}>Email</Text>
                </TouchableOpacity>
              )}
              {!!msa.website && (
                <TouchableOpacity style={styles.msaLinkBtn} onPress={() => Linking.openURL(msa.website!)}>
                  <Ionicons name="globe-outline" size={15} color={GREEN} />
                  <Text style={styles.msaLinkText}>Website</Text>
                </TouchableOpacity>
              )}
              {!!msa.instagram_handle && (
                <TouchableOpacity
                  style={styles.msaLinkBtn}
                  onPress={() => Linking.openURL(`https://instagram.com/${msa.instagram_handle}`)}
                >
                  <Ionicons name="logo-instagram" size={15} color={GREEN} />
                  <Text style={styles.msaLinkText}>Instagram</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Follow CTA */}
        {user && msa && (
          <TouchableOpacity
            style={[styles.followBtn, following && styles.followBtnActive]}
            onPress={onToggleFollow}
            disabled={followLoading}
            activeOpacity={0.8}
          >
            {followLoading ? (
              <ActivityIndicator color={following ? GREEN : '#fff'} size="small" />
            ) : (
              <>
                <Ionicons
                  name={following ? 'notifications' : 'notifications-outline'}
                  size={18}
                  color={following ? GREEN : '#fff'}
                />
                <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
                  {following ? 'Following' : 'Follow Campus'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Manage / Claim this page */}
        {user && campus?.university && (
          isMsaAdmin ? (
            <TouchableOpacity
              style={styles.manageBtn}
              onPress={() => router.push('/(msa)/dashboard' as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={16} color={DEEP_GREEN} />
              <Text style={styles.manageBtnText}>Manage this page</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.claimBtn}
              onPress={() => router.push({
                pathname: '/msa/request-access',
                params: {
                  prefillUniversityId: campus.university.id,
                  prefillUniversityName: campus.university.name,
                  prefillMsaId: campus.msa?.id ?? '',
                  prefillMsaName: campus.msa?.name ?? '',
                },
              } as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="ribbon-outline" size={16} color={GREEN} />
              <Text style={styles.claimBtnText}>
                {campus.msa ? 'Claim this page' : 'Set up MSA for this campus'}
              </Text>
            </TouchableOpacity>
          )
        )}

        {/* No MSA claimed yet */}
        {!hasContent && !campus?.msa && (
          <View style={styles.noMsa}>
            <Ionicons name="information-circle-outline" size={22} color={TEXT_MUTED} />
            <Text style={styles.noMsaText}>
              No MSA has claimed this campus yet.
            </Text>
          </View>
        )}

        {/* Content sections */}
        <PrayerTimesSection  times={prayerTimes}       />
        <JummahSection       jummah={jummah}           />
        <PrayerSpacesSection spaces={prayerSpaces}     />
        <EventsSection       events={events}           />
        <AnnouncementsSection announcements={announcements} />
        <ResourcesSection    resources={resources}     />

        {/* All sections empty but MSA exists */}
        {hasContent && prayerTimes.length === 0 && jummah.length === 0 &&
         prayerSpaces.length === 0 && events.length === 0 &&
         announcements.length === 0 && resources.length === 0 && (
          <View style={styles.emptyContent}>
            <Ionicons name="leaf-outline" size={28} color={TEXT_MUTED} />
            <Text style={styles.emptyContentText}>
              This campus page is being set up. Check back soon.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Notification preferences modal — shown once after following */}
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
                { key: 'events',        label: 'Events',               sub: 'Upcoming MSA events' },
                { key: 'announcements', label: 'Announcements',        sub: 'News and updates' },
                { key: 'jummah',        label: 'Jummah',               sub: 'Time and location changes' },
                { key: 'prayer',        label: 'Prayer Times',         sub: 'Iqama time updates' },
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
  backCircle: {
    width: 36, height: 36, borderRadius: Radius.circle,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
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

  // Hero
  hero: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  heroIcon: {
    width: 56, height: 56, borderRadius: Radius.card,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
    ...Shadow.light,
  },
  heroText:     { flex: 1, gap: 3 },
  heroName:     { ...Type.screenTitle, color: DEEP_GREEN },
  heroLocation: { ...Type.bodySmall, color: TEXT_MUTED },
  heroLink:     { ...Type.caption, color: GREEN, textDecorationLine: 'underline' as const },

  // MSA card
  msaCard: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    padding: Spacing.md, ...Shadow.light,
  },
  msaHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  msaBadge: {
    width: 36, height: 36, borderRadius: Radius.chip,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
  },
  msaInfo:     { flex: 1 },
  msaName:     { ...Type.cardTitle, color: TEXT_DARK },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  verifiedText: { ...Type.tiny, color: DEEP_GREEN, fontWeight: '600' },
  msaDesc:     { ...Type.bodySmall, color: TEXT_MUTED, lineHeight: 20, marginBottom: Spacing.sm },
  msaLinks:    { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' as const },
  msaLinkBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 5,
    backgroundColor: '#f0faf6', borderRadius: Radius.chip,
  },
  msaLinkText: { ...Type.caption, color: GREEN, fontWeight: '600' },

  // Follow button
  followBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    paddingVertical: Spacing.sm + 2, borderRadius: Radius.input,
    backgroundColor: GREEN, gap: Spacing.sm,
    ...Shadow.medium,
  },
  followBtnActive: {
    backgroundColor: '#f0faf6',
    borderWidth: 1, borderColor: GREEN,
  },
  followBtnText:       { ...Type.label, color: '#fff' },
  followBtnTextActive: { color: GREEN },

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

  // Manage / Claim buttons
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    paddingVertical: 10, paddingHorizontal: Spacing.md,
    backgroundColor: '#f0faf6', borderRadius: Radius.chip,
    borderWidth: 1, borderColor: '#c3e8d8',
    justifyContent: 'center',
  },
  manageBtnText: { ...Type.label, color: DEEP_GREEN, fontWeight: '700' },
  claimBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    paddingVertical: 10, paddingHorizontal: Spacing.md,
    backgroundColor: CREAM, borderRadius: Radius.chip,
    borderWidth: 1, borderColor: '#c3e8d8',
    justifyContent: 'center',
  },
  claimBtnText: { ...Type.label, color: GREEN, fontWeight: '600' },

  // No MSA
  noMsa: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    padding: Spacing.md, backgroundColor: '#fffbeb',
    borderRadius: Radius.card, borderWidth: 1, borderColor: '#f6d860',
  },
  noMsaText: { ...Type.bodySmall, color: TEXT_DARK, flex: 1, lineHeight: 20 },

  // Content sections
  section: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    padding: Spacing.md, ...Shadow.light,
  },

  // Prayer times
  prayerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  prayerIcon:     { marginRight: Spacing.sm },
  prayerLabel:    { ...Type.label, color: TEXT_DARK, width: 70 },
  prayerTime:     { ...Type.body, color: DEEP_GREEN, fontWeight: '700' },
  prayerLocation: { ...Type.caption, color: TEXT_MUTED, flex: 1, marginLeft: Spacing.xs },

  // Jummah
  jummahCard:    { paddingVertical: Spacing.sm },
  jummahDivider: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  jummahTime:    { ...Type.cardTitle, color: DEEP_GREEN, marginBottom: 2 },
  jummahDetail:  { ...Type.bodySmall, color: TEXT_MUTED, marginTop: 1 },
  jummahNotes:   { ...Type.caption, color: TEXT_MUTED, marginTop: Spacing.xs, fontStyle: 'italic' as const },

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

  // Events
  eventCard: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  eventMeta:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  catChip: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: Radius.chip,
  },
  catChipText:   { ...Type.tiny, fontWeight: '700' },
  eventDate:     { ...Type.caption, color: TEXT_MUTED },
  eventTitle:    { ...Type.label, color: TEXT_DARK },
  eventTime:     { ...Type.caption, color: DEEP_GREEN, fontWeight: '600', marginTop: 2 },
  eventLocation: { ...Type.caption, color: TEXT_MUTED, marginTop: 2 },
  eventBody:     { ...Type.caption, color: TEXT_MUTED, lineHeight: 18, marginTop: Spacing.xs },
  rsvpBtn:       { alignSelf: 'flex-start', marginTop: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 6, backgroundColor: GREEN, borderRadius: Radius.chip },
  rsvpText:      { ...Type.tiny, color: '#fff', fontWeight: '700' },

  // Announcements
  announcementCard: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  announcementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  announcementTitle:  { ...Type.label, color: TEXT_DARK, flex: 1, marginRight: Spacing.sm },
  announcementDate:   { ...Type.tiny, color: TEXT_MUTED },
  announcementBody:   { ...Type.bodySmall, color: TEXT_MUTED, lineHeight: 20 },

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
});
