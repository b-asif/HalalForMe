import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform,
  ScrollView, Share, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { getCuisineTheme, Brand } from '../../lib/theme';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';

// ─── constants ────────────────────────────────────────────────────────────────

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const RED   = Brand.red;
const AMBER = Brand.amber;
const GOLD  = Brand.gold;
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
}

interface DbReview {
  id: string;
  user_id: string;
  rating: number;
  halal_compliance_rating: number;
  food_rating: number | null;
  ambiance_rating: number | null;
  service_rating: number | null;
  value_rating: number | null;
  comment: string | null;
  photo_urls: string[] | null;
  created_at: string;
  // Many-to-one join: Supabase returns a single object, not an array
  profiles: { name: string | null } | null;
  is_anonymous: boolean;
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

function Stars({ value, max = 5, color = GOLD, size = 13 }: {
  value: number; max?: number; color?: string; size?: number;
}) {
  const full  = Math.min(max, Math.max(0, Math.round(value)));
  const empty = max - full;
  return (
    <Text style={{ color, fontSize: size, letterSpacing: -0.5 }}>
      {'★'.repeat(full)}{'☆'.repeat(empty)}
    </Text>
  );
}

function StarPicker({ value, onChange, color = GOLD }: {
  value: number; onChange: (v: number) => void; color?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={{ fontSize: 28, color: n <= value ? color : TEXT_MUTED }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ReviewCard({ review, onPhotoPress, onEdit, onDelete, onReport, onBlock }: {
  review: DbReview;
  onPhotoPress: (url: string, urls: string[]) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
}) {
  const rawName = review.is_anonymous ? 'Anonymous' : (review.profiles?.name ?? 'Anonymous');
  const name = (() => {
    if (rawName === 'Anonymous') return rawName;
    const parts = rawName.trim().split(/\s+/);
    if (parts.length < 2) return rawName;
    return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
  })();
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  const date = new Date(review.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <View style={rc.card}>
      <View style={rc.row}>
        <View style={rc.avatar}>
          <Text style={rc.initials}>{initials}</Text>
        </View>
        <View style={rc.meta}>
          <Text style={rc.name}>{name}</Text>
          <Text style={rc.date}>{date}</Text>
        </View>
        <Stars value={review.rating} />
        {(onReport || onBlock) && (
          <TouchableOpacity
            style={rc.menuBtn}
            onPress={() => Alert.alert('Options', undefined, [
              ...(onReport ? [{ text: 'Report content', onPress: onReport }] : []),
              ...(onBlock  ? [{ text: 'Block user', style: 'destructive' as const, onPress: onBlock }] : []),
              { text: 'Cancel', style: 'cancel' as const },
            ])}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color={TEXT_MUTED} />
          </TouchableOpacity>
        )}
      </View>

      <View style={rc.ratingsGrid}>
        {([
          { label: 'Halal',    value: review.halal_compliance_rating, color: GREEN },
          { label: 'Food',     value: review.food_rating,             color: GOLD },
          { label: 'Ambiance', value: review.ambiance_rating,         color: GOLD },
          { label: 'Service',  value: review.service_rating,          color: GOLD },
          { label: 'Value',    value: review.value_rating,            color: GOLD },
        ] as { label: string; value: number | null; color: string }[])
          .filter(r => r.value != null && r.value > 0)
          .map(r => (
            <View key={r.label} style={rc.ratingPill}>
              <Text style={rc.ratingPillLabel}>{r.label}</Text>
              <Stars value={r.value!} color={r.color} size={11} />
            </View>
          ))}
      </View>

      {review.comment ? (
        <Text style={rc.comment}>{review.comment}</Text>
      ) : null}

      {review.photo_urls && review.photo_urls.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={rc.photoStrip}>
          {review.photo_urls.map((url, i) => (
            <TouchableOpacity key={i} onPress={() => onPhotoPress(url, review.photo_urls!)} activeOpacity={0.85}>
              <Image source={url} style={rc.photo} contentFit="cover" placeholder={PLACEHOLDER_BLURHASH} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {(onEdit || onDelete) && (
        <View style={rc.actions}>
          {onEdit && (
            <TouchableOpacity style={rc.editAction} onPress={onEdit} activeOpacity={0.7}>
              <Ionicons name="pencil-outline" size={13} color={GREEN} />
              <Text style={rc.editActionText}>Edit</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity style={rc.deleteAction} onPress={onDelete} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={13} color={RED} />
              <Text style={rc.deleteActionText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const rc = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  row:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar:    {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  initials:  { fontSize: 13, fontWeight: '700', color: GREEN },
  meta:      { flex: 1 },
  name:      { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  date:      { fontSize: 11, color: TEXT_MUTED, marginTop: 1 },
  ratingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  ratingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: CREAM, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  ratingPillLabel: { fontSize: 10, color: TEXT_MUTED, fontWeight: '600' },
  comment:   { fontSize: 14, color: TEXT_DARK, lineHeight: 20 },
  photoStrip: { marginTop: 10 },
  photo: { width: 90, height: 90, borderRadius: 10, marginRight: 8 },
  actions: {
    flexDirection: 'row', gap: 8, marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  editAction: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#f0faf6', borderWidth: 1, borderColor: '#c3e8d8',
  },
  editActionText: { fontSize: 12, color: GREEN, fontWeight: '600' },
  deleteAction: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fca5a5',
  },
  deleteActionText: { fontSize: 12, color: RED, fontWeight: '600' },
  menuBtn: { padding: 4, marginLeft: 4 },
});

// ─── listing completeness card ────────────────────────────────────────────────

function ListingCompletenessCard({
  hasPhotos, hasReviews,
  onAddPhoto, onWriteReview,
}: {
  hasPhotos: boolean;
  hasReviews: boolean;
  onAddPhoto: () => void;
  onWriteReview: () => void;
}) {
  const total     = 2;
  const completed = [hasPhotos, hasReviews].filter(Boolean).length;

  if (completed >= total) return null;

  const items = [
    { done: hasPhotos,  label: 'Community photos', action: 'Add a photo',    onPress: onAddPhoto },
    { done: hasReviews, label: 'Reviews',          action: 'Write a review', onPress: onWriteReview },
  ];

  return (
    <View style={comp.card}>
      <Text style={comp.heading}>Help complete this listing</Text>
      <View style={comp.barTrack}>
        <View style={[comp.barFill, { width: `${Math.round((completed / total) * 100)}%` as `${number}%` }]} />
      </View>
      <Text style={comp.barLabel}>{completed} of {total} complete</Text>
      <View style={comp.list}>
        {items.map(item => (
          <View key={item.label} style={comp.row}>
            <Ionicons
              name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={item.done ? GREEN : TEXT_MUTED}
            />
            {item.done ? (
              <Text style={comp.doneText}>{item.label}</Text>
            ) : (
              <TouchableOpacity style={comp.actionWrap} onPress={item.onPress} activeOpacity={0.7}>
                <Text style={comp.actionText}>{item.action}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const comp = StyleSheet.create({
  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, marginBottom: 12,
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
    borderLeftWidth: 3, borderLeftColor: GREEN,
  },
  heading:  { fontSize: 14, fontWeight: '700', color: TEXT_DARK, marginBottom: 10 },
  barTrack: {
    height: 6, backgroundColor: HAIRLINE, borderRadius: 3, overflow: 'hidden', marginBottom: 4,
  },
  barFill:  { height: '100%', backgroundColor: GREEN, borderRadius: 3 },
  barLabel: { fontSize: 11, color: TEXT_MUTED, marginBottom: 12 },
  list:     { gap: 10 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  doneText: { fontSize: 13, color: TEXT_MUTED, textDecorationLine: 'line-through' },
  actionWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionText: { fontSize: 13, fontWeight: '600', color: GREEN },
});

// ─── screen ───────────────────────────────────────────────────────────────────

export default function RestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { width: SCREEN_W } = useWindowDimensions();
  const { user, isAdmin } = useAuth();

  const [restaurant,   setRestaurant]   = useState<DbRestaurant | null>(null);
  const [reviews,      setReviews]      = useState<DbReview[]>([]);
  const [menuPhotos, setMenuPhotos] = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  const [restaurantPhotos,   setRestaurantPhotos]   = useState<{ url: string; category: string }[]>([]);
  const [photoTab,           setPhotoTab]           = useState<'outside' | 'inside' | 'food' | 'menu'>('food');

  // save / bookmark
  const [saved,        setSaved]        = useState(false);
  const [saveLoading,  setSaveLoading]  = useState(false);

  // claim
  const [existingClaim, setExistingClaim] = useState<string | null>(null); // status of user's claim

  // cert popup
  const [certPopupType, setCertPopupType] = useState<string | null>(null);

  // gallery lightbox
  const [lightboxUrl,   setLightboxUrl]   = useState<string | null>(null);
  const [lightboxUrls,  setLightboxUrls]  = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxScrollRef = useRef<ScrollView>(null);
  const closeLightbox = () => {
    setLightboxUrl(null);
    setLightboxUrls([]);
    setLightboxIndex(0);
  };

  // review photo preview (in-modal, so it works while review modal is open)
  const [reviewPreviewIndex, setReviewPreviewIndex] = useState<number | null>(null);

  // review modal
  const [modalVisible,     setModalVisible]     = useState(false);
  const [editingReviewId,  setEditingReviewId]  = useState<string | null>(null);
  const [rating,           setRating]           = useState(0);
  const [complianceRating, setComplianceRating] = useState(0);
  const [foodRating,       setFoodRating]       = useState(0);
  const [ambianceRating,   setAmbianceRating]   = useState(0);
  const [serviceRating,    setServiceRating]    = useState(0);
  const [valueRating,      setValueRating]      = useState(0);
  const [comment,          setComment]          = useState('');
  const [reviewPhotos,     setReviewPhotos]     = useState<{ uri: string; base64: string; category: 'food' | 'outside' | 'inside' }[]>([]);
  const [isAnonymous,      setIsAnonymous]      = useState(false);
  const [submitting,       setSubmitting]       = useState(false);

  // report modal
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);
  const [reportReason,      setReportReason]      = useState<string | null>(null);
  const [reportComment,     setReportComment]     = useState('');
  const [reportSubmitting,  setReportSubmitting]  = useState(false);

  // blocks
  const [blockedIds,        setBlockedIds]        = useState<string[]>([]);

  const pickReviewPhoto = async () => {
    if (reviewPhotos.length >= 3) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: 3 - reviewPhotos.length,
    });
    if (!result.canceled) {
      const picked = result.assets
        .filter(a => a.base64)
        .map(a => ({ uri: a.uri, base64: a.base64!, category: 'food' as const }));
      setReviewPhotos(prev => [...prev, ...picked].slice(0, 3));
    }
  };

  const uploadReviewPhoto = async (base64: string): Promise<string> => {
    const uuid = Math.random().toString(36).slice(2);
    const path = `reviews/${uuid}.jpg`;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const { error } = await supabase.storage
      .from('gallery_photos')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('gallery_photos').getPublicUrl(path);
    return data.publicUrl;
  };

  // ── fetch ──────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    // Fetch restaurant — pass 1: all columns
    let { data: r, error: rErr } = await supabase
      .from('restaurants')
      .select('id, name, address, cuisine_type, primary_certifier, certifiers, confidence, status, is_verified, phone, website, image_url, opening_hours, gallery_images, categorized_photos, owner_id, instagram_handle')
      .eq('id', id)
      .single();

    // pass 2: fallback if optional columns not yet migrated
    if (rErr?.message?.includes('opening_hours') || rErr?.message?.includes('gallery_images') || rErr?.message?.includes('categorized_photos') || rErr?.message?.includes('owner_id')) {
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

    // Fetch reviews with reviewer name — only show approved reviews publicly
    let { data: rv, error: rvErr } = await supabase
      .from('reviews')
      .select('id, user_id, rating, halal_compliance_rating, food_rating, ambiance_rating, service_rating, value_rating, comment, photo_urls, created_at, is_anonymous, profiles!user_id(name)')
      .eq('restaurant_id', id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    // Fallback: if is_anonymous column doesn't exist in DB yet, retry without it
    if (rvErr?.message?.includes('is_anonymous')) {
      ({ data: rv } = await supabase
        .from('reviews')
        .select('id, user_id, rating, halal_compliance_rating, food_rating, ambiance_rating, service_rating, value_rating, comment, photo_urls, created_at, profiles!user_id(name)')
        .eq('restaurant_id', id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false }));
    }

    // Fetch blocks and filter reviews by blocked users
    let blockedUserIds: string[] = [];
    if (user) {
      const { data: blks } = await supabase
        .from('blocks')
        .select('blocked_id')
        .eq('blocker_id', user.id);
      blockedUserIds = (blks ?? []).map((b: { blocked_id: string }) => b.blocked_id);
      setBlockedIds(blockedUserIds);
    }
    const rawReviews = (rv as unknown as DbReview[]) ?? [];
    setReviews(blockedUserIds.length > 0
      ? rawReviews.filter(r => !blockedUserIds.includes(r.user_id))
      : rawReviews);

    // Menu photos are stored in categorized_photos.menu by admin
    setMenuPhotos(Array.isArray(restaurant.categorized_photos?.menu) ? restaurant.categorized_photos!.menu : []);

    // Fetch community restaurant photos (categorized) — approved only
    const { data: rp } = await supabase
      .from('restaurant_photos')
      .select('url, category')
      .eq('restaurant_id', id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    // Also surface photos attached to approved reviews directly from the reviews
    // data we already have — this works even if the restaurant_photos row is
    // still pending or was never inserted (e.g. review_id column missing).
    const reviewPhotoUrls = rawReviews.flatMap(r => r.photo_urls ?? []);

    // Merge: restaurant_photos (with category) + review photos (default 'food')
    // Deduplicate by URL so a photo that exists in both sources appears once.
    const seen = new Set<string>();
    const merged: { url: string; category: string }[] = [];
    for (const p of (rp ?? [])) {
      if (!seen.has(p.url)) { seen.add(p.url); merged.push(p); }
    }
    for (const url of reviewPhotoUrls) {
      if (!seen.has(url)) { seen.add(url); merged.push({ url, category: 'food' }); }
    }
    setRestaurantPhotos(merged);

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

  const submitReport = async () => {
    if (!reportingReviewId || !reportReason || !user) return;
    setReportSubmitting(true);
    try {
      const { error } = await supabase
        .from('reports')
        .insert({
          reporter_id: user.id,
          content_type: 'review',
          content_id: reportingReviewId,
          reason: reportReason,
          comment: reportComment.trim() || null,
        });
      if (error) throw new Error(error.message);
      setReportingReviewId(null);
      setReportReason(null);
      setReportComment('');
      Alert.alert('Report submitted', "Thanks, we'll review this and take appropriate action.");
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleShare = async () => {
    if (!restaurant) return;
    await Share.share({
      title: restaurant.name,
      message: `${restaurant.name}\n${restaurant.address}\n\nFound on HalalForMe — halalforme://restaurant/${id}`,
    });
  };

  const resetModal = () => {
    setEditingReviewId(null);
    setRating(0); setComplianceRating(0);
    setFoodRating(0); setAmbianceRating(0); setServiceRating(0); setValueRating(0);
    setComment('');
    setReviewPhotos([]);
    setIsAnonymous(false);
  };

  // ── submit / edit review ───────────────────────────────────────
  const submitReview = async () => {
    if (!user) { Alert.alert('Sign in required', 'Please log in to leave a review.'); return; }
    if (rating === 0) { Alert.alert('Rating required', 'Please select a star rating.'); return; }

    setSubmitting(true);
    try {
      const payload = {
        rating,
        halal_compliance_rating: complianceRating || rating,
        food_rating:     foodRating     || null,
        ambiance_rating: ambianceRating || null,
        service_rating:  serviceRating  || null,
        value_rating:    valueRating    || null,
        comment: comment.trim() || null,
        is_anonymous: isAnonymous,
      };

      if (editingReviewId) {
        // Edit existing review
        const { error: upErr } = await supabase
          .from('reviews')
          .update(payload)
          .eq('id', editingReviewId);
        if (upErr) { Alert.alert('Error', upErr.message); return; }
      } else {
        // New review
        const uploadedPhotos = reviewPhotos.length > 0
          ? await Promise.all(
              reviewPhotos.map(async p => ({
                url: await uploadReviewPhoto(p.base64),
                category: p.category,
              }))
            )
          : [];

        const photoUrls = uploadedPhotos.length > 0 ? uploadedPhotos.map(p => p.url) : null;

        const { data: newReview, error: insErr } = await supabase.from('reviews').insert({
          restaurant_id: id,
          user_id: user.id,
          ...payload,
          photo_urls: photoUrls,
          status: 'pending',
        }).select('id').single();

        if (insErr) {
          if (insErr.code === '23505') {
            Alert.alert('Already reviewed', 'You have already submitted a review for this restaurant.');
          } else {
            Alert.alert('Error', insErr.message);
          }
          return;
        }

        // Insert categorized photos into restaurant_photos — start as pending
        if (uploadedPhotos.length > 0 && newReview?.id) {
          await supabase.from('restaurant_photos').insert(
            uploadedPhotos.map(p => ({
              restaurant_id: id,
              user_id: user.id,
              review_id: newReview.id,
              url: p.url,
              category: p.category,
              status: 'pending',
            }))
          );
        }

        // Notify admins (fire and forget)
        supabase.functions.invoke('notify-admin', {
          body: {
            type: 'review',
            title: 'New Review Submitted',
            body: `A review was submitted for "${restaurant?.name}".`,
            link_type: 'review',
            link_id: newReview?.id ?? null,
          },
        }).catch(() => {});
      }

      setModalVisible(false);
      resetModal();
      if (!editingReviewId) {
        Alert.alert(
          'Review submitted',
          'Thank you! Your review is pending approval and will appear once our team has reviewed it.',
          [{ text: 'OK' }]
        );
      }
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  // ── today's hours ─────────────────────────────────────────────
  const todayName = DAYS[new Date().getDay()];

  // ── per-tab photo arrays ──────────────────────────────────────
  const cats = restaurant?.categorized_photos;
  const communityByCategory = {
    food:    restaurantPhotos.filter(p => p.category === 'food').map(p => p.url),
    outside: restaurantPhotos.filter(p => p.category === 'outside').map(p => p.url),
    inside:  restaurantPhotos.filter(p => p.category === 'inside').map(p => p.url),
  };
  // Only fall back to the flat gallery_images array when no categorized photos exist at all
  // (covers older restaurant entries that predate categorization)
  const hasCategorized = !!(cats?.food?.length || cats?.outside?.length || cats?.inside?.length);
  const tabPhotos = {
    outside: [...(cats?.outside ?? []), ...communityByCategory.outside],
    inside:  [...(cats?.inside  ?? []), ...communityByCategory.inside],
    food:    [
      ...(cats?.food ?? []),
      ...(!hasCategorized ? (restaurant?.gallery_images ?? []) : []),
      ...communityByCategory.food,
    ],
    menu:    menuPhotos,
  };

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

  const avgRating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

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
            restaurantPhotos[0]?.url ??
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
            {restaurant.is_verified && (
              <View style={s.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={13} color={GREEN} />
                <Text style={s.verifiedText}>Verified</Text>
              </View>
            )}
          </View>

          <Text style={s.cuisine}>{restaurant.cuisine_type}</Text>

          <View style={s.ratingRow}>
            {avgRating > 0 ? (
              <>
                <Stars value={avgRating} />
                <Text style={s.ratingNum}>{avgRating.toFixed(1)}</Text>
                <Text style={s.reviewCount}>
                  ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="star-outline" size={13} color={TEXT_MUTED} />
                <Text style={s.noRating}>No reviews yet</Text>
              </>
            )}
          </View>

          <CertBadge type={restaurant.primary_certifier} onPress={() => setCertPopupType(restaurant.primary_certifier)} />

          {/* ── trust disclaimer for unverified certifications ── */}
          {restaurant.primary_certifier === 'self_certified' && (
            <View style={s.trustBanner}>
              <Ionicons name="warning-outline" size={16} color={AMBER} style={{ marginTop: 1 }} />
              <Text style={s.trustBannerText}>
                This restaurant has <Text style={s.trustBannerBold}>not been independently verified</Text> by a third-party halal authority. We recommend asking staff directly about their halal sourcing and practices before dining.
              </Text>
            </View>
          )}
          {(restaurant.primary_certifier === 'uncertified' || restaurant.primary_certifier === 'unknown') && (
            <View style={[s.trustBanner, s.trustBannerGrey]}>
              <Ionicons name="information-circle-outline" size={16} color={TEXT_MUTED} style={{ marginTop: 1 }} />
              <Text style={[s.trustBannerText, { color: TEXT_DARK }]}>
                No halal certification information is available for this restaurant. Contact them directly to confirm their halal status before visiting.
              </Text>
            </View>
          )}
        </View>

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

        {/* ── listing completeness bar ── */}
        <ListingCompletenessCard
          hasPhotos={
            restaurantPhotos.length > 0 ||
            !!(restaurant.categorized_photos?.food?.length ||
               restaurant.categorized_photos?.outside?.length ||
               restaurant.categorized_photos?.inside?.length) ||
            !!(restaurant.gallery_images?.length)
          }
          hasReviews={reviews.length > 0}
          onAddPhoto={() => {
            if (!user) { setGuestLoginIntent(true); router.push('/(auth)/login'); return; }
            setPhotoTab('food');
          }}
          onWriteReview={() => {
            if (!user) { setGuestLoginIntent(true); router.push('/(auth)/login'); return; }
            setModalVisible(true);
          }}
        />

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

        {/* ── photo tabs ── */}
        <View style={s.photoTabsSection}>
          {/* Tab bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.photoTabBar}
          >
            {(['outside', 'inside', 'food', 'menu'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[s.photoTab, photoTab === tab && s.photoTabActive]}
                onPress={() => setPhotoTab(tab)}
                activeOpacity={0.75}
              >
                <Text style={[s.photoTabText, photoTab === tab && s.photoTabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tabPhotos[tab].length > 0 ? ` (${tabPhotos[tab].length})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Add button — menu tab only */}
          {/* Grid */}
          {tabPhotos[photoTab].length === 0 ? (
            <View style={s.photoTabEmpty}>
              <Ionicons
                name={photoTab === 'menu' ? 'receipt-outline' : 'images-outline'}
                size={36}
                color={TEXT_MUTED}
              />
              <Text style={s.photoTabEmptyTitle}>
                {photoTab === 'menu' ? 'No menu photos yet' : `No ${photoTab} photos yet`}
              </Text>
            </View>
          ) : (
            <View style={s.photoTabGrid}>
              {tabPhotos[photoTab].map((url, i) => (
                <TouchableOpacity
                  key={i}
                  style={s.photoTabThumbWrap}
                  onPress={() => {
                    setLightboxUrls(tabPhotos[photoTab]);
                    setLightboxIndex(i);
                    setLightboxUrl(url);
                  }}
                  activeOpacity={0.85}
                >
                  <Image
                    source={url}
                    style={s.photoTabThumb}
                    contentFit="cover"
                    placeholder={PLACEHOLDER_BLURHASH}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── reviews ── */}
        <View style={s.reviewsSection}>
          <Text style={s.sectionTitle}>
            Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
          </Text>

          {reviews.length === 0 ? (
            <View style={s.noReviewsBox}>
              <Ionicons name="chatbubble-outline" size={36} color={TEXT_MUTED} />
              <Text style={s.noReviewsText}>No reviews yet. Be the first!</Text>
            </View>
          ) : (
            reviews.map(rv => (
            <ReviewCard
              key={rv.id}
              review={rv}
              onPhotoPress={(url, urls) => {
                setLightboxUrls(urls);
                setLightboxIndex(urls.indexOf(url));
                setLightboxUrl(url);
              }}
              onEdit={user && rv.user_id === user.id ? () => {
                setRating(rv.rating);
                setComplianceRating(rv.halal_compliance_rating);
                setFoodRating(rv.food_rating ?? 0);
                setAmbianceRating(rv.ambiance_rating ?? 0);
                setServiceRating(rv.service_rating ?? 0);
                setValueRating(rv.value_rating ?? 0);
                setComment(rv.comment ?? '');
                setIsAnonymous(rv.is_anonymous ?? false);
                setEditingReviewId(rv.id);
                setModalVisible(true);
              } : undefined}
              onDelete={user && rv.user_id === user.id ? () => {
                Alert.alert('Delete Review', 'Delete your review? This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete', style: 'destructive',
                    onPress: async () => {
                      const { error } = await supabase.from('reviews').delete().eq('id', rv.id);
                      if (error) { Alert.alert('Error', error.message); return; }
                      setReviews(prev => prev.filter(r => r.id !== rv.id));
                    },
                  },
                ]);
              } : undefined}
              onReport={user && rv.user_id !== user.id ? () => {
                setReportingReviewId(rv.id);
                setReportReason(null);
                setReportComment('');
              } : undefined}
              onBlock={user && rv.user_id !== user.id ? () => {
                Alert.alert(
                  'Block User',
                  "You won't see content from this user anymore.",
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Block', style: 'destructive',
                      onPress: async () => {
                        const { error } = await supabase
                          .from('blocks')
                          .insert({ blocker_id: user.id, blocked_id: rv.user_id });
                        if (!error) {
                          setBlockedIds(prev => [...prev, rv.user_id]);
                          setReviews(prev => prev.filter(r => r.user_id !== rv.user_id));
                          Alert.alert('Blocked', 'This user has been blocked. Manage blocked users in Settings → Blocked Users.');
                        } else if (error.code === '23505') {
                          Alert.alert('Already blocked', 'You have already blocked this user.');
                        } else {
                          Alert.alert('Error', error.message);
                        }
                      },
                    },
                  ],
                );
              } : undefined}
            />
          ))
          )}
        </View>

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


      </ScrollView>

      {/* ── floating write-review FAB ── */}
      <View style={[s.fab, { bottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={s.fabBtn}
          onPress={() => {
            if (!user) {
              Alert.alert(
                'Sign in to review',
                'Create a free account to write reviews for halal restaurants.',
                [
                  { text: 'Not now', style: 'cancel' },
                  { text: 'Sign In', onPress: () => { setGuestLoginIntent(true); router.push('/(auth)/login'); } },
                ],
              );
              return;
            }
            setModalVisible(true);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={s.fabText}>Write a Review</Text>
        </TouchableOpacity>
      </View>

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

      {/* ── gallery lightbox ── */}
      <Modal
        visible={!!lightboxUrl}
        animationType="fade"
        transparent
        onRequestClose={closeLightbox}
      >
        <View style={lb.overlay}>
          <TouchableOpacity style={lb.closeBtn} onPress={closeLightbox}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          {/* counter */}
          {lightboxUrls.length > 1 && (
            <Text style={lb.counter}>{lightboxIndex + 1} / {lightboxUrls.length}</Text>
          )}

          <ScrollView
            ref={lightboxScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={e => {
              const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              if (lightboxUrls[i]) {
                setLightboxIndex(i);
                setLightboxUrl(lightboxUrls[i]);
              }
            }}
            onLayout={() => {
              if (lightboxIndex > 0) {
                lightboxScrollRef.current?.scrollTo({ x: lightboxIndex * SCREEN_W, animated: false });
              }
            }}
            style={{ width: SCREEN_W, height: '75%' }}
          >
            {lightboxUrls.map((url, i) => (
              <Image
                key={i}
                source={url}
                style={{ width: SCREEN_W, height: '100%' }}
                contentFit="contain"
              />
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── review modal ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setModalVisible(false); resetModal(); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={m.overlay}>
          <View style={[m.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* handle + close */}
            <View style={m.handle} />
            <TouchableOpacity style={m.closeBtn} onPress={() => { setModalVisible(false); resetModal(); }}>
              <Ionicons name="close" size={18} color={TEXT_MUTED} />
            </TouchableOpacity>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <Text style={m.title}>{editingReviewId ? 'Edit Review' : 'Write a Review'}</Text>
              <Text style={m.restaurantName}>{restaurant.name}</Text>
              {/* overall rating */}
              <Text style={m.label}>Overall Rating *</Text>
              <StarPicker value={rating} onChange={setRating} />

              {/* halal compliance */}
              <Text style={[m.label, { marginTop: 20 }]}>Halal Compliance *</Text>
              <StarPicker value={complianceRating} onChange={setComplianceRating} color={GREEN} />

              <View style={m.divider} />

              {/* category ratings */}
              <Text style={m.categoryHeading}>Category Ratings (optional)</Text>

              <Text style={m.label}>Food Quality</Text>
              <StarPicker value={foodRating} onChange={setFoodRating} />

              <Text style={[m.label, { marginTop: 16 }]}>Ambiance</Text>
              <StarPicker value={ambianceRating} onChange={setAmbianceRating} />

              <Text style={[m.label, { marginTop: 16 }]}>Service</Text>
              <StarPicker value={serviceRating} onChange={setServiceRating} />

              <Text style={[m.label, { marginTop: 16 }]}>Value for Money</Text>
              <StarPicker value={valueRating} onChange={setValueRating} />

              <View style={m.divider} />

              {/* comment */}
              <Text style={m.label}>Comment (optional)</Text>
              <TextInput
                style={m.commentInput}
                placeholder="Share your experience…"
                placeholderTextColor={TEXT_MUTED}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* photos — only for new reviews */}
              {!editingReviewId && (
                <>
                  <Text style={[m.label, { marginTop: 20 }]}>Photos (optional, up to 3)</Text>
                  <Text style={m.photoHint}>Tag each photo so it appears in the right tab</Text>
                  <View style={m.photoList}>
                    {reviewPhotos.map((p, i) => (
                      <View key={i} style={m.photoItem}>
                        <TouchableOpacity
                          onPress={() => setReviewPreviewIndex(i)}
                          activeOpacity={0.8}
                        >
                          <Image source={p.uri} style={m.photoThumb} contentFit="cover" />
                        </TouchableOpacity>
                        <View style={m.photoCategoryRow}>
                          {(['food', 'outside', 'inside'] as const).map(cat => (
                            <TouchableOpacity
                              key={cat}
                              style={[m.photoCatPill, p.category === cat && m.photoCatPillActive]}
                              onPress={() => setReviewPhotos(prev =>
                                prev.map((item, idx) => idx === i ? { ...item, category: cat } : item)
                              )}
                            >
                              <Text style={[m.photoCatText, p.category === cat && m.photoCatTextActive]}>
                                {cat.charAt(0).toUpperCase() + cat.slice(1)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TouchableOpacity
                          style={m.photoRemove}
                          onPress={() => setReviewPhotos(prev => prev.filter((_, idx) => idx !== i))}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="close-circle" size={20} color={RED} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {reviewPhotos.length < 3 && (
                      <TouchableOpacity style={m.photoAdd} onPress={pickReviewPhoto}>
                        <Ionicons name="camera-outline" size={22} color={TEXT_MUTED} />
                        <Text style={m.photoAddText}>Add photo</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}

              {/* anonymous toggle */}
              <View style={m.anonRow}>
                <View style={m.anonLeft}>
                  <Ionicons name="eye-off-outline" size={17} color={TEXT_MUTED} />
                  <View>
                    <Text style={m.anonLabel}>Post anonymously</Text>
                    <Text style={m.anonSub}>Your name won't be shown publicly</Text>
                  </View>
                </View>
                <Switch
                  value={isAnonymous}
                  onValueChange={setIsAnonymous}
                  trackColor={{ false: HAIRLINE, true: GREEN }}
                  thumbColor="#fff"
                />
              </View>

              <TouchableOpacity
                style={[m.submitBtn, submitting && m.submitBtnDisabled]}
                onPress={submitReview}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={m.submitText}>Submit Review</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* ── review photo full-screen preview (inline overlay, avoids nested Modal issues) ── */}
          {reviewPreviewIndex !== null && (
            <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
              <View style={m.previewOverlay} pointerEvents="auto">
                <TouchableOpacity
                  style={lb.closeBtn}
                  onPress={() => setReviewPreviewIndex(null)}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>

                {reviewPhotos.length > 1 && (
                  <Text style={lb.counter}>
                    {reviewPreviewIndex + 1} / {reviewPhotos.length}
                  </Text>
                )}

                <Image
                  source={reviewPhotos[reviewPreviewIndex].uri}
                  style={lb.image}
                  contentFit="contain"
                />

                {reviewPhotos.length > 1 && (
                  <View style={lb.arrows}>
                    <TouchableOpacity
                      style={[lb.arrow, reviewPreviewIndex === 0 && lb.arrowDisabled]}
                      onPress={() => setReviewPreviewIndex(i => i! - 1)}
                      disabled={reviewPreviewIndex === 0}
                    >
                      <Ionicons name="chevron-back" size={28} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[lb.arrow, reviewPreviewIndex === reviewPhotos.length - 1 && lb.arrowDisabled]}
                      onPress={() => setReviewPreviewIndex(i => i! + 1)}
                      disabled={reviewPreviewIndex === reviewPhotos.length - 1}
                    >
                      <Ionicons name="chevron-forward" size={28} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── report modal ── */}
      <Modal
        visible={reportingReviewId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setReportingReviewId(null)}
      >
        <View style={rp.overlay}>
          <View style={rp.sheet}>
            <View style={rp.header}>
              <View style={rp.headerIcon}>
                <Ionicons name="flag-outline" size={20} color={RED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={rp.headerTitle}>Report Content</Text>
                <Text style={rp.headerSub}>Help us keep the community safe</Text>
              </View>
              <TouchableOpacity onPress={() => setReportingReviewId(null)} hitSlop={12}>
                <Ionicons name="close" size={20} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>

            <ScrollView style={rp.rpScroll} contentContainerStyle={{ padding: 20 }}>
              <Text style={rp.reasonLabel}>Reason for report</Text>
              {(['spam', 'inappropriate', 'harassment', 'other'] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[rp.reasonOption, reportReason === r && rp.reasonOptionSelected]}
                  onPress={() => setReportReason(r)}
                >
                  <View style={[rp.radio, reportReason === r && rp.radioSelected]}>
                    {reportReason === r && <View style={rp.radioDot} />}
                  </View>
                  <Text style={[rp.reasonText, reportReason === r && rp.reasonTextSelected]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}

              <Text style={[rp.reasonLabel, { marginTop: 20 }]}>Additional details (optional)</Text>
              <TextInput
                style={rp.commentInput}
                multiline
                numberOfLines={3}
                placeholder="Describe the issue..."
                placeholderTextColor={TEXT_MUTED}
                value={reportComment}
                onChangeText={setReportComment}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[rp.rpSubmitBtn, (!reportReason || reportSubmitting) && rp.rpSubmitBtnDisabled]}
                onPress={submitReport}
                disabled={!reportReason || reportSubmitting}
              >
                {reportSubmitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={rp.rpSubmitText}>Submit Report</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={rp.rpCancelBtn} onPress={() => setReportingReviewId(null)}>
                <Text style={rp.rpCancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
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
  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  ratingNum:    { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  reviewCount:  { fontSize: 13, color: TEXT_MUTED },
  noRating:     { fontSize: 13, color: TEXT_MUTED },

  // trust disclaimer banner
  trustBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fcd34d',
    borderRadius: 10, padding: 12, marginTop: 12,
  },
  trustBannerGrey: {
    backgroundColor: CREAM, borderColor: HAIRLINE,
  },
  trustBannerText: {
    flex: 1, fontSize: 13, color: AMBER, lineHeight: 19,
  },
  trustBannerBold: { fontWeight: '700' },

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

  // community photos
  communitySection: {
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4,
  },

  // reviews
  reviewsSection: { paddingHorizontal: 16, paddingTop: 20 },
  noReviewsBox: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  noReviewsText: { fontSize: 14, color: TEXT_MUTED },

  // FAB
  fab: { position: 'absolute', left: 16, right: 16 },
  fabBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 16,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: DEEP_GREEN, shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // error
  errTitle:  { fontSize: 17, fontWeight: '700', color: RED },
  errDetail: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center' },
  retryBtn:  { marginTop: 8, backgroundColor: DEEP_GREEN, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // photo tabs
  photoTabsSection: {
    backgroundColor: '#fff', marginTop: 12,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: HAIRLINE,
    paddingBottom: 16,
  },
  photoTabBar: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  photoTab: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: HAIRLINE,
    backgroundColor: CREAM,
  },
  photoTabActive: {
    backgroundColor: GREEN, borderColor: GREEN,
  },
  photoTabText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  photoTabTextActive: { color: '#fff' },

  photoTabAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-end', marginRight: 16, marginBottom: 10,
    backgroundColor: '#f0faf6', borderWidth: 1.5, borderColor: '#c3e8d8',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  photoTabAddText: { fontSize: 13, fontWeight: '600', color: GREEN },

  photoTabGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 3,
    paddingHorizontal: 16,
  },
  photoTabThumbWrap: { borderRadius: 8, overflow: 'hidden' },
  photoTabThumb: { width: 108, height: 108, borderRadius: 8 },

  photoTabEmpty: {
    alignItems: 'center', gap: 8,
    paddingVertical: 36, paddingHorizontal: 16,
  },
  photoTabEmptyTitle: { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  photoTabEmptyBtn: {
    marginTop: 4, backgroundColor: DEEP_GREEN,
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
  },
  photoTabEmptyBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

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

const lb = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute', top: 60, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  counter: {
    position: 'absolute', top: 68, alignSelf: 'center',
    fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '600',
  },
  image: { width: '100%', height: '75%' },
  arrows: {
    position: 'absolute', bottom: 60, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20,
  },
  arrow: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.25 },
});

const m = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12,
    maxHeight: '90%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 20,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title:          { fontSize: 20, fontWeight: '800', color: TEXT_DARK, marginBottom: 2 },
  restaurantName: { fontSize: 13, color: TEXT_MUTED, marginBottom: 20 },
  label:          { fontSize: 13, fontWeight: '600', color: TEXT_MUTED, marginBottom: 8 },
  divider:        { height: 1, backgroundColor: HAIRLINE, marginVertical: 20 },
  categoryHeading: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 },
  commentInput: {
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 12,
    padding: 12, fontSize: 14, color: TEXT_DARK, minHeight: 90,
    backgroundColor: CREAM,
  },
  photoHint: { fontSize: 12, color: TEXT_MUTED, marginBottom: 12, marginTop: 2 },
  photoList: { gap: 10, marginBottom: 4 },
  photoItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CREAM, borderRadius: 12,
    padding: 10, borderWidth: 1, borderColor: HAIRLINE,
  },
  photoThumb: { width: 60, height: 60, borderRadius: 8 },
  photoCategoryRow: { flex: 1, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  photoCatPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1.5, borderColor: HAIRLINE, backgroundColor: '#fff',
  },
  photoCatPillActive: { backgroundColor: GREEN, borderColor: GREEN },
  photoCatText:       { fontSize: 12, fontWeight: '600', color: TEXT_MUTED },
  photoCatTextActive: { color: '#fff' },
  photoRemove: { padding: 2 },
  photoAdd: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: HAIRLINE, borderStyle: 'dashed',
    borderRadius: 12, padding: 14, backgroundColor: CREAM,
  },
  photoAddText: { fontSize: 13, color: TEXT_MUTED, fontWeight: '500' },

  anonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 20, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: CREAM, borderRadius: 12,
    borderWidth: 1, borderColor: HAIRLINE,
  },
  anonLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  anonLabel: { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  anonSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },

  submitBtn: {
    marginTop: 16, backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const rp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#fff5f5', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },
  headerSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
  rpScroll:    { flexGrow: 0 },
  reasonLabel: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED, marginBottom: 10 },
  reasonOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: HAIRLINE,
    backgroundColor: CREAM, marginBottom: 8,
  },
  reasonOptionSelected: { borderColor: RED, backgroundColor: '#fff5f5' },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: TEXT_MUTED,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: RED },
  radioDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: RED },
  reasonText:         { fontSize: 14, color: TEXT_DARK, fontWeight: '500' },
  reasonTextSelected: { color: RED, fontWeight: '600' },
  commentInput: {
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 14,
    padding: 14, fontSize: 14, color: TEXT_DARK,
    backgroundColor: CREAM, minHeight: 80, marginBottom: 20,
  },
  rpSubmitBtn: {
    backgroundColor: RED, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginBottom: 10,
  },
  rpSubmitBtnDisabled: { opacity: 0.4 },
  rpSubmitText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  rpCancelBtn:   { alignItems: 'center', paddingVertical: 8 },
  rpCancelText:  { fontSize: 14, color: TEXT_MUTED },
});
