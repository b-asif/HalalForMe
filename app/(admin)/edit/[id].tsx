import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator,
  Alert, Modal, FlatList, Switch, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../lib/supabase';
import { formatError } from '../../../lib/errors';
import { isValidImageBytes } from '../../../lib/validateImageBytes';
import AddressAutocomplete from '../../../components/AddressAutocomplete';
import { CERTIFIERS, Certifier } from '../../../lib/certifiers';
import { Brand } from '../../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const CREAM      = Brand.cream;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const AMBER      = Brand.amber;
const RED        = Brand.red;
const GOLD       = Brand.gold;

type Category = 'food' | 'outside' | 'inside' | 'menu';
const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'food',    label: 'Food Photos',     icon: 'fast-food-outline'   },
  { key: 'outside', label: 'Outside Photos',  icon: 'business-outline'    },
  { key: 'inside',  label: 'Interior Photos', icon: 'home-outline'        },
  { key: 'menu',    label: 'Menu Photos',     icon: 'receipt-outline'     },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Every 30 min across the full 24-hour day: 00:00 → 23:30
const TIME_SLOTS: string[] = [];
for (let h = 0; h <= 23; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

function fmt(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

type TimeRange = { open: string; close: string };
type DaySchedule = TimeRange[];
type WeekHours = Record<string, DaySchedule>;

const emptyWeek = (): WeekHours => Object.fromEntries(DAYS.map(d => [d, []]));

function hoursToWeek(raw: any): WeekHours {
  const week = emptyWeek();
  if (!raw) return week;
  for (const day of DAYS) {
    const val = raw[day];
    if (!val) continue;
    week[day] = Array.isArray(val) ? val : [val];
  }
  return week;
}

type ListingCategory = 'restaurant' | 'grocery' | 'butcher' | 'cafe';
const LISTING_CATEGORIES: { key: 'restaurant' | 'grocery' | 'cafe'; label: string }[] = [
  { key: 'restaurant', label: 'Restaurant'      },
  { key: 'grocery',    label: 'Grocery/Butcher' },
  { key: 'cafe',       label: 'Cafe'            },
];
// cuisine_type is repurposed as a looser "specialty" label for non-restaurant
// categories (e.g. "Halal Butcher") — same free-text column, different copy.
const CUISINE_FIELD_META: Record<ListingCategory, { label: string; placeholder: string }> = {
  restaurant: { label: 'CUISINE TYPE', placeholder: 'e.g. Pakistani, Middle Eastern'     },
  grocery:    { label: 'SPECIALTY',    placeholder: 'e.g. Halal Butcher, Middle Eastern' },
  butcher:    { label: 'SPECIALTY',    placeholder: 'e.g. Halal Butcher, Middle Eastern' },
  cafe:       { label: 'TYPE',         placeholder: 'e.g. Coffee Shop, Desserts, Boba'   },
};

interface Restaurant {
  id: string;
  name: string;
  address: string;
  cuisine_type: string;
  category: ListingCategory;
  primary_certifier: string;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  opening_hours: any;
  image_url: string | null;
  categorized_photos: Partial<Record<Category, string[]>> | null;
  owner_id: string | null;
}

type NewPhoto = { uri: string; base64: string };
const emptyGallery = (): Record<Category, string[]> => ({ food: [], outside: [], inside: [], menu: [] });
const emptyNew     = (): Record<Category, NewPhoto[]> => ({ food: [], outside: [], inside: [], menu: [] });

export default function AdminEditScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isNew   = id === 'new';

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  const [name,       setName]       = useState('');
  const [address,   setAddress]   = useState('');
  const [cuisine,   setCuisine]   = useState('');
  const [category,  setCategory]  = useState<ListingCategory>('restaurant');
  const [certifiers, setCertifiers] = useState<Certifier[]>(['unknown']);
  const [phone,     setPhone]     = useState('');
  const [website,   setWebsite]   = useState('');
  const [lat,       setLat]       = useState('');
  const [lng,       setLng]       = useState('');
  const [weekHours, setWeekHours] = useState<WeekHours>(emptyWeek());

  const [zabihahStatus, setZabihahStatus] = useState<'full' | 'partial' | null>(null);
  const [zabihahNotes,  setZabihahNotes]  = useState('');
  const [hasPrayerRoom, setHasPrayerRoom] = useState(false);

  const [timePicker,       setTimePicker]       = useState<{ day: string; rangeIndex: number; field: 'open' | 'close' } | null>(null);
  const [sameEveryDay,    setSameEveryDay]    = useState(false);
  const [templateRanges,  setTemplateRanges]  = useState<TimeRange[]>([{ open: '09:00', close: '22:00' }]);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [newImage,         setNewImage]         = useState<NewPhoto | null>(null);

  // Gallery photos — existing URLs and new picks pending upload
  const [galleryPhotos, setGalleryPhotos] = useState<Record<Category, string[]>>(emptyGallery());
  const [newPhotos,     setNewPhotos]     = useState<Record<Category, NewPhoto[]>>(emptyNew());
  const [lightboxUrl,   setLightboxUrl]   = useState<string | null>(null);


  const load = useCallback(async () => {
    if (!id) return;
    if (isNew) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, name, address, cuisine_type, category, primary_certifier, certifiers, phone, website, lat, lng, opening_hours, image_url, categorized_photos, zabihah_status, zabihah_notes, has_prayer_room, owner_id')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('[admin/edit] load error:', error);
      Alert.alert('Error', 'Restaurant not found');
      router.back();
      return;
    }
    const r = data as Restaurant;
    setRestaurant(r);
    setName(r.name);
    setAddress(r.address);
    setCuisine(r.cuisine_type ?? '');
    // Normalize legacy 'butcher' → 'grocery' (now a single combined category in the UI)
    setCategory(r.category === 'butcher' ? 'grocery' : (r.category ?? 'restaurant'));
    // Load existing certifiers array; fall back to primary_certifier
    const existing = Array.isArray((r as any).certifiers) && (r as any).certifiers.length > 0
      ? ((r as any).certifiers as string[]).filter(c => CERTIFIERS.includes(c as Certifier)) as Certifier[]
      : [((CERTIFIERS.includes(r.primary_certifier as Certifier) ? r.primary_certifier : 'unknown') as Certifier)];
    setCertifiers(existing);
    setPhone(r.phone ?? '');
    setWebsite(r.website ?? '');
    setLat(r.lat != null ? String(r.lat) : '');
    setLng(r.lng != null ? String(r.lng) : '');
    const week = hoursToWeek(r.opening_hours);
    setWeekHours(week);
    // Auto-detect: if all 7 days are open with the same schedule, pre-enable the toggle
    const allOpen = DAYS.every(d => week[d].length > 0);
    if (allOpen) {
      const first = JSON.stringify(week[DAYS[0]]);
      if (DAYS.every(d => JSON.stringify(week[d]) === first)) {
        setSameEveryDay(true);
        setTemplateRanges([...week[DAYS[0]]]);
      }
    }
    setExistingImageUrl(r.image_url ?? null);
    setZabihahStatus((r as any).zabihah_status ?? null);
    setZabihahNotes((r as any).zabihah_notes ?? '');
    setHasPrayerRoom((r as any).has_prayer_room ?? false);
    // Load categorized gallery photos (including menu)
    const cp = r.categorized_photos;
    setGalleryPhotos({
      food:    Array.isArray(cp?.food)    ? cp!.food!    : [],
      outside: Array.isArray(cp?.outside) ? cp!.outside! : [],
      inside:  Array.isArray(cp?.inside)  ? cp!.inside!  : [],
      menu:    Array.isArray(cp?.menu)    ? cp!.menu!    : [],
    });

    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const is24Hours = (ranges: TimeRange[]) =>
    ranges.length === 1 && ranges[0].open === '00:00' && ranges[0].close === '00:00';

  const toggleDay = (day: string, enabled: boolean) => {
    setWeekHours(prev => ({
      ...prev,
      [day]: enabled ? [{ open: '09:00', close: '22:00' }] : [],
    }));
  };

  const toggle24Hours = (day: string) => {
    setWeekHours(prev => ({
      ...prev,
      [day]: is24Hours(prev[day])
        ? [{ open: '09:00', close: '22:00' }]
        : [{ open: '00:00', close: '00:00' }],
    }));
  };

  const addRange = (day: string) => {
    setWeekHours(prev => ({
      ...prev,
      [day]: [...prev[day], { open: '17:00', close: '22:00' }],
    }));
  };

  const removeRange = (day: string, index: number) => {
    setWeekHours(prev => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index),
    }));
  };

  const setTime = (day: string, rangeIndex: number, field: 'open' | 'close', time: string) => {
    if (day === '__all__') {
      const newRanges = templateRanges.map((r, i) =>
        i === rangeIndex ? { ...r, [field]: time } : r,
      );
      applyTemplate(newRanges);
    } else {
      setWeekHours(prev => {
        const ranges = [...prev[day]];
        ranges[rangeIndex] = { ...ranges[rangeIndex], [field]: time };
        return { ...prev, [day]: ranges };
      });
    }
    setTimePicker(null);
  };

  // ── "Same every day" helpers ─────────────────────────────────
  const applyTemplate = (ranges: TimeRange[]) => {
    setTemplateRanges(ranges);
    setWeekHours(Object.fromEntries(DAYS.map(d => [d, [...ranges]])));
  };

  const toggleSameEveryDay = (val: boolean) => {
    setSameEveryDay(val);
    if (val) {
      const seed = DAYS.map(d => weekHours[d]).find(r => r.length > 0)
        ?? [{ open: '09:00', close: '22:00' }];
      applyTemplate([...seed]);
    }
  };

  const toggleTemplateOpen = (enabled: boolean) =>
    applyTemplate(enabled ? [{ open: '09:00', close: '22:00' }] : []);

  const toggleTemplate24Hours = () =>
    applyTemplate(
      is24Hours(templateRanges)
        ? [{ open: '09:00', close: '22:00' }]
        : [{ open: '00:00', close: '00:00' }],
    );

  const addTemplateRange = () =>
    applyTemplate([...templateRanges, { open: '17:00', close: '22:00' }]);

  const removeTemplateRange = (index: number) =>
    applyTemplate(templateRanges.filter((_, i) => i !== index));

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setNewImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  };

  const uploadImage = async (base64: string): Promise<string> => {
    const uuid = Math.random().toString(36).slice(2);
    const path = `main/${uuid}.jpg`;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (!isValidImageBytes(bytes)) throw new Error('Invalid image file.');
    const { error } = await supabase.storage
      .from('gallery_photos')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('gallery_photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const pickGalleryPhoto = async (category: Category) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setNewPhotos(prev => ({
        ...prev,
        [category]: [...prev[category], { uri: result.assets[0].uri, base64: result.assets[0].base64! }],
      }));
    }
  };

  const deleteExistingPhoto = (category: Category, index: number) => {
    setGalleryPhotos(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index),
    }));
  };

  const deleteNewPhoto = (category: Category, index: number) => {
    setNewPhotos(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index),
    }));
  };

  const uploadGalleryPhoto = async (base64: string, category: Category): Promise<string> => {
    const uuid = Math.random().toString(36).slice(2);
    const path = `gallery/${id}/${category}/${uuid}.jpg`;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (!isValidImageBytes(bytes)) throw new Error('Invalid image file.');
    const { error } = await supabase.storage
      .from('gallery_photos')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('gallery_photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Name is required.');
      return;
    }
    if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
      Alert.alert('Invalid coordinates', 'Please enter valid numeric lat and lng values.');
      return;
    }
    setSaving(true);
    try {
      const imageUrl = newImage ? await uploadImage(newImage.base64) : existingImageUrl;

      // Upload all pending gallery + menu photos per category
      const uploadCategory = async (cat: Category) =>
        Promise.all(newPhotos[cat].map(p => uploadGalleryPhoto(p.base64, cat)));
      const [uploadedFood, uploadedOutside, uploadedInside, uploadedMenu] = await Promise.all([
        uploadCategory('food'),
        uploadCategory('outside'),
        uploadCategory('inside'),
        uploadCategory('menu'),
      ]);

      const finalCategorized: Record<Category, string[]> = {
        food:    [...galleryPhotos.food,    ...uploadedFood],
        outside: [...galleryPhotos.outside, ...uploadedOutside],
        inside:  [...galleryPhotos.inside,  ...uploadedInside],
        menu:    [...galleryPhotos.menu,    ...uploadedMenu],
      };
      const galleryImages = [
        ...finalCategorized.food,
        ...finalCategorized.outside,
        ...finalCategorized.inside,
      ];

      const openingHours: Record<string, TimeRange[]> = {};
      DAYS.forEach(day => {
        if (weekHours[day].length > 0) openingHours[day] = weekHours[day];
      });

      const fields = {
        name:                name.trim(),
        address:             address.trim(),
        cuisine_type:        cuisine.trim() || null,
        category,
        primary_certifier:   certifiers[0] ?? 'unknown',
        certifiers:          certifiers,
        phone:               phone.trim() || null,
        website:             website.trim() || null,
        lat:                 parseFloat(lat),
        lng:                 parseFloat(lng),
        opening_hours:       Object.keys(openingHours).length > 0 ? openingHours : null,
        image_url:           imageUrl,
        categorized_photos:  finalCategorized,
        gallery_images:      galleryImages.length > 0 ? galleryImages : null,
        zabihah_status:      zabihahStatus,
        zabihah_notes:       zabihahNotes.trim() || null,
        has_prayer_room:     hasPrayerRoom,
      };

      const { data: saved, error } = isNew
        ? await supabase
            .from('restaurants')
            // Admin-curated listings (grocery/butcher, or a restaurant added
            // directly) are live immediately — no pending/moderation state,
            // matching the fields review/[id].tsx sets when approving a
            // public submission.
            .insert({ ...fields, confidence: 'medium', status: 'approved', is_verified: true })
            .select('id')
            .single()
        : await supabase
            .from('restaurants')
            .update(fields)
            .eq('id', id)
            .select('id')
            .single();

      if (error || !saved) { console.error('[admin/edit] save error:', error); throw new Error(`${isNew ? 'Create' : 'Update'} failed — admin may lack the required permission on restaurants.`); }

      // Commit uploaded photos into local state so UI stays consistent
      setGalleryPhotos(finalCategorized);
      setNewPhotos(emptyNew());

      Alert.alert('Saved', isNew ? 'Listing created.' : 'Listing updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOwner = () => {
    Alert.alert(
      'Remove Owner',
      `Remove the current owner from "${restaurant?.name}"? They will lose manage access immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const { error } = await supabase
                .from('restaurants')
                .update({ owner_id: null })
                .eq('id', id);
              if (error) throw error;
              setRestaurant(r => r ? { ...r, owner_id: null } : r);
              Alert.alert('Done', 'Owner has been removed.');
            } catch (e: any) {
              console.error('[admin/edit] remove owner error:', e);
              Alert.alert('Error', formatError(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Listing',
      `Permanently delete "${restaurant?.name}"? This will also remove all reviews and saved entries. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const { error } = await supabase
                .from('restaurants')
                .delete()
                .eq('id', id);
              if (error) throw error;
              Alert.alert('Deleted', 'Listing has been removed.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (e: any) {
              console.error('[admin/edit] delete error:', e);
              Alert.alert('Error', formatError(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading || (!restaurant && !isNew)) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
          <Text style={s.title}>Edit Listing</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
      </SafeAreaView>
    );
  }

  const activeRange = timePicker
    ? timePicker.day === '__all__'
      ? templateRanges[timePicker.rangeIndex]
      : weekHours[timePicker.day]?.[timePicker.rangeIndex]
    : null;

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#111" />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{name || (isNew ? 'New Listing' : 'Edit Listing')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Basic Info */}
        <Text style={s.sectionTitle}>Basic Info</Text>
        <Text style={s.fieldLabel}>CATEGORY</Text>
        <View style={s.certChips}>
          {LISTING_CATEGORIES.map(c => {
            const selected = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[s.chip, selected && s.chipSelected]}
                onPress={() => setCategory(c.key)}
              >
                {selected && <Ionicons name="checkmark" size={12} color={GREEN} />}
                <Text style={[s.chipText, selected && s.chipTextSelected]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>NAME *</Text>
          <TextInput
            style={s.input} value={name} onChangeText={setName}
            placeholder="Listing name" placeholderTextColor="#bbb"
            returnKeyType="next"
          />
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>ADDRESS *</Text>
          <AddressAutocomplete
            value={address}
            onChangeText={v => { setAddress(v); setLat(''); setLng(''); }}
            onSelect={s => {
              setAddress(s.displayName);
              setLat(String(s.lat));
              setLng(String(s.lng));
            }}
            placeholder="Full address"
          />
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>{CUISINE_FIELD_META[category].label}</Text>
          <TextInput
            style={s.input} value={cuisine} onChangeText={setCuisine}
            placeholder={CUISINE_FIELD_META[category].placeholder} placeholderTextColor="#bbb"
            returnKeyType="next"
          />
        </View>

        {/* Main Image */}
        <Text style={s.sectionTitle}>Main Display Image</Text>
        <TouchableOpacity style={s.imagePicker} onPress={pickImage} activeOpacity={0.8}>
          {newImage || existingImageUrl ? (
            <>
              <Image
                source={newImage ? newImage.uri : existingImageUrl!}
                style={s.imagePickerPreview}
                contentFit="cover"
              />
              <View style={s.imagePickerOverlay}>
                <Ionicons name="camera-outline" size={18} color="#fff" />
                <Text style={s.imagePickerOverlayText}>Change</Text>
              </View>
            </>
          ) : (
            <>
              <Ionicons name="image-outline" size={28} color="#bbb" />
              <Text style={s.imagePickerText}>Tap to add main photo</Text>
              <Text style={s.imagePickerSub}>Shown on restaurant cards</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Gallery Photos */}
        <Text style={s.sectionTitle}>Gallery Photos</Text>
        {CATEGORIES.map(cat => {
          const existing = galleryPhotos[cat.key];
          const pending  = newPhotos[cat.key];
          const total    = existing.length + pending.length;
          return (
            <View key={cat.key} style={s.gallerySection}>
              <View style={s.gallerySectionHeader}>
                <Ionicons name={cat.icon as any} size={16} color={TEXT_MUTED} />
                <Text style={s.gallerySectionLabel}>{cat.label}</Text>
                <Text style={s.galleryCount}>{total} photo{total !== 1 ? 's' : ''}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.galleryRow}
              >
                {/* Existing uploaded photos */}
                {existing.map((url, i) => (
                  <View key={`e-${i}`} style={s.galleryThumbWrap}>
                    <TouchableOpacity onPress={() => setLightboxUrl(url)} activeOpacity={0.85}>
                      <Image source={url} style={s.galleryThumb} contentFit="cover" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.galleryDeleteBtn}
                      onPress={() => deleteExistingPhoto(cat.key, i)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#e53e3e" />
                    </TouchableOpacity>
                  </View>
                ))}
                {/* Pending new photos (not yet uploaded) */}
                {pending.map((p, i) => (
                  <View key={`n-${i}`} style={s.galleryThumbWrap}>
                    <TouchableOpacity onPress={() => setLightboxUrl(p.uri)} activeOpacity={0.85}>
                      <Image source={p.uri} style={s.galleryThumb} contentFit="cover" />
                    </TouchableOpacity>
                    <View style={s.galleryPendingBadge}>
                      <Text style={s.galleryPendingText}>New</Text>
                    </View>
                    <TouchableOpacity
                      style={s.galleryDeleteBtn}
                      onPress={() => deleteNewPhoto(cat.key, i)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#e53e3e" />
                    </TouchableOpacity>
                  </View>
                ))}
                {/* Add photo button */}
                <TouchableOpacity style={s.galleryAddBtn} onPress={() => pickGalleryPhoto(cat.key)}>
                  <Ionicons name="add" size={24} color="#bbb" />
                  <Text style={s.galleryAddText}>Add</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          );
        })}

        {/* Certifier */}
        <Text style={s.sectionTitle}>Certifier (select all that apply)</Text>
        <View style={s.certChips}>
          {CERTIFIERS.map(c => {
            const selected = certifiers.includes(c);
            return (
              <TouchableOpacity
                key={c}
                style={[s.chip, selected && s.chipSelected]}
                onPress={() => setCertifiers(prev =>
                  selected
                    ? prev.length > 1 ? prev.filter(x => x !== c) : prev
                    : [...prev, c]
                )}
              >
                {selected && <Ionicons name="checkmark" size={12} color={GREEN} />}
                <Text style={[s.chipText, selected && s.chipTextSelected]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Zabihah Halal */}
        <Text style={s.sectionTitle}>Zabihah Halal</Text>
        <View style={s.certChips}>
          {([null, 'partial', 'full'] as const).map(v => {
            const label = v === null ? 'Not Zabihah' : v === 'partial' ? 'Partial' : 'Full';
            const selected = zabihahStatus === v;
            return (
              <TouchableOpacity
                key={String(v)}
                style={[s.chip, selected && s.chipSelected]}
                onPress={() => setZabihahStatus(v)}
              >
                {selected && <Ionicons name="checkmark" size={12} color={GREEN} />}
                <Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {zabihahStatus && (
          <View style={s.fieldWrap}>
            <Text style={s.fieldLabel}>NOTES (optional)</Text>
            <TextInput
              style={s.input}
              value={zabihahNotes}
              onChangeText={setZabihahNotes}
              placeholder={zabihahStatus === 'partial' ? 'e.g. Beef & lamb only — chicken is not zabihah' : 'Optional notes'}
              placeholderTextColor="#bbb"
              multiline
            />
          </View>
        )}

        {/* Prayer Room */}
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>Prayer Room</Text>
            <Text style={s.switchSubtitle}>This listing has a dedicated prayer space available for customers</Text>
          </View>
          <Switch
            value={hasPrayerRoom}
            onValueChange={setHasPrayerRoom}
            trackColor={{ false: HAIRLINE, true: GREEN }}
            thumbColor="#fff"
          />
        </View>

        {/* Coordinates */}
        <View style={s.twoCol}>
          <View style={[s.fieldWrap, { flex: 1 }]}>
            <Text style={s.fieldLabel}>LATITUDE *</Text>
            <TextInput style={s.input} value={lat} onChangeText={setLat}
              placeholder="37.3382" placeholderTextColor="#bbb" keyboardType="decimal-pad" />
          </View>
          <View style={[s.fieldWrap, { flex: 1 }]}>
            <Text style={s.fieldLabel}>LONGITUDE *</Text>
            <TextInput style={s.input} value={lng} onChangeText={setLng}
              placeholder="-121.8863" placeholderTextColor="#bbb" keyboardType="decimal-pad" />
          </View>
        </View>

        {/* Phone */}
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>PHONE</Text>
          <TextInput style={s.input} value={phone} onChangeText={setPhone}
            placeholder="(408) 555-0123" placeholderTextColor="#bbb" keyboardType="phone-pad" />
        </View>

        {/* Website */}
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>WEBSITE</Text>
          <TextInput style={s.input} value={website} onChangeText={setWebsite}
            placeholder="https://restaurant.com" placeholderTextColor="#bbb"
            keyboardType="url" autoCapitalize="none" />
        </View>

        {/* Opening hours */}
        <Text style={s.sectionTitle}>Opening Hours</Text>

        {/* Same every day toggle */}
        <View style={s.sameEveryDayRow}>
          <View>
            <Text style={s.sameEveryDayLabel}>Same hours every day</Text>
            <Text style={s.sameEveryDaySub}>Apply one schedule to all 7 days</Text>
          </View>
          <Switch
            value={sameEveryDay}
            onValueChange={toggleSameEveryDay}
            trackColor={{ false: '#e0e0e0', true: '#a7e8d3' }}
            thumbColor={sameEveryDay ? GREEN : '#fff'}
            ios_backgroundColor="#e0e0e0"
          />
        </View>

        <View style={s.hoursCard}>
          {sameEveryDay ? (() => {
            const ranges = templateRanges;
            const isOpen = ranges.length > 0;
            const allDay = is24Hours(ranges);
            return (
              <View style={s.dayBlock}>
                <View style={s.dayHeaderRow}>
                  <Switch
                    value={isOpen}
                    onValueChange={toggleTemplateOpen}
                    trackColor={{ false: '#e0e0e0', true: '#a7e8d3' }}
                    thumbColor={isOpen ? GREEN : '#fff'}
                    ios_backgroundColor="#e0e0e0"
                  />
                  <Text style={[s.dayName, isOpen && s.dayNameOpen]}>All Days</Text>
                  {!isOpen && <Text style={s.closedLabel}>Closed</Text>}
                  {isOpen && (
                    <TouchableOpacity
                      style={[s.addRangeBtn, allDay && s.addRangeBtnActive]}
                      onPress={toggleTemplate24Hours}
                    >
                      <Ionicons name="time-outline" size={13} color={allDay ? '#fff' : GREEN} />
                      <Text style={[s.addRangeText, allDay && s.addRangeTextActive]}>24 hrs</Text>
                    </TouchableOpacity>
                  )}
                  {isOpen && !allDay && ranges.length < 3 && (
                    <TouchableOpacity style={s.addRangeBtn} onPress={addTemplateRange}>
                      <Ionicons name="add" size={14} color={GREEN} />
                      <Text style={s.addRangeText}>Add range</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {allDay ? (
                  <View style={s.rangeRow}>
                    <Ionicons name="checkmark-circle" size={15} color={GREEN} />
                    <Text style={s.allDayLabel}>Open 24 Hours</Text>
                  </View>
                ) : (
                  ranges.map((range, ri) => (
                    <View key={ri} style={s.rangeRow}>
                      <TouchableOpacity style={s.timeBtn}
                        onPress={() => setTimePicker({ day: '__all__', rangeIndex: ri, field: 'open' })}>
                        <Text style={s.timeBtnText}>{fmt(range.open)}</Text>
                      </TouchableOpacity>
                      <Text style={s.timeSep}>–</Text>
                      <TouchableOpacity style={s.timeBtn}
                        onPress={() => setTimePicker({ day: '__all__', rangeIndex: ri, field: 'close' })}>
                        <Text style={s.timeBtnText}>{fmt(range.close)}</Text>
                      </TouchableOpacity>
                      {ranges.length > 1 && (
                        <TouchableOpacity style={s.removeRangeBtn}
                          onPress={() => removeTemplateRange(ri)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={18} color={HAIRLINE} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </View>
            );
          })() : DAYS.map((day, index) => {
            const ranges = weekHours[day];
            const isOpen = ranges.length > 0;
            const allDay = is24Hours(ranges);
            return (
              <View key={day} style={[s.dayBlock, index < DAYS.length - 1 && s.dayBlockBorder]}>
                <View style={s.dayHeaderRow}>
                  <Switch
                    value={isOpen}
                    onValueChange={v => toggleDay(day, v)}
                    trackColor={{ false: '#e0e0e0', true: '#a7e8d3' }}
                    thumbColor={isOpen ? GREEN : '#fff'}
                    ios_backgroundColor="#e0e0e0"
                  />
                  <Text style={[s.dayName, isOpen && s.dayNameOpen]}>{day}</Text>
                  {!isOpen && <Text style={s.closedLabel}>Closed</Text>}
                  {isOpen && (
                    <TouchableOpacity
                      style={[s.addRangeBtn, allDay && s.addRangeBtnActive]}
                      onPress={() => toggle24Hours(day)}
                    >
                      <Ionicons name="time-outline" size={13} color={allDay ? '#fff' : GREEN} />
                      <Text style={[s.addRangeText, allDay && s.addRangeTextActive]}>24 hrs</Text>
                    </TouchableOpacity>
                  )}
                  {isOpen && !allDay && ranges.length < 3 && (
                    <TouchableOpacity style={s.addRangeBtn} onPress={() => addRange(day)}>
                      <Ionicons name="add" size={14} color={GREEN} />
                      <Text style={s.addRangeText}>Add range</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {allDay ? (
                  <View style={s.rangeRow}>
                    <Ionicons name="checkmark-circle" size={15} color={GREEN} />
                    <Text style={s.allDayLabel}>Open 24 Hours</Text>
                  </View>
                ) : (
                  ranges.map((range, ri) => (
                    <View key={ri} style={s.rangeRow}>
                      <TouchableOpacity style={s.timeBtn}
                        onPress={() => setTimePicker({ day, rangeIndex: ri, field: 'open' })}>
                        <Text style={s.timeBtnText}>{fmt(range.open)}</Text>
                      </TouchableOpacity>
                      <Text style={s.timeSep}>–</Text>
                      <TouchableOpacity style={s.timeBtn}
                        onPress={() => setTimePicker({ day, rangeIndex: ri, field: 'close' })}>
                        <Text style={s.timeBtnText}>{fmt(range.close)}</Text>
                      </TouchableOpacity>
                      {ranges.length > 1 && (
                        <TouchableOpacity style={s.removeRangeBtn}
                          onPress={() => removeRange(day, ri)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={18} color={HAIRLINE} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={[s.saveBtn, saving && s.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
               <Text style={s.saveBtnText}>Save Changes</Text></>}
        </TouchableOpacity>

        {!isNew && (
          <TouchableOpacity
            style={[s.deleteBtn, saving && s.btnDisabled]}
            onPress={handleDelete}
            disabled={saving}
          >
            <Ionicons name="trash-outline" size={18} color="#e53e3e" />
            <Text style={s.deleteBtnText}>Delete Listing</Text>
          </TouchableOpacity>
        )}

        {!isNew && restaurant?.owner_id && (
          <TouchableOpacity
            style={[s.removeOwnerBtn, saving && s.btnDisabled]}
            onPress={handleRemoveOwner}
            disabled={saving}
          >
            <Ionicons name="person-remove-outline" size={18} color="#e53e3e" />
            <Text style={s.deleteBtnText}>Remove Owner</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Lightbox modal */}
      <Modal visible={!!lightboxUrl} animationType="fade" transparent
        onRequestClose={() => setLightboxUrl(null)}>
        <View style={lb.overlay}>
          <TouchableOpacity style={lb.closeBtn} onPress={() => setLightboxUrl(null)}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {lightboxUrl && <Image source={lightboxUrl} style={lb.image} contentFit="contain" />}
        </View>
      </Modal>

      {/* Time picker modal */}
      <Modal visible={!!timePicker} animationType="slide" transparent
        onRequestClose={() => setTimePicker(null)}>
        <View style={tp.overlay}>
          <View style={[tp.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={tp.handle} />
            <View style={tp.sheetHeader}>
              <Text style={tp.sheetTitle}>
                {timePicker?.day === '__all__' ? 'All Days' : timePicker?.day} — {timePicker?.field === 'open' ? 'Opens at' : 'Closes at'}
              </Text>
              <TouchableOpacity onPress={() => setTimePicker(null)}>
                <Ionicons name="close" size={20} color="#999" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={TIME_SLOTS}
              keyExtractor={item => item}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 320 }}
              getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
              initialScrollIndex={timePicker ? Math.max(0, TIME_SLOTS.indexOf(
                activeRange?.[timePicker.field] ?? '09:00'
              )) : 0}
              renderItem={({ item }) => {
                const selected = timePicker ? activeRange?.[timePicker.field] === item : false;
                return (
                  <TouchableOpacity
                    style={[tp.timeItem, selected && tp.timeItemSelected]}
                    onPress={() => timePicker && setTime(timePicker.day, timePicker.rangeIndex, timePicker.field, item)}
                  >
                    <Text style={[tp.timeItemText, selected && tp.timeItemTextSelected]}>{fmt(item)}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={GREEN} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE, gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },
  content: { padding: 16 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: TEXT_DARK,
    marginTop: 16, marginBottom: 10, letterSpacing: 0.2,
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 16, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: HAIRLINE,
  },
  switchSubtitle: { fontSize: 12, color: TEXT_MUTED, marginTop: 2, lineHeight: 16 },

  imagePicker: {
    height: 140, borderRadius: 14, borderWidth: 1.5, borderColor: HAIRLINE,
    borderStyle: 'dashed', backgroundColor: CREAM,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    overflow: 'hidden', gap: 6,
  },
  imagePickerPreview: { width: '100%', height: '100%' },
  imagePickerOverlay: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  imagePickerOverlayText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  imagePickerText: { fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },
  imagePickerSub:  { fontSize: 11, color: HAIRLINE },
  certChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: HAIRLINE, backgroundColor: CREAM,
  },
  chipSelected: { borderColor: GREEN, backgroundColor: '#e6f9f2' },
  chipText: { fontSize: 13, color: TEXT_MUTED, fontWeight: '500' },
  chipTextSelected: { color: GREEN, fontWeight: '700' },

  twoCol: { flexDirection: 'row', gap: 10 },
  fieldWrap: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4, marginBottom: 10,
  },
  fieldLabel: { fontSize: 10, fontWeight: '600', color: TEXT_MUTED, letterSpacing: 0.5, marginBottom: 2 },
  input: { fontSize: 15, color: TEXT_DARK, paddingVertical: 6, minHeight: 36 },

  sameEveryDayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1.5, borderColor: HAIRLINE,
  },
  sameEveryDayLabel: { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  sameEveryDaySub: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },

  hoursCard: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: 'hidden',
  },
  dayBlock: { paddingHorizontal: 14, paddingVertical: 10 },
  dayBlockBorder: { borderBottomWidth: 1, borderBottomColor: CREAM },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  dayName: { flex: 1, fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },
  dayNameOpen: { color: TEXT_DARK, fontWeight: '600' },
  closedLabel: { fontSize: 13, color: HAIRLINE },
  addRangeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#c3e8d8', backgroundColor: '#f0faf6',
  },
  addRangeBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  addRangeText: { fontSize: 11, color: GREEN, fontWeight: '600' },
  addRangeTextActive: { color: '#fff' },
  allDayLabel: { fontSize: 13, color: GREEN, fontWeight: '600' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 46, marginTop: 6 },
  removeRangeBtn: { marginLeft: 2 },
  timeBtn: {
    backgroundColor: '#f0faf6', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#c3e8d8',
  },
  timeBtnText: { fontSize: 13, color: GREEN, fontWeight: '600' },
  timeSep: { fontSize: 13, color: HAIRLINE },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 14,
    paddingVertical: 14, marginTop: 10,
    backgroundColor: '#fff5f5',
  },
  removeOwnerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 14,
    paddingVertical: 14, marginTop: 10, marginBottom: 32,
    backgroundColor: '#fff5f5',
  },
  deleteBtnText: { color: '#e53e3e', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },

  // Gallery
  gallerySection: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  gallerySectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  gallerySectionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  galleryCount: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500' },
  galleryRow: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  galleryThumbWrap: { position: 'relative' },
  galleryThumb: { width: 90, height: 90, borderRadius: 10 },
  galleryDeleteBtn: { position: 'absolute', top: -6, right: -6, zIndex: 1 },
  galleryPendingBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: GREEN, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  galleryPendingText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  galleryAddBtn: {
    width: 90, height: 90, borderRadius: 10,
    borderWidth: 1.5, borderColor: HAIRLINE, borderStyle: 'dashed',
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  galleryAddText: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500' },
});

const lb = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  image: { width: '100%', height: '80%' },
});

const tp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12 },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: TEXT_DARK, flex: 1 },
  timeItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, height: 48,
    borderBottomWidth: 1, borderBottomColor: CREAM,
  },
  timeItemSelected: { backgroundColor: '#f0faf6' },
  timeItemText: { fontSize: 16, color: TEXT_DARK },
  timeItemTextSelected: { color: GREEN, fontWeight: '700' },
});
