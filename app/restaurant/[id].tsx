import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, KeyboardAvoidingView,
  Linking, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
import { getCuisineTheme, Brand } from '../../lib/theme';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';
import { isHFSAACertified } from '../../lib/certifiers';

// ─── constants ────────────────────────────────────────────────────────────────

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const RED   = Brand.red;
const AMBER = Brand.amber;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const PLACEHOLDER_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── cert config ──────────────────────────────────────────────────────────────

const CERT: Record<string, { label: string; color: string; bg: string; certified: boolean; description: string }> = {
  ISNA:           { label: 'ISNA Certified',   color: GREEN,  bg: '#e6f9f2', certified: true,
    description: 'One of the largest Muslim organisations in North America. ISNA Halal certifies food products and restaurants by verifying ingredients, suppliers, and preparation processes against Islamic dietary law.' },
  IFANCA:         { label: 'IFANCA Certified', color: GREEN,  bg: '#e6f9f2', certified: true,
    description: 'A non-profit halal certification body based in Chicago. IFANCA audits facilities and products globally and is widely recognised by Muslim consumers in North America.' },
  HMA:            { label: 'HMA Certified',    color: GREEN,  bg: '#e6f9f2', certified: true,
    description: 'An independent halal certifier operating primarily in the UK and North America. HMA conducts unannounced inspections and requires full supply-chain traceability.' },
  HFA:            { label: 'HFA Certified',    color: GREEN,  bg: '#e6f9f2', certified: true,
    description: 'A UK-based organisation that certifies restaurants, processors, and food manufacturers. HFA issues unique certification numbers and maintains a public register.' },
  HFSAA:          { label: 'HFSAA Certified',  color: GREEN,  bg: '#e6f9f2', certified: true,
    description: 'An American body that certifies products and food-service establishments. HFSAA requires regular audits and prohibits cross-contamination with non-halal items.' },
  HMS:            { label: 'HMS Certified',    color: GREEN,  bg: '#e6f9f2', certified: true,
    description: 'A halal certification and monitoring body that conducts regular inspections of restaurants and food businesses. HMS verifies halal compliance throughout the supply chain.' },
  MUI:            { label: 'MUI Certified',    color: GREEN,  bg: '#e6f9f2', certified: true,
    description: "Indonesia's leading Islamic authority. MUI certification is one of the most recognised halal standards in the world, particularly in South-East Asia. Many global brands carry MUI certification." },
  self_certified: { label: 'Self Certified',   color: AMBER,  bg: '#fefce8', certified: false,
    description: 'The restaurant claims to serve halal food but has not been independently verified by a third-party certifier. The owner may be Muslim and follow halal practices, but there is no external audit. Ask staff about sourcing if in doubt.' },
  muslim_owned:   { label: 'Muslim Owned',     color: AMBER,  bg: '#fefce8', certified: false,
    description: 'This business is Muslim-owned. While not independently halal-certified, Muslim-owned establishments typically follow halal practices. We recommend confirming halal sourcing with staff if needed.' },
  uncertified:    { label: 'Not Certified',    color: TEXT_MUTED, bg: CREAM, certified: false,
    description: 'No halal certification information is available for this restaurant. We recommend contacting the restaurant directly to ask about their halal status before visiting.' },
  unknown:        { label: 'Cert. Unknown',    color: TEXT_MUTED, bg: CREAM, certified: false,
    description: 'The certification status of this restaurant is not yet confirmed. It may have been added by a community member without full details. Contact the restaurant directly for more information.' },
};

// ─── types ────────────────────────────────────────────────────────────────────

interface HoursEntry { open: string; close: string }
// Each day can be a single entry (legacy) or an array of ranges
type OpeningHours = Partial<Record<string, HoursEntry | HoursEntry[]>>;

function fmt24to12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function fmtRange(r: HoursEntry): string {
  if (r.open === '00:00' && r.close === '00:00') return 'Open 24 Hours';
  return `${fmt24to12(r.open)}–${fmt24to12(r.close)}`;
}

function getDayRanges(val: HoursEntry | HoursEntry[] | undefined): HoursEntry[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

interface CategorizedPhotos {
  food?: string[];
  outside?: string[];
  inside?: string[];
  menu?: string[];
}

interface DbRestaurant {
  id: string;
  name: string;
  address: string;
  cuisine_type: string;
  primary_certifier: string;
  certifiers: string | null;
  confidence: string | null;
  status: string | null;
  is_verified: boolean;
  phone: string | null;
  website: string | null;
  image_url: string | null;
  opening_hours: OpeningHours | null;
  gallery_images?: string[] | null;
  categorized_photos?: CategorizedPhotos | null;
  owner_id?: string | null;
  instagram_handle?: string | null;
  zabihah_status?: 'full' | 'partial' | null;
  zabihah_notes?: string | null;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function CertBadge({ type, onPress }: { type: string; onPress?: () => void }) {
  const cfg = CERT[type] ?? CERT.unknown;
  return (
    <TouchableOpacity
      style={[badge.wrap, { backgroundColor: cfg.bg }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <Ionicons
        name={cfg.certified ? 'checkmark-circle' : 'help-circle-outline'}
        size={14}
        color={cfg.color}
      />
      <Text style={[badge.text, { color: cfg.color }]}>{cfg.label}</Text>
      {onPress && <Ionicons name="information-circle-outline" size={13} color={cfg.color} style={{ marginLeft: 1 }} />}
    </TouchableOpacity>
  );
}

const badge = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  text: { fontSize: 13, fontWeight: '600' },
});

function TrustBlock({ restaurant, onLearnMore }: { restaurant: DbRestaurant; onLearnMore: (type: string) => void }) {
  const certType = restaurant.primary_certifier ?? 'unknown';
  const cfg = CERT[certType] ?? CERT.unknown;
  const hfsaa = isHFSAACertified(restaurant.primary_certifier, restaurant.certifiers);
  const isFullZabihah = restaurant.zabihah_status === 'full' || hfsaa;
  const isPartialZabihah = restaurant.zabihah_status === 'partial' && !hfsaa;

  let label = cfg.label;
  if (isFullZabihah) label += ' · Zabihah Halal';
  else if (isPartialZabihah) label += ' · Partial Zabihah';

  let note: string | null = null;
  if (certType === 'self_certified' && !isFullZabihah && !isPartialZabihah) {
    note = 'Ask staff about halal sourcing before dining.';
  } else if (certType === 'uncertified' || certType === 'unknown') {
    note = 'Contact the restaurant to confirm halal status.';
  } else if (isPartialZabihah && restaurant.zabihah_notes) {
    note = restaurant.zabihah_notes;
  }

  const tappable = cfg.certified || certType === 'self_certified' || certType === 'muslim_owned';

  const iconName: keyof typeof Ionicons.glyphMap =
    certType === 'uncertified' || certType === 'unknown'
      ? 'information-circle-outline'
      : cfg.certified
        ? (isFullZabihah ? 'leaf' : 'checkmark-circle')
        : 'warning-outline';

  return (
    <TouchableOpacity
      style={[tb.block, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}
      onPress={tappable ? () => onLearnMore(certType) : undefined}
      activeOpacity={tappable ? 0.75 : 1}
      disabled={!tappable}
    >
      <View style={tb.row}>
        <Ionicons name={iconName} size={16} color={cfg.color} />
        <Text style={[tb.label, { color: cfg.color }]} numberOfLines={2}>{label}</Text>
        {tappable && <Ionicons name="chevron-forward" size={14} color={cfg.color} />}
      </View>
      {note ? <Text style={[tb.note, { color: cfg.color }]}>{note}</Text> : null}
    </TouchableOpacity>
  );
}

const tb = StyleSheet.create({
  block: { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 10 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 14, fontWeight: '600', flex: 1 },
  note:  { fontSize: 12, marginTop: 5, lineHeight: 17, opacity: 0.8 },
});


// ─── screen ───────────────────────────────────────────────────────────────────

export default function RestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();

  const [restaurant,   setRestaurant]   = useState<DbRestaurant | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // save / bookmark
  const [saved,        setSaved]        = useState(false);
  const [saveLoading,  setSaveLoading]  = useState(false);

  // claim
  const [existingClaim, setExistingClaim] = useState<string | null>(null); // status of user's claim

  // cert popup
  const [certPopupType,  setCertPopupType]  = useState<string | null>(null);
  const [reportVisible,  setReportVisible]  = useState(false);
  const [reportReason,   setReportReason]   = useState<string | null>(null);
  const [reportComment,  setReportComment]  = useState('');
  const [reportSending,  setReportSending]  = useState(false);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex,  setLightboxIndex]  = useState(0);
  const lightboxRef = useRef<FlatList<string>>(null);

  const openLightbox = (photos: string[], index: number) => {
    setLightboxPhotos(photos);
    setLightboxIndex(index);
  };
  const closeLightbox = () => {
    setLightboxPhotos([]);
    setLightboxIndex(0);
  };

  // ── fetch ──────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    // Fetch restaurant — pass 1: all columns
    let { data: r, error: rErr } = await supabase
      .from('restaurants')
      .select('id, name, address, cuisine_type, primary_certifier, certifiers, confidence, status, is_verified, phone, website, image_url, opening_hours, categorized_photos, owner_id, instagram_handle, zabihah_status, zabihah_notes')
      .eq('id', id)
      .single();

    // pass 2: fallback if optional columns not yet migrated
    if (rErr?.message?.includes('opening_hours') || rErr?.message?.includes('categorized_photos') || rErr?.message?.includes('owner_id') || rErr?.message?.includes('zabihah_status')) {
      ({ data: r, error: rErr } = await supabase
        .from('restaurants')
        .select('id, name, address, cuisine_type, primary_certifier, certifiers, confidence, status, is_verified, phone, website, image_url')
        .eq('id', id)
        .single());
    }

    if (rErr || !r) {
      setError(rErr?.message ?? 'Restaurant not found');
      setLoading(false);
      return;
    }

    const restaurant = r as DbRestaurant;
    setRestaurant({ ...restaurant, opening_hours: restaurant.opening_hours ?? null });

    // Check if user has saved this restaurant
    if (user) {
      const [svRes, claimRes] = await Promise.all([
        supabase
          .from('saved_restaurants')
          .select('id')
          .eq('user_id', user.id)
          .eq('restaurant_id', id)
          .maybeSingle(),
        supabase
          .from('restaurant_claims')
          .select('status')
          .eq('user_id', user.id)
          .eq('restaurant_id', id)
          .maybeSingle(),
      ]);
      setSaved(!!svRes.data);
      setExistingClaim(claimRes.data?.status ?? null);
    }

    setLoading(false);
  }, [id, user]);

  const isMounted = useRef(false);
  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => {
    if (isMounted.current) loadData();
    else isMounted.current = true;
  }, [loadData]));

  const toggleSave = async () => {
    if (!user) {
      Alert.alert(
        'Sign in to save',
        'Create a free account to save restaurants and access them anytime.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign In', onPress: () => { setGuestLoginIntent(true); router.push('/(auth)/login'); } },
        ],
      );
      return;
    }
    setSaveLoading(true);
    if (saved) {
      const { error } = await supabase
        .from('saved_restaurants')
        .delete()
        .eq('user_id', user.id)
        .eq('restaurant_id', id);
      if (!error) setSaved(false);
    } else {
      const { error } = await supabase
        .from('saved_restaurants')
        .insert({ user_id: user.id, restaurant_id: id });
      if (!error) {
        setSaved(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    setSaveLoading(false);
  };

  const handleReport = async () => {
    if (!reportReason) { Alert.alert('Select a reason', 'Please choose a reason before submitting.'); return; }
    if (!user) { Alert.alert('Sign in required', 'Please sign in to submit a report.'); return; }
    setReportSending(true);
    const { error } = await supabase.from('reports').insert({
      reporter_id:  user.id,
      content_type: 'restaurant',
      content_id:   id,
      reason:       reportReason,
      comment:      reportComment.trim() || null,
    });
    setReportSending(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setReportVisible(false);
    setReportReason(null);
    setReportComment('');
    Alert.alert('Report submitted', 'Thanks for letting us know. Our team will review this listing.');
  };

  const handleShare = async () => {
    if (!restaurant) return;
    await Share.share({
      title: restaurant.name,
      message: `${restaurant.name}\n${restaurant.address}\n\nFound on Rihdal — halalforme://restaurant/${id}`,
    });
  };

  // ── today's hours ─────────────────────────────────────────────
  const todayName = DAYS[new Date().getDay()];

  // ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={[s.header, { paddingTop: 12 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
        </View>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !restaurant) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={[s.header, { paddingTop: 12 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
        </View>
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={TEXT_MUTED} />
          <Text style={s.errTitle}>Could not load restaurant</Text>
          <Text style={s.errDetail}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={loadData}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.flex}>
      <ScrollView
        style={s.flex}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── hero image ── */}
        {(() => {
          const ct = getCuisineTheme(restaurant.cuisine_type);
          // Best available photo: admin categorized → first approved community photo → none
          const cats = restaurant.categorized_photos;
          const heroPhoto =
            restaurant.image_url ??
            cats?.food?.[0] ??
            cats?.outside?.[0] ??
            cats?.inside?.[0] ??
            null;

          return (
          <View style={s.hero}>
            {heroPhoto ? (
              <Image
                source={heroPhoto}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                placeholder={PLACEHOLDER_BLURHASH}
                transition={300}
              />
            ) : (
              <View style={[s.heroPlaceholder, { backgroundColor: ct.color }]}>
                {/* radial-ish glow in top-right corner */}
                <View style={s.heroGlow} />
                <Text style={s.heroEmoji}>{ct.emoji}</Text>
                <Text style={s.heroRestaurantName} numberOfLines={2}>
                  {restaurant.name}
                </Text>
                <View style={[s.heroCuisineTag]}>
                  <Text style={s.heroCuisineTagText}>{restaurant.cuisine_type}</Text>
                </View>
              </View>
            )}
          {/* instagram photo credit */}
          {heroPhoto && restaurant.instagram_handle ? (
            <TouchableOpacity
              style={s.photoCredit}
              onPress={() => Linking.openURL(`https://www.instagram.com/${restaurant.instagram_handle!.replace(/^@/, '')}`)}
              activeOpacity={0.75}
            >
              <Ionicons name="logo-instagram" size={11} color="rgba(255,255,255,0.9)" />
              <Text style={s.photoCreditText}>
                @{restaurant.instagram_handle!.replace(/^@/, '')}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* back button + save button overlaid on hero */}
          <View style={[s.heroHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
            </TouchableOpacity>
            <View style={s.heroActions}>
              {isAdmin && (
                <TouchableOpacity
                  style={s.backBtn}
                  onPress={() => router.push(`/(admin)/edit/${id}`)}
                >
                  <Ionicons name="create-outline" size={20} color={TEXT_DARK} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.backBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={20} color={TEXT_DARK} />
              </TouchableOpacity>
              <TouchableOpacity style={s.backBtn} onPress={toggleSave} disabled={saveLoading}>
                <Ionicons
                  name={saved ? 'heart' : 'heart-outline'}
                  size={20}
                  color={saved ? RED : TEXT_DARK}
                />
              </TouchableOpacity>
            </View>
          </View>
          </View>
          );
        })()}

        {/* ── name / cert / rating ── */}
        <View style={s.infoSection}>
          <View style={s.nameRow}>
            <Text style={s.name}>{restaurant.name}</Text>
            {restaurant.is_verified && restaurant.primary_certifier !== 'unknown' && restaurant.primary_certifier !== 'uncertified' && (
              <View style={s.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={13} color={GREEN} />
                <Text style={s.verifiedText}>Verified</Text>
              </View>
            )}
          </View>

          <Text style={s.cuisine}>{restaurant.cuisine_type}</Text>

          <TrustBlock restaurant={restaurant} onLearnMore={(type) => setCertPopupType(type)} />
        </View>

        {/* ── photo gallery ── */}
        {(() => {
          const cp = restaurant.categorized_photos;
          if (!cp) return null;
          const allPhotos = [
            ...(Array.isArray(cp.food)    ? cp.food    : []),
            ...(Array.isArray(cp.outside) ? cp.outside : []),
            ...(Array.isArray(cp.inside)  ? cp.inside  : []),
            ...(Array.isArray(cp.menu)    ? cp.menu    : []),
          ];
          if (allPhotos.length === 0) return null;
          return (
            <View style={s.gallerySection}>
              <Text style={s.gallerySectionTitle}>Photos</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.galleryRow}
              >
                {allPhotos.map((url, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => openLightbox(allPhotos, i)}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={url}
                      style={s.galleryThumb}
                      contentFit="cover"
                      placeholder={PLACEHOLDER_BLURHASH}
                      transition={200}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          );
        })()}

        {/* ── details card ── */}
        <View style={s.card}>
          {/* address */}
          <TouchableOpacity
            style={s.detailRow}
            onPress={() => {
              const q = encodeURIComponent(restaurant.address);
              const url = Platform.OS === 'ios'
                ? `maps://0,0?q=${q}`
                : `geo:0,0?q=${q}`;
              Linking.canOpenURL(url).then(supported =>
                Linking.openURL(supported ? url : `https://maps.google.com/?q=${q}`)
              );
            }}
          >
            <Ionicons name="location-outline" size={18} color={GREEN} />
            <Text style={[s.detailText, s.link]}>{restaurant.address}</Text>
          </TouchableOpacity>

          {/* phone */}
          {restaurant.phone ? (
            <TouchableOpacity
              style={s.detailRow}
              onPress={() => Linking.openURL(`tel:${restaurant.phone}`)}
            >
              <Ionicons name="call-outline" size={18} color={GREEN} />
              <Text style={[s.detailText, s.link]}>{restaurant.phone}</Text>
            </TouchableOpacity>
          ) : null}

          {/* website */}
          {restaurant.website ? (
            <TouchableOpacity
              style={s.detailRow}
              onPress={() => Linking.openURL(restaurant.website!)}
            >
              <Ionicons name="globe-outline" size={18} color={GREEN} />
              <Text style={[s.detailText, s.link]} numberOfLines={1}>{restaurant.website}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── manage listing button (owner or admin) ── */}
        {user && (isAdmin || restaurant.owner_id === user.id) && (
          <TouchableOpacity
            style={s.claimBtn}
            onPress={() => router.push(`/manage-restaurant/${id}`)}
            activeOpacity={0.75}
          >
            <Ionicons name="settings-outline" size={15} color={GREEN} />
            <Text style={s.claimBtnText}>Manage my listing</Text>
            <Ionicons name="chevron-forward" size={14} color={GREEN} />
          </TouchableOpacity>
        )}

        {/* ── claim listing button ── */}
        {user && !isAdmin && (() => {
          if (restaurant.owner_id) return null; // already claimed
          if (existingClaim === 'approved') return null;
          if (existingClaim === 'pending') {
            return (
              <View style={s.claimPendingBanner}>
                <Ionicons name="time-outline" size={15} color={AMBER} />
                <Text style={s.claimPendingText}>Your ownership claim is under review</Text>
              </View>
            );
          }
          return (
            <TouchableOpacity
              style={s.claimBtn}
              onPress={() => router.push(`/claim-restaurant/${id}`)}
              activeOpacity={0.75}
            >
              <Ionicons name="storefront-outline" size={15} color={GREEN} />
              <Text style={s.claimBtnText}>Are you the owner? Claim this listing</Text>
              <Ionicons name="chevron-forward" size={14} color={GREEN} />
            </TouchableOpacity>
          );
        })()}

        {/* ── opening hours ── */}
        {restaurant.opening_hours && Object.keys(restaurant.opening_hours).length > 0 ? (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Opening Hours</Text>
            {DAYS.map(day => {
              const ranges = getDayRanges(restaurant.opening_hours![day]);
              const isToday = day === todayName;
              return (
                <View
                  key={day}
                  style={[s.hoursRow, isToday && s.hoursRowToday]}
                >
                  <Text style={[s.hoursDay, isToday && s.hoursDayToday]}>{day}</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    {ranges.length === 0 ? (
                      <Text style={[s.hoursTime, isToday && s.hoursTimeToday]}>Closed</Text>
                    ) : (
                      ranges.map((r, i) => (
                        <Text key={i} style={[s.hoursTime, isToday && s.hoursTimeToday]}>
                          {fmtRange(r)}
                        </Text>
                      ))
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}


        {/* ── report link ── */}
        <TouchableOpacity
          style={s.reportLink}
          onPress={() => {
            if (!user) {
              Alert.alert('Sign in required', 'Please sign in to report an issue.', [
                { text: 'Not now', style: 'cancel' },
                { text: 'Sign In', onPress: () => { setGuestLoginIntent(true); router.push('/(auth)/login'); } },
              ]);
              return;
            }
            setReportVisible(true);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
        >
          <Ionicons name="flag-outline" size={13} color={TEXT_MUTED} />
          <Text style={s.reportLinkText}>Report an issue</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── report modal ── */}
      <Modal
        visible={reportVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setReportVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setReportVisible(false)}
          />
          <View style={rp.sheet}>
            <View style={rp.handle} />
            <Text style={rp.title}>Report an Issue</Text>
            <Text style={rp.subtitle}>What's wrong with this listing?</Text>

            {[
              { key: 'other',         label: 'Incorrect info',         sub: 'Name, address, phone, website' },
              { key: 'spam',          label: 'Not halal / mislabeled', sub: 'Certification seems wrong'     },
              { key: 'inappropriate', label: 'Inappropriate content',  sub: 'Photos or description'         },
              { key: 'harassment',    label: 'Other',                  sub: 'Something else is wrong'       },
            ].map(({ key, label, sub }) => (
              <TouchableOpacity
                key={key}
                style={[rp.option, reportReason === key && rp.optionSelected]}
                onPress={() => setReportReason(key)}
              >
                <View style={rp.optionRadio}>
                  {reportReason === key && <View style={rp.optionRadioFill} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[rp.optionLabel, reportReason === key && rp.optionLabelSelected]}>{label}</Text>
                  <Text style={rp.optionSub}>{sub}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TextInput
              style={rp.input}
              placeholder="Add details (optional)"
              placeholderTextColor="#bbb"
              value={reportComment}
              onChangeText={setReportComment}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[rp.submitBtn, (!reportReason || reportSending) && rp.btnDisabled]}
              onPress={handleReport}
              disabled={!reportReason || reportSending}
            >
              {reportSending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={rp.submitBtnText}>Submit Report</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── cert info popup ── */}
      <Modal
        visible={!!certPopupType}
        transparent
        animationType="fade"
        onRequestClose={() => setCertPopupType(null)}
      >
        <TouchableOpacity
          style={cp.overlay}
          activeOpacity={1}
          onPress={() => setCertPopupType(null)}
        >
          <TouchableOpacity style={cp.sheet} activeOpacity={1} onPress={() => {}}>
            {certPopupType && (() => {
              const cfg = CERT[certPopupType] ?? CERT.unknown;
              return (
                <>
                  <View style={cp.header}>
                    <View style={[cp.iconWrap, { backgroundColor: cfg.bg }]}>
                      <Ionicons
                        name={cfg.certified ? 'checkmark-circle' : 'help-circle-outline'}
                        size={28}
                        color={cfg.color}
                      />
                    </View>
                    <TouchableOpacity onPress={() => setCertPopupType(null)} hitSlop={12}>
                      <Ionicons name="close" size={20} color={TEXT_MUTED} />
                    </TouchableOpacity>
                  </View>
                  <Text style={cp.label}>{cfg.label}</Text>
                  <Text style={cp.description}>{cfg.description}</Text>
                  <TouchableOpacity
                    style={[cp.guideBtn, { borderColor: cfg.color + '44', backgroundColor: cfg.bg }]}
                    onPress={() => { setCertPopupType(null); router.push('/certification-guide'); }}
                  >
                    <Text style={[cp.guideBtnText, { color: cfg.color }]}>View full certification guide</Text>
                    <Ionicons name="chevron-forward" size={14} color={cfg.color} />
                  </TouchableOpacity>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── photo lightbox carousel ── */}
      <Modal
        visible={lightboxPhotos.length > 0}
        animationType="fade"
        transparent
        onRequestClose={closeLightbox}
      >
        <View style={lb.overlay}>
          <FlatList
            ref={lightboxRef}
            data={lightboxPhotos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            initialScrollIndex={lightboxIndex}
            getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
            onMomentumScrollEnd={e => {
              setLightboxIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W));
            }}
            renderItem={({ item }) => (
              <View style={lb.slide}>
                <Image source={item} style={lb.image} contentFit="contain" />
              </View>
            )}
            style={lb.flatList}
          />
          {/* Rendered after FlatList so they sit on top in the touch responder hierarchy */}
          {lightboxPhotos.length > 1 && (
            <Text style={lb.counter}>{lightboxIndex + 1} / {lightboxPhotos.length}</Text>
          )}
          {lightboxPhotos.length > 1 && (
            <View style={lb.dots}>
              {lightboxPhotos.map((_, i) => (
                <View key={i} style={[lb.dot, i === lightboxIndex && lb.dotActive]} />
              ))}
            </View>
          )}
          <TouchableOpacity style={lb.closeBtn} onPress={closeLightbox} hitSlop={12}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },

  // header / back
  header: {
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },

  // hero
  hero: { height: 220, backgroundColor: '#e4ede4' },
  heroHeader: {
    paddingHorizontal: 16,
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  photoCredit: {
    position: 'absolute', bottom: 8, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  photoCreditText: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },
  heroActions: { flexDirection: 'row', gap: 8 },
  heroPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 8, overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute', top: -40, right: -40,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroEmoji: { fontSize: 52 },
  heroRestaurantName: {
    fontSize: 20, fontWeight: '800', color: '#fff',
    textAlign: 'center', paddingHorizontal: 24,
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  heroCuisineTag: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
  },
  heroCuisineTagText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // info section
  infoSection: {
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  name:    { flex: 1, fontSize: 22, fontWeight: '800', color: TEXT_DARK },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e6f9f2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  verifiedText: { fontSize: 11, color: GREEN, fontWeight: '600' },
  cuisine:      { fontSize: 14, color: TEXT_MUTED, marginBottom: 8 },

  // details card
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

  // hours
  sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK, marginBottom: 4 },
  hoursRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  hoursRowToday: { backgroundColor: '#f0faf6', marginHorizontal: -16, paddingHorizontal: 16, borderRadius: 8 },
  hoursDay:      { fontSize: 14, color: TEXT_MUTED, width: 100 },
  hoursDayToday: { color: GREEN, fontWeight: '700' },
  hoursTime:     { fontSize: 14, color: TEXT_MUTED },
  hoursTimeToday:{ color: GREEN, fontWeight: '700' },

  // claim
  claimBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: '#f0faf6', borderWidth: 1.5, borderColor: '#c3e8d8',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
  },
  claimBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: GREEN },
  claimPendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: '#fefce8', borderWidth: 1.5, borderColor: '#f6d860',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
  },
  claimPendingText: { fontSize: 13, fontWeight: '600', color: AMBER },

  // error
  errTitle:  { fontSize: 17, fontWeight: '700', color: RED },
  errDetail: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn:  { marginTop: 8, backgroundColor: DEEP_GREEN, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // report link
  reportLink: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'center', marginTop: 20, marginBottom: 8, opacity: 0.6,
  },
  reportLinkText: { fontSize: 12, color: TEXT_MUTED },

  // photo gallery
  gallerySection: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12,
    borderRadius: 16, paddingTop: 14, paddingBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  gallerySectionTitle: {
    fontSize: 16, fontWeight: '700', color: TEXT_DARK,
    marginBottom: 10, paddingHorizontal: 16,
  },
  galleryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  galleryThumb: { width: 100, height: 100, borderRadius: 10 },

});

const cp = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  label:       { fontSize: 17, fontWeight: '700', color: TEXT_DARK, marginBottom: 10 },
  description: { fontSize: 14, color: TEXT_MUTED, lineHeight: 21, marginBottom: 18 },
  guideBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  guideBtnText: { fontSize: 13, fontWeight: '600' },
});

const rp = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 18,
  },
  title:    { fontSize: 18, fontWeight: '800', color: TEXT_DARK, marginBottom: 4 },
  subtitle: { fontSize: 13, color: TEXT_MUTED, marginBottom: 16 },

  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: HAIRLINE,
    backgroundColor: CREAM, marginBottom: 8,
  },
  optionSelected: { borderColor: GREEN, backgroundColor: '#f0faf6' },
  optionRadio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: HAIRLINE,
    alignItems: 'center', justifyContent: 'center',
  },
  optionRadioFill: {
    width: 9, height: 9, borderRadius: 5, backgroundColor: GREEN,
  },
  optionLabel:         { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  optionLabelSelected: { color: GREEN },
  optionSub:           { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },

  input: {
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 12,
    padding: 12, fontSize: 14, color: TEXT_DARK,
    backgroundColor: CREAM, minHeight: 72, marginTop: 8, marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled:   { opacity: 0.5 },
});

const lb = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
  },
  flatList: { flex: 1 },
  slide: {
    width: SCREEN_W, height: SCREEN_H,
    justifyContent: 'center', alignItems: 'center',
  },
  image: { width: SCREEN_W, height: SCREEN_H * 0.72 },
  closeBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  counter: {
    position: 'absolute', top: Platform.OS === 'ios' ? 66 : 36,
    left: 0, right: 0, textAlign: 'center',
    color: '#fff', fontSize: 14, fontWeight: '600', zIndex: 10,
  },
  dots: {
    position: 'absolute', bottom: 48,
    left: 0, right: 0, flexDirection: 'row',
    justifyContent: 'center', gap: 6,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#fff', transform: [{ scale: 1.5 }],
  },
});

