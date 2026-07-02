import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, Alert,
  Modal, Switch, TextInput, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '../lib/supabase';
import { formatError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { setGuestLoginIntent } from '../lib/guestLoginIntent';

const GREEN = '#245737';
const RED   = '#e53e3e';

type ReviewStatus = 'pending' | 'approved' | 'rejected';

interface MyReview {
  id: string;
  rating: number;
  halal_compliance_rating: number;
  food_rating: number | null;
  ambiance_rating: number | null;
  service_rating: number | null;
  value_rating: number | null;
  comment: string | null;
  created_at: string;
  status: ReviewStatus;
  is_anonymous: boolean;
  restaurants: { id: string; name: string; cuisine_type: string; image_url: string | null; categorized_photos: Record<string, string[]> | null } | null;
}

const STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending:  { label: 'Pending Review', color: '#b7791f', bg: '#fefce8', icon: 'time-outline' },
  approved: { label: 'Approved',       color: '#245737', bg: '#e6f9f2', icon: 'checkmark-circle-outline' },
  rejected: { label: 'Rejected',       color: '#e53e3e', bg: '#fff5f5', icon: 'close-circle-outline' },
};

// ── Stars display ──────────────────────────────────────────────────────────────
function Stars({ value, color = '#f6a623' }: { value: number; color?: string }) {
  const full = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <Text style={{ color, fontSize: 13, letterSpacing: -0.5 }}>
      {'★'.repeat(full)}{'☆'.repeat(5 - full)}
    </Text>
  );
}

// ── Star picker row ────────────────────────────────────────────────────────────
function StarPicker({
  label, value, onChange, color = '#f6a623',
}: {
  label: string; value: number; onChange: (v: number) => void; color?: string;
}) {
  return (
    <View style={ep.ratingRow}>
      <Text style={ep.ratingLabel}>{label}</Text>
      <View style={ep.stars}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Ionicons
              name={n <= value ? 'star' : 'star-outline'}
              size={26}
              color={n <= value ? color : '#ddd'}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Review card ────────────────────────────────────────────────────────────────
function ReviewItem({
  review,
  onEdit,
  onDelete,
}: {
  review: MyReview;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const date = new Date(review.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const statusCfg = STATUS_CONFIG[review.status] ?? STATUS_CONFIG.pending;

  return (
    <View style={s.card}>
      {/* Status + anonymous badges */}
      <View style={s.badgeRow}>
        <View style={[s.statusBadge, { backgroundColor: statusCfg.bg }]}>
          <Ionicons name={statusCfg.icon as any} size={12} color={statusCfg.color} />
          <Text style={[s.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
        {review.is_anonymous && (
          <View style={s.anonBadge}>
            <Ionicons name="eye-off-outline" size={12} color="#888" />
            <Text style={s.anonBadgeText}>Anonymous</Text>
          </View>
        )}
      </View>

      <View style={s.cardHeader}>
        {(() => {
          const r = review.restaurants;
          const cp = r?.categorized_photos;
          const thumb = r?.image_url ?? cp?.food?.[0] ?? cp?.outside?.[0] ?? cp?.inside?.[0] ?? null;
          return thumb ? (
            <Image source={thumb} style={s.cardThumb} contentFit="cover" />
          ) : (
            <View style={s.cardIcon}>
              <Ionicons name="restaurant" size={16} color={GREEN} />
            </View>
          );
        })()}
        <View style={s.cardMeta}>
          <Text style={s.restaurantName} numberOfLines={1}>
            {review.restaurants?.name ?? 'Unknown Restaurant'}
          </Text>
          <Text style={s.cuisine}>{review.restaurants?.cuisine_type ?? ''}</Text>
        </View>
        <Text style={s.date}>{date}</Text>
      </View>

      <View style={s.ratingsRow}>
        <View style={s.ratingGroup}>
          <Text style={s.ratingLabel}>Overall</Text>
          <Stars value={review.rating} />
        </View>
        <View style={s.ratingGroup}>
          <Text style={s.ratingLabel}>Halal</Text>
          <Stars value={review.halal_compliance_rating} color={GREEN} />
        </View>
      </View>

      {review.comment ? (
        <Text style={s.comment} numberOfLines={3}>{review.comment}</Text>
      ) : null}

      {review.status === 'rejected' && (
        <View style={s.rejectedNote}>
          <Ionicons name="information-circle-outline" size={13} color={RED} />
          <Text style={s.rejectedNoteText}>
            This review was not approved. You can edit and resubmit it.
          </Text>
        </View>
      )}

      {/* Edit / Delete actions */}
      <View style={s.actions}>
        <TouchableOpacity style={s.editAction} onPress={onEdit} activeOpacity={0.7}>
          <Ionicons name="pencil-outline" size={14} color={GREEN} />
          <Text style={s.editActionText}>
            {review.status === 'rejected' ? 'Edit & Resubmit' : 'Edit'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.deleteAction} onPress={onDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={14} color={RED} />
          <Text style={s.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function MyReviewsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [reviews,      setReviews]      = useState<MyReview[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // Edit modal
  const [editing,       setEditing]       = useState<MyReview | null>(null);
  const [editRating,    setEditRating]    = useState(5);
  const [editHalal,     setEditHalal]     = useState(5);
  const [editFood,      setEditFood]      = useState(0);
  const [editAmbiance,  setEditAmbiance]  = useState(0);
  const [editService,   setEditService]   = useState(0);
  const [editValue,     setEditValue]     = useState(0);
  const [editComment,   setEditComment]   = useState('');
  const [editIsAnonymous, setEditIsAnonymous] = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [editError,       setEditError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('reviews')
      .select('id, rating, halal_compliance_rating, food_rating, ambiance_rating, service_rating, value_rating, comment, created_at, status, is_anonymous, restaurants(id, name, cuisine_type, image_url, categorized_photos)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (err) setError(formatError(err));
    else setReviews((data as unknown as MyReview[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (review: MyReview) => {
    setEditing(review);
    setEditRating(review.rating);
    setEditHalal(review.halal_compliance_rating);
    setEditFood(review.food_rating ?? 0);
    setEditAmbiance(review.ambiance_rating ?? 0);
    setEditService(review.service_rating ?? 0);
    setEditValue(review.value_rating ?? 0);
    setEditComment(review.comment ?? '');
    setEditIsAnonymous(review.is_anonymous ?? false);
    setEditError(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (editRating === 0) { setEditError('Overall rating is required.'); return; }
    if (editHalal === 0)  { setEditError('Halal rating is required.'); return; }

    setSaving(true);
    setEditError(null);
    const { error: err } = await supabase
      .from('reviews')
      .update({
        rating:                  editRating,
        halal_compliance_rating: editHalal,
        food_rating:             editFood    || null,
        ambiance_rating:         editAmbiance || null,
        service_rating:          editService  || null,
        value_rating:            editValue    || null,
        comment:                 editComment.trim() || null,
        is_anonymous:            editIsAnonymous,
        status:                  'pending', // re-submit for approval after any edit
      })
      .eq('id', editing.id);

    setSaving(false);
    if (err) { setEditError(formatError(err)); return; }

    // Update local state — status goes back to pending after edit
    setReviews(prev => prev.map(r =>
      r.id === editing.id
        ? {
            ...r,
            rating: editRating,
            halal_compliance_rating: editHalal,
            food_rating: editFood || null,
            ambiance_rating: editAmbiance || null,
            service_rating: editService || null,
            value_rating: editValue || null,
            comment: editComment.trim() || null,
            is_anonymous: editIsAnonymous,
            status: 'pending',
          }
        : r
    ));
    setEditing(null);
  };

  const handleDelete = (review: MyReview) => {
    Alert.alert(
      'Delete Review',
      `Delete your review for ${review.restaurants?.name ?? 'this restaurant'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error: err } = await supabase
              .from('reviews')
              .delete()
              .eq('id', review.id);
            if (err) { Alert.alert('Error', formatError(err)); return; }
            setReviews(prev => prev.filter(r => r.id !== review.id));
          },
        },
      ]
    );
  };

  const filteredReviews = statusFilter === 'all'
    ? reviews
    : reviews.filter(r => r.status === statusFilter);

  const countByStatus = {
    pending:  reviews.filter(r => r.status === 'pending').length,
    approved: reviews.filter(r => r.status === 'approved').length,
    rejected: reviews.filter(r => r.status === 'rejected').length,
  };

  if (!user) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#111" />
          </TouchableOpacity>
          <Text style={s.title}>My Reviews</Text>
        </View>
        <View style={s.centered}>
          <Ionicons name="star-outline" size={56} color="#ddd" />
          <Text style={s.emptyTitle}>Sign in to see your reviews</Text>
          <Text style={s.emptyText}>Your submitted restaurant reviews will appear here.</Text>
          <TouchableOpacity style={s.signInBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}>
            <Text style={s.signInText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={s.title}>My Reviews</Text>
      </View>

      {/* status filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterRow}
      >
        {([
          { key: 'all',      label: 'All' },
          { key: 'pending',  label: 'Pending',  count: countByStatus.pending },
          { key: 'approved', label: 'Approved', count: countByStatus.approved },
          { key: 'rejected', label: 'Rejected', count: countByStatus.rejected },
        ] as const).map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterPill, statusFilter === f.key && s.filterPillActive]}
            onPress={() => setStatusFilter(f.key)}
            activeOpacity={0.75}
          >
            <Text style={[s.filterPillText, statusFilter === f.key && s.filterPillTextActive]}>
              {f.label}
              {'count' in f && f.count > 0 ? ` (${f.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={36} color="#ddd" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : reviews.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="star-outline" size={56} color="#ddd" />
          <Text style={s.emptyTitle}>No reviews yet</Text>
          <Text style={s.emptyText}>
            Open a restaurant and tap "Write a Review" to get started.
          </Text>
        </View>
      ) : filteredReviews.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="filter-outline" size={48} color="#ddd" />
          <Text style={s.emptyTitle}>No {statusFilter} reviews</Text>
        </View>
      ) : (
        <FlatList
          data={filteredReviews}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ReviewItem
              review={item}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={s.count}>
              {filteredReviews.length} review{filteredReviews.length !== 1 ? 's' : ''}
            </Text>
          }
        />
      )}

      {/* ── Edit Modal ── */}
      <Modal
        visible={!!editing}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={ep.overlay}>
            <View style={[ep.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={ep.handle} />
              <TouchableOpacity style={ep.closeBtn} onPress={() => setEditing(null)}>
                <Ionicons name="close" size={18} color="#999" />
              </TouchableOpacity>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={ep.title}>Edit Review</Text>
                {editing?.restaurants && (
                  <Text style={ep.restaurantName}>{editing.restaurants.name}</Text>
                )}

                <StarPicker label="Overall Rating *" value={editRating} onChange={setEditRating} />
                <StarPicker label="Halal Rating *"   value={editHalal}  onChange={setEditHalal} color={GREEN} />

                <Text style={ep.sectionLabel}>Category Ratings (optional)</Text>
                <StarPicker label="Food"     value={editFood}     onChange={setEditFood} />
                <StarPicker label="Ambiance" value={editAmbiance} onChange={setEditAmbiance} />
                <StarPicker label="Service"  value={editService}  onChange={setEditService} />
                <StarPicker label="Value"    value={editValue}    onChange={setEditValue} />

                <Text style={ep.commentLabel}>Comment</Text>
                <TextInput
                  style={ep.commentInput}
                  value={editComment}
                  onChangeText={setEditComment}
                  placeholder="Share your experience…"
                  placeholderTextColor="#bbb"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                {editError ? (
                  <View style={ep.errorBox}>
                    <Ionicons name="alert-circle-outline" size={14} color={RED} />
                    <Text style={ep.errorText}>{editError}</Text>
                  </View>
                ) : null}

                {/* anonymous toggle */}
                <View style={ep.anonRow}>
                  <View style={ep.anonLeft}>
                    <Ionicons name="eye-off-outline" size={17} color="#555" />
                    <View>
                      <Text style={ep.anonLabel}>Post anonymously</Text>
                      <Text style={ep.anonSub}>Your name won't be shown publicly</Text>
                    </View>
                  </View>
                  <Switch
                    value={editIsAnonymous}
                    onValueChange={setEditIsAnonymous}
                    trackColor={{ false: '#e0e0e0', true: GREEN }}
                    thumbColor="#fff"
                  />
                </View>

                <TouchableOpacity
                  style={[ep.saveBtn, saving && ep.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={ep.saveText}>Save Changes</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f7f7f7' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  errorText: { fontSize: 13, color: '#888', textAlign: 'center' },
  retryBtn: { backgroundColor: GREEN, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#ccc' },
  emptyText: { fontSize: 14, color: '#bbb', textAlign: 'center', lineHeight: 20 },
  signInBtn: { marginTop: 8, backgroundColor: GREEN, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 14 },
  signInText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  filterScroll: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  filterRow:    { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e5e5e5', backgroundColor: '#fafafa',
  },
  filterPillActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterPillText:   { fontSize: 13, fontWeight: '600', color: '#666' },
  filterPillTextActive: { color: '#fff' },

  list: { paddingTop: 8, paddingBottom: 24 },
  count: { fontSize: 13, color: '#999', paddingHorizontal: 16, marginBottom: 8, fontWeight: '500' },

  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 6,
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  anonBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  anonBadgeText: { fontSize: 11, fontWeight: '600', color: '#888' },
  rejectedNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#fff5f5', borderRadius: 10, padding: 10,
    marginTop: 6, marginBottom: 4,
  },
  rejectedNoteText: { flex: 1, fontSize: 12, color: RED, lineHeight: 17 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  cardIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },
  cardThumb: {
    width: 36, height: 36, borderRadius: 10,
  },
  cardMeta: { flex: 1 },
  restaurantName: { fontSize: 15, fontWeight: '700', color: '#111' },
  cuisine: { fontSize: 12, color: '#999', marginTop: 1 },
  date: { fontSize: 11, color: '#bbb' },
  ratingsRow: { flexDirection: 'row', gap: 20, marginBottom: 8 },
  ratingGroup: { gap: 3 },
  ratingLabel: { fontSize: 11, color: '#aaa', fontWeight: '500' },
  comment: { fontSize: 14, color: '#555', lineHeight: 20, marginTop: 4 },

  actions: {
    flexDirection: 'row', gap: 10, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  editAction: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#f0faf6', borderWidth: 1, borderColor: '#c3e8d8',
  },
  editActionText: { fontSize: 13, color: GREEN, fontWeight: '600' },
  deleteAction: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#fca5a5',
  },
  deleteActionText: { fontSize: 13, color: RED, fontWeight: '600' },
});

const ep = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', maxHeight: '90%',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 20,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 4 },
  restaurantName: { fontSize: 14, color: '#888', marginBottom: 20 },

  ratingRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  ratingLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  stars: { flexDirection: 'row', gap: 4 },

  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginTop: 8, marginBottom: 10,
  },

  commentLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
  commentInput: {
    borderWidth: 1.5, borderColor: '#e8e8e8', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#111', minHeight: 90, backgroundColor: '#fafafa',
    textAlignVertical: 'top',
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff5f5', borderRadius: 10, padding: 10,
    marginTop: 12, borderWidth: 1, borderColor: '#fca5a5',
  },
  errorText: { flex: 1, fontSize: 13, color: RED },

  anonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 20, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#f7f7f7', borderRadius: 12,
    borderWidth: 1, borderColor: '#ebebeb',
  },
  anonLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  anonLabel: { fontSize: 14, fontWeight: '600', color: '#222' },
  anonSub:   { fontSize: 12, color: '#999', marginTop: 1 },

  saveBtn: {
    marginTop: 16, marginBottom: 8, backgroundColor: GREEN,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
