import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isValidImageBytes } from '../lib/validateImageBytes';
import { setGuestLoginIntent } from '../lib/guestLoginIntent';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const RED   = Brand.red;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const MAX_GALLERY = 4;

type FocusField = 'name' | 'address' | 'cuisine' | 'phone' | 'website' | 'notes' | null;
type GalleryPhoto = { uri: string; base64: string };

export default function SubmitRestaurantScreen() {
  const router   = useRouter();
  const { user } = useAuth();

  // ── Form state ────────────────────────────────────────────────────────────
  const [name,    setName]    = useState('');
  const [address, setAddress] = useState('');
  const [lat,     setLat]     = useState<number | null>(null);
  const [lng,     setLng]     = useState<number | null>(null);
  const [cuisine, setCuisine] = useState('');
  const [phone,   setPhone]   = useState('');
  const [website, setWebsite] = useState('');
  const [notes,   setNotes]   = useState('');
  const [photoUri,    setPhotoUri]    = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [foodPhotos,       setFoodPhotos]       = useState<GalleryPhoto[]>([]);
  const [restaurantPhotos, setRestaurantPhotos] = useState<GalleryPhoto[]>([]);
  const [focused, setFocused]  = useState<FocusField>(null);
  const [error,   setError]    = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Refs for sequential focus ─────────────────────────────────────────────
  const addressRef = useRef<TextInput>(null);
  const cuisineRef = useRef<TextInput>(null);
  const phoneRef   = useRef<TextInput>(null);
  const websiteRef = useRef<TextInput>(null);
  const notesRef   = useRef<TextInput>(null);

  // ── Cert photo picker ─────────────────────────────────────────────────────
  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('Photo library access is required to upload a certification photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 ?? null);
      setError(null);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setError('Camera access is required to take a photo of the certificate.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 ?? null);
      setError(null);
    }
  };

  // ── Gallery photo picker ──────────────────────────────────────────────────
  const pickGalleryPhotos = async (type: 'food' | 'restaurant') => {
    const existing = type === 'food' ? foodPhotos : restaurantPhotos;
    const remaining = MAX_GALLERY - existing.length;
    if (remaining <= 0) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled) {
      const newPhotos: GalleryPhoto[] = result.assets
        .filter(a => a.base64)
        .map(a => ({ uri: a.uri, base64: a.base64! }));
      if (type === 'food') {
        setFoodPhotos(prev => [...prev, ...newPhotos].slice(0, MAX_GALLERY));
      } else {
        setRestaurantPhotos(prev => [...prev, ...newPhotos].slice(0, MAX_GALLERY));
      }
    }
  };

  const removeGalleryPhoto = (type: 'food' | 'restaurant', index: number) => {
    if (type === 'food') {
      setFoodPhotos(prev => prev.filter((_, i) => i !== index));
    } else {
      setRestaurantPhotos(prev => prev.filter((_, i) => i !== index));
    }
  };

  // ── Upload helpers ────────────────────────────────────────────────────────
  const uploadPhoto = async (base64Data: string): Promise<string> => {
    if (base64Data.length > 6_700_000) throw new Error('Certification photo is too large. Please choose an image under 5 MB.');
    const fileName  = `${user!.id}/${Crypto.randomUUID()}.jpg`;
    const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    if (!isValidImageBytes(byteArray)) throw new Error('Invalid image file.');

    const { error: uploadError } = await supabase.storage
      .from('halal_certificates')
      .upload(fileName, byteArray, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage
      .from('halal_certificates')
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  const uploadGalleryPhoto = async (base64Data: string, type: 'food' | 'restaurant'): Promise<string> => {
    if (base64Data.length > 6_700_000) throw new Error('A gallery photo is too large. Please choose images under 5 MB.');
    const fileName  = `${user!.id}/${type}/${Crypto.randomUUID()}.jpg`;
    const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    if (!isValidImageBytes(byteArray)) throw new Error('Invalid image file.');

    const { error: uploadError } = await supabase.storage
      .from('gallery_photos')
      .upload(fileName, byteArray, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage
      .from('gallery_photos')
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError(null);

    if (!name.trim())             { setError('Restaurant name is required.'); return; }
    if (name.trim().length > 100) { setError('Restaurant name must be under 100 characters.'); return; }
    if (!address.trim())          { setError('Address is required.'); return; }
    if (address.trim().length > 300) { setError('Address must be under 300 characters.'); return; }
    if (cuisine.trim().length > 80)  { setError('Cuisine type must be under 80 characters.'); return; }
    if (phone.trim().length > 30)    { setError('Phone number must be under 30 characters.'); return; }
    if (website.trim().length > 255) { setError('Website must be under 255 characters.'); return; }
    if (notes.trim().length > 500)   { setError('Notes must be under 500 characters.'); return; }
    if (lat === null || lng === null) { setError('Please select an address from the suggestions to confirm the location.'); return; }
    if (!photoBase64)             { setError('A photo of the halal certification is required.'); return; }

    setSubmitting(true);
    try {
      // Rate limit: max 3 submissions per rolling 24-hour window.
      // Checked here (before photo uploads) so we don't waste bandwidth
      // uploading files only to be blocked at the DB insert.
      // The RLS policy enforces the same limit server-side as a backstop.
      const { count: recentCount } = await supabase
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if ((recentCount ?? 0) >= 3) {
        throw new Error('You\'ve reached the limit of 3 submissions in 24 hours. Thank you for contributing — please try again tomorrow.');
      }

      const certUrl = await uploadPhoto(photoBase64);

      const foodPhotoUrls = foodPhotos.length > 0
        ? await Promise.all(foodPhotos.map(p => uploadGalleryPhoto(p.base64, 'food')))
        : null;

      const restaurantPhotoUrls = restaurantPhotos.length > 0
        ? await Promise.all(restaurantPhotos.map(p => uploadGalleryPhoto(p.base64, 'restaurant')))
        : null;

      const payload: Record<string, any> = {
        user_id:                   user!.id,
        name:                      name.trim(),
        address:                   address.trim(),
        lat:                       lat,
        lng:                       lng,
        cuisine_type:              cuisine.trim() || null,
        phone:                     phone.trim()   || null,
        website:                   website.trim() || null,
        certification_photo_url:   certUrl,
        notes:                     notes.trim()   || null,
        food_photo_urls:           foodPhotoUrls,
        restaurant_photo_urls:     restaurantPhotoUrls,
        status:                    'pending',
      };

      let { data: insertedSubmission, error: insertError } = await supabase
        .from('submissions').insert(payload).select('id').single();

      // Retry without lat/lng if those columns don't exist yet in the schema
      if (insertError?.message?.includes('lat') || insertError?.message?.includes('lng') || insertError?.message?.includes('schema cache')) {
        const { lat: _lat, lng: _lng, ...payloadWithoutCoords } = payload;
        ({ data: insertedSubmission, error: insertError } = await supabase
          .from('submissions').insert(payloadWithoutCoords).select('id').single());
      }

      if (insertError) throw new Error(insertError.message);

      // Notify admins (fire and forget — don't block on this)
      supabase.functions.invoke('notify-admin', {
        body: {
          type: 'submission',
          link_id: insertedSubmission?.id ?? null,
        },
      }).catch((err: unknown) => console.warn('notify-admin failed:', err));

      router.replace('/my-submissions');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
          <Text style={s.title}>Submit a Restaurant</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.guestWrap}>
          <Ionicons name="storefront-outline" size={56} color={TEXT_MUTED} />
          <Text style={s.guestTitle}>Sign in to add a restaurant</Text>
          <Text style={s.guestSub}>Create a free account to submit halal restaurants for the community.</Text>
          <TouchableOpacity style={s.guestBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}>
            <Text style={s.guestBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title}>Submit a Restaurant</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={s.flex}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.intro}>
            Know a halal restaurant? Submit it and we'll review your certification
            photo before publishing it for the community.
          </Text>

          {/* Error banner */}
          {error && (
            <View style={s.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={RED} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* ── Certification photo ────────────────────────────────────── */}
          <Text style={s.sectionLabel}>Halal Certification Photo *</Text>

          {photoUri ? (
            <View style={s.photoPreviewWrap}>
              <Image
                source={photoUri}
                style={s.photoPreview}
                contentFit="cover"
              />
              <TouchableOpacity style={s.changePhotoBtn} onPress={pickPhoto}>
                <Ionicons name="pencil" size={14} color="#fff" />
                <Text style={s.changePhotoText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.photoPickerRow}>
              <TouchableOpacity style={s.photoPickerBox} onPress={pickPhoto}>
                <Ionicons name="image-outline" size={28} color={TEXT_MUTED} />
                <Text style={s.photoPickerLabel}>Choose from Library</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.photoPickerBox} onPress={takePhoto}>
                <Ionicons name="camera-outline" size={28} color={TEXT_MUTED} />
                <Text style={s.photoPickerLabel}>Take Photo</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Food photos ───────────────────────────────────────────── */}
          <Text style={s.sectionLabel}>
            Food Photos
            <Text style={s.optionalTag}> (optional, up to {MAX_GALLERY})</Text>
          </Text>
          <GalleryPicker
            photos={foodPhotos}
            onAdd={() => pickGalleryPhotos('food')}
            onRemove={(i) => removeGalleryPhoto('food', i)}
          />

          {/* ── Restaurant photos ─────────────────────────────────────── */}
          <Text style={s.sectionLabel}>
            Restaurant Photos
            <Text style={s.optionalTag}> (optional, up to {MAX_GALLERY})</Text>
          </Text>
          <GalleryPicker
            photos={restaurantPhotos}
            onAdd={() => pickGalleryPhotos('restaurant')}
            onRemove={(i) => removeGalleryPhoto('restaurant', i)}
          />

          {/* ── Required fields ───────────────────────────────────────── */}
          <Text style={s.sectionLabel}>Restaurant Details</Text>

          <Field label="Restaurant Name *" focused={focused === 'name'}>
            <TextInput
              style={s.input}
              placeholder="e.g. Al-Madina Grill"
              placeholderTextColor={TEXT_MUTED}
              value={name}
              onChangeText={v => { setName(v); setError(null); }}
              onFocus={() => setFocused('name')}
              onBlur={() => setFocused(null)}
              maxLength={100}
              returnKeyType="next"
              onSubmitEditing={() => addressRef.current?.focus()}
            />
          </Field>

          <View style={s.addressWrap}>
            <Text style={s.fieldLabel}>ADDRESS *</Text>
            <AddressAutocomplete
              inputRef={addressRef}
              value={address}
              onChangeText={v => { setAddress(v); setLat(null); setLng(null); setError(null); }}
              onSelect={s => { setAddress(s.displayName); setLat(s.lat); setLng(s.lng); }}
              focused={focused === 'address'}
              onFocus={() => setFocused('address')}
              onBlur={() => setFocused(null)}
              returnKeyType="next"
              onSubmitEditing={() => cuisineRef.current?.focus()}
              placeholder="e.g. 123 Main St, Chicago, IL"
            />
          </View>

          {/* ── Optional fields ───────────────────────────────────────── */}
          <Text style={s.sectionLabel}>Optional Info</Text>

          <Field label="Cuisine Type" focused={focused === 'cuisine'}>
            <TextInput
              ref={cuisineRef}
              style={s.input}
              placeholder="e.g. Pakistani, Turkish, Lebanese"
              placeholderTextColor={TEXT_MUTED}
              value={cuisine}
              onChangeText={setCuisine}
              onFocus={() => setFocused('cuisine')}
              onBlur={() => setFocused(null)}
              maxLength={80}
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
          </Field>

          <Field label="Phone" focused={focused === 'phone'}>
            <TextInput
              ref={phoneRef}
              style={s.input}
              placeholder="e.g. (408) 555-0123"
              placeholderTextColor={TEXT_MUTED}
              value={phone}
              onChangeText={setPhone}
              onFocus={() => setFocused('phone')}
              onBlur={() => setFocused(null)}
              maxLength={30}
              keyboardType="phone-pad"
              returnKeyType="next"
              onSubmitEditing={() => websiteRef.current?.focus()}
            />
          </Field>

          <Field label="Website" focused={focused === 'website'}>
            <TextInput
              ref={websiteRef}
              style={s.input}
              placeholder="e.g. https://restaurant.com"
              placeholderTextColor={TEXT_MUTED}
              value={website}
              onChangeText={setWebsite}
              onFocus={() => setFocused('website')}
              onBlur={() => setFocused(null)}
              maxLength={255}
              keyboardType="url"
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => notesRef.current?.focus()}
            />
          </Field>

          <Field label="Additional Notes" focused={focused === 'notes'}>
            <TextInput
              ref={notesRef}
              style={[s.input, s.textArea]}
              placeholder="e.g. Zabiha only, owner showed certificate on request"
              placeholderTextColor={TEXT_MUTED}
              value={notes}
              onChangeText={setNotes}
              onFocus={() => setFocused('notes')}
              onBlur={() => setFocused(null)}
              maxLength={500}
              multiline
              numberOfLines={3}
              returnKeyType="done"
            />
          </Field>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={s.submitText}>Submit for Review</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={s.disclaimer}>
            We'll review your submission within a few days. You can track
            progress under Profile → My Submissions.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Gallery Picker component ───────────────────────────────────────────────────

function GalleryPicker({
  photos,
  onAdd,
  onRemove,
}: {
  photos: GalleryPhoto[];
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <View style={s.galleryWrap}>
      <FlatList
        data={photos}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <View style={s.galleryThumbWrap}>
            <Image source={item.uri} style={s.galleryThumb} contentFit="cover" />
            <TouchableOpacity
              style={s.galleryRemoveBtn}
              onPress={() => onRemove(index)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Ionicons name="close-circle" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          photos.length < MAX_GALLERY ? (
            <TouchableOpacity style={s.galleryAddBtn} onPress={onAdd}>
              <Ionicons name="add" size={28} color={TEXT_MUTED} />
              <Text style={s.galleryAddLabel}>Add</Text>
            </TouchableOpacity>
          ) : null
        }
        contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
        style={{ marginBottom: 20 }}
        scrollEnabled={photos.length > 2}
      />
      {photos.length === 0 && (
        <TouchableOpacity style={s.galleryEmptyBtn} onPress={onAdd}>
          <Ionicons name="images-outline" size={24} color={TEXT_MUTED} />
          <Text style={s.galleryAddLabel}>Tap to add photos</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, focused, children }: {
  label: string; focused: boolean; children: React.ReactNode;
}) {
  return (
    <View style={[s.fieldWrap, focused && s.fieldWrapFocused]}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },

  guestWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  guestTitle: { fontSize: 18, fontWeight: '700', color: TEXT_MUTED, textAlign: 'center' },
  guestSub:   { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  guestBtn:   { marginTop: 8, backgroundColor: DEEP_GREEN, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 14 },
  guestBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CREAM, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE, gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },

  content: { padding: 20, paddingBottom: 48 },

  intro: {
    fontSize: 14, color: TEXT_MUTED, lineHeight: 20,
    marginBottom: 20,
  },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff5f5', borderRadius: 10,
    borderWidth: 1, borderColor: '#fca5a5',
    padding: 12, marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: RED, lineHeight: 18 },

  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: TEXT_DARK,
    marginTop: 8, marginBottom: 10, letterSpacing: 0.2,
  },
  optionalTag: { fontSize: 12, fontWeight: '400', color: TEXT_MUTED },

  // Cert photo
  photoPickerRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  photoPickerBox: {
    flex: 1, height: 110, borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE, borderStyle: 'dashed',
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  photoPickerLabel: { fontSize: 12, color: TEXT_MUTED, textAlign: 'center' },

  photoPreviewWrap: { marginBottom: 20, borderRadius: 14, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 180 },
  changePhotoBtn: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  changePhotoText: { fontSize: 12, color: '#fff', fontWeight: '600' },

  // Gallery
  galleryWrap: { marginBottom: 0 },
  galleryThumbWrap: { position: 'relative' },
  galleryThumb: { width: 90, height: 90, borderRadius: 12 },
  galleryRemoveBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
  },
  galleryAddBtn: {
    width: 90, height: 90, borderRadius: 12,
    borderWidth: 1.5, borderColor: HAIRLINE, borderStyle: 'dashed',
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  galleryEmptyBtn: {
    height: 90, borderRadius: 14, marginBottom: 20,
    borderWidth: 1.5, borderColor: HAIRLINE, borderStyle: 'dashed',
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  galleryAddLabel: { fontSize: 12, color: TEXT_MUTED },

  // Fields
  addressWrap: {
    marginBottom: 12,
  },
  fieldWrap: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
    marginBottom: 12,
  },
  fieldWrapFocused: { borderColor: GREEN, backgroundColor: '#fff' },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: TEXT_MUTED, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { fontSize: 15, color: TEXT_DARK, paddingVertical: 6, minHeight: 36 },
  textArea: { minHeight: 72, textAlignVertical: 'top' },

  // Submit
  submitBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, marginTop: 8, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  disclaimer: {
    fontSize: 12, color: TEXT_MUTED, textAlign: 'center', lineHeight: 17,
  },
});
