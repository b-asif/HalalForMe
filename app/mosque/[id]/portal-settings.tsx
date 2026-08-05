import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Brand } from '../../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

interface Amenities {
  sisters_section?: boolean;
  wudu?: boolean;
  wheelchair?: boolean;
  parking?: boolean;
  kids_area?: boolean;
  halal_food?: boolean;
}

const AMENITY_ROWS: { key: keyof Amenities; label: string; icon: string; desc: string }[] = [
  { key: 'sisters_section', label: "Sisters' Section",   icon: 'people-outline',      desc: 'Dedicated area for women' },
  { key: 'wudu',            label: 'Wudu Facilities',    icon: 'water-outline',        desc: 'Washing facilities on-site' },
  { key: 'wheelchair',      label: 'Wheelchair Access',  icon: 'accessibility-outline',desc: 'Accessible entrance & facilities' },
  { key: 'parking',         label: 'Parking Available',  icon: 'car-outline',          desc: 'On-site or nearby parking' },
  { key: 'kids_area',       label: 'Kids / Nursery Area',icon: 'happy-outline',        desc: 'Space for children and families' },
  { key: 'halal_food',      label: 'Halal Food Nearby',  icon: 'restaurant-outline',   desc: 'Halal restaurants or cafe on-site' },
];

function isValidImageBytes(bytes: Uint8Array): boolean {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true; // JPEG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true; // PNG
  return false;
}

export default function PortalSettingsScreen() {
  const { id: mosqueId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();

  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [uploadingPhoto,setUploadingPhoto] = useState(false);
  const [unauthorized,  setUnauthorized]  = useState(false);

  // Fields
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [description,   setDescription]   = useState('');
  const [contactPhone,  setContactPhone]  = useState('');
  const [contactEmail,  setContactEmail]  = useState('');
  const [website,       setWebsite]       = useState('');
  const [eventsUrl,     setEventsUrl]     = useState('');
  const [amenities,     setAmenities]     = useState<Amenities>({});

  const loadData = useCallback(async () => {
    if (!mosqueId || !user) return;
    setLoading(true);

    const { data: m } = await supabase
      .from('mosques')
      .select('id, owner_id, cover_image_url, description, contact_phone, contact_email, website, events_url, amenities')
      .eq('id', mosqueId)
      .maybeSingle();

    if (!m || (m.owner_id !== user.id && !isAdmin)) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    setCoverImageUrl(m.cover_image_url ?? null);
    setDescription(m.description ?? '');
    setContactPhone(m.contact_phone ?? '');
    setContactEmail(m.contact_email ?? '');
    setWebsite(m.website ?? '');
    setEventsUrl(m.events_url ?? '');
    setAmenities((m.amenities as Amenities) ?? {});
    setLoading(false);
  }, [mosqueId, user, isAdmin]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const pickCoverPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (result.canceled || !result.assets[0].base64) return;

    setUploadingPhoto(true);
    try {
      const base64 = result.assets[0].base64;
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      if (!isValidImageBytes(bytes)) throw new Error('Please choose a JPEG or PNG image.');

      const path = `mosque-covers/${mosqueId}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('gallery_photos')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data } = supabase.storage.from('gallery_photos').getPublicUrl(path);
      // Append timestamp so expo-image treats the new upload as a fresh URL
      const freshUrl = `${data.publicUrl}?t=${Date.now()}`;
      setCoverImageUrl(freshUrl);

      // Save URL immediately — don't wait for the "Save Settings" tap
      await supabase.from('mosques').update({ cover_image_url: freshUrl }).eq('id', mosqueId);
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removeCoverPhoto = () => {
    Alert.alert('Remove Photo', 'Remove the cover photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await supabase.from('mosques').update({ cover_image_url: null }).eq('id', mosqueId);
          setCoverImageUrl(null);
        },
      },
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('mosques')
        .update({
          description:   description.trim() || null,
          contact_phone: contactPhone.trim() || null,
          contact_email: contactEmail.trim() || null,
          website:       website.trim() || null,
          events_url:    eventsUrl.trim() || null,
          amenities,
        })
        .eq('id', mosqueId);
      if (error) throw new Error(error.message);
      Alert.alert('Saved', 'Page settings updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAmenity = (key: keyof Amenities) =>
    setAmenities(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} />
        <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
      </SafeAreaView>
    );
  }

  if (unauthorized) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} />
        <View style={s.centered}>
          <Ionicons name="lock-closed-outline" size={40} color={TEXT_MUTED} />
          <Text style={s.unauthorizedText}>You don't manage this mosque's page.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <Header router={router} />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 48 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Cover Photo ─────────────────────────────── */}
          <Text style={s.sectionLabel}>COVER PHOTO</Text>
          <Text style={s.sectionHint}>This photo appears at the top of your mosque's public page.</Text>

          {coverImageUrl ? (
            <View style={s.photoContainer}>
              <Image source={{ uri: coverImageUrl }} style={s.coverPhoto} contentFit="cover" />
              <View style={s.photoActions}>
                <TouchableOpacity
                  style={[s.photoBtn, uploadingPhoto && s.btnDisabled]}
                  onPress={pickCoverPhoto}
                  disabled={uploadingPhoto}
                  activeOpacity={0.85}
                >
                  {uploadingPhoto
                    ? <ActivityIndicator size="small" color={DEEP_GREEN} />
                    : <><Ionicons name="camera-outline" size={15} color={DEEP_GREEN} /><Text style={s.photoBtnText}>Change Photo</Text></>}
                </TouchableOpacity>
                <TouchableOpacity style={s.photoRemoveBtn} onPress={removeCoverPhoto} activeOpacity={0.85}>
                  <Text style={s.photoRemoveBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.photoPlaceholder, uploadingPhoto && s.btnDisabled]}
              onPress={pickCoverPhoto}
              disabled={uploadingPhoto}
              activeOpacity={0.85}
            >
              {uploadingPhoto ? (
                <>
                  <ActivityIndicator size="large" color={TEXT_MUTED} />
                  <Text style={s.photoPlaceholderText}>Uploading…</Text>
                </>
              ) : (
                <>
                  <View style={s.photoPlaceholderIcon}>
                    <Ionicons name="camera-outline" size={28} color={TEXT_MUTED} />
                  </View>
                  <Text style={s.photoPlaceholderTitle}>Add Cover Photo</Text>
                  <Text style={s.photoPlaceholderText}>Recommended: 1600 × 900px</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ── Description ─────────────────────────────── */}
          <Text style={[s.sectionLabel, { marginTop: 28 }]}>ABOUT</Text>
          <TextInput
            style={[s.input, s.textarea]}
            placeholder="A short description of your mosque and community…"
            placeholderTextColor={TEXT_MUTED}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          {/* ── Contact Info ─────────────────────────────── */}
          <Text style={[s.sectionLabel, { marginTop: 8 }]}>CONTACT INFO</Text>
          <View style={s.card}>
            <View style={s.contactRow}>
              <Ionicons name="call-outline" size={18} color={TEXT_MUTED} />
              <TextInput
                style={s.contactInput}
                placeholder="Phone number"
                placeholderTextColor={TEXT_MUTED}
                value={contactPhone}
                onChangeText={setContactPhone}
                keyboardType="phone-pad"
              />
            </View>
            <View style={s.contactDivider} />
            <View style={s.contactRow}>
              <Ionicons name="mail-outline" size={18} color={TEXT_MUTED} />
              <TextInput
                style={s.contactInput}
                placeholder="Email address"
                placeholderTextColor={TEXT_MUTED}
                value={contactEmail}
                onChangeText={setContactEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <View style={s.contactDivider} />
            <View style={s.contactRow}>
              <Ionicons name="globe-outline" size={18} color={TEXT_MUTED} />
              <TextInput
                style={s.contactInput}
                placeholder="Website URL"
                placeholderTextColor={TEXT_MUTED}
                value={website}
                onChangeText={setWebsite}
                autoCapitalize="none"
              />
            </View>
          </View>

          <Text style={s.fieldLabel}>Events / Programs Link (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. https://tockify.com/yourmasjid/agenda"
            placeholderTextColor={TEXT_MUTED}
            value={eventsUrl}
            onChangeText={setEventsUrl}
            autoCapitalize="none"
          />
          <Text style={s.fieldHint}>Used to automatically import events. Leave blank to add events manually.</Text>

          {/* ── Amenities ─────────────────────────────────── */}
          <Text style={[s.sectionLabel, { marginTop: 28 }]}>FACILITIES & ACCESSIBILITY</Text>
          <Text style={s.sectionHint}>Help visitors know what to expect before they arrive.</Text>
          <View style={s.amenitiesCard}>
            {AMENITY_ROWS.map((row, i) => (
              <View key={row.key}>
                {i > 0 && <View style={s.amenityDivider} />}
                <View style={s.amenityRow}>
                  <View style={s.amenityIconWrap}>
                    <Ionicons name={row.icon as any} size={20} color={amenities[row.key] ? DEEP_GREEN : TEXT_MUTED} />
                  </View>
                  <View style={s.amenityText}>
                    <Text style={[s.amenityLabel, amenities[row.key] && s.amenityLabelActive]}>
                      {row.label}
                    </Text>
                    <Text style={s.amenityDesc}>{row.desc}</Text>
                  </View>
                  <Switch
                    value={!!amenities[row.key]}
                    onValueChange={() => toggleAmenity(row.key)}
                    trackColor={{ false: '#e0e0e0', true: GREEN }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            ))}
          </View>

          {/* ── Save ─────────────────────────────────────── */}
          <TouchableOpacity
            style={[s.saveBtn, saving && s.btnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveBtnText}>Save Settings</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Page Settings</Text>
      <View style={{ width: 38 }} />
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  unauthorizedText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE, backgroundColor: '#fff',
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: TEXT_DARK, textAlign: 'center', marginHorizontal: 8 },

  content: { padding: 20 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: TEXT_MUTED, letterSpacing: 0.8, marginBottom: 8 },
  sectionHint:  { fontSize: 13, color: TEXT_MUTED, marginBottom: 14, lineHeight: 18, marginTop: -4 },
  fieldLabel:   { fontSize: 12, fontWeight: '600', color: TEXT_MUTED, marginBottom: 6, marginTop: 14 },
  fieldHint:    { fontSize: 12, color: TEXT_MUTED, marginBottom: 6, marginTop: -4, lineHeight: 17 },

  // Cover photo
  photoContainer: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#f0f0f0' },
  coverPhoto: { width: '100%', aspectRatio: 16 / 9 },
  photoActions: {
    flexDirection: 'row', gap: 10, padding: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  photoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: DEEP_GREEN, borderRadius: 10, paddingVertical: 10,
  },
  photoBtnText: { fontSize: 13, fontWeight: '700', color: DEEP_GREEN },
  photoRemoveBtn: {
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center',
  },
  photoRemoveBtnText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },

  photoPlaceholder: {
    aspectRatio: 16 / 9, borderRadius: 16,
    backgroundColor: '#f5f5f5',
    borderWidth: 2, borderColor: HAIRLINE, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  photoPlaceholderIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#ebebeb', alignItems: 'center', justifyContent: 'center',
  },
  photoPlaceholderTitle: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  photoPlaceholderText:  { fontSize: 12, color: TEXT_MUTED },

  // Input
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: TEXT_DARK,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top', marginBottom: 0 },

  // Contact card
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: 'hidden', marginBottom: 0,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  contactInput: { flex: 1, fontSize: 14, color: TEXT_DARK },
  contactDivider: { height: 1, backgroundColor: HAIRLINE, marginLeft: 46 },

  // Amenities
  amenitiesCard: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: 'hidden',
  },
  amenityRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  amenityDivider: { height: 1, backgroundColor: HAIRLINE, marginLeft: 64 },
  amenityIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  amenityText: { flex: 1 },
  amenityLabel: { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  amenityLabelActive: { color: DEEP_GREEN },
  amenityDesc: { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },

  // Save
  saveBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 28,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.65 },
});
