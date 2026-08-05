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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { isValidImageBytes } from '../../lib/validateImageBytes';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { Brand } from '../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const CREAM      = Brand.cream;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const RED        = Brand.red;

type PhotoCategory = 'food' | 'outside' | 'inside' | 'menu';
const PHOTO_CATEGORIES: { key: PhotoCategory; label: string; icon: string }[] = [
  { key: 'food',    label: 'Food Photos',     icon: 'fast-food-outline'  },
  { key: 'outside', label: 'Outside Photos',  icon: 'business-outline'   },
  { key: 'inside',  label: 'Interior Photos', icon: 'home-outline'       },
  { key: 'menu',    label: 'Menu Photos',     icon: 'receipt-outline'    },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS: string[] = [];
for (let h = 0; h <= 23; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}
function fmt(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${period}`;
}

type TimeRange   = { open: string; close: string };
type WeekHours   = Record<string, TimeRange[]>;
const emptyWeek  = (): WeekHours => Object.fromEntries(DAYS.map(d => [d, []]));

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

type NewPhoto = { uri: string; base64: string };
const emptyGallery = (): Record<PhotoCategory, string[]>  => ({ food: [], outside: [], inside: [], menu: [] });
const emptyNew     = (): Record<PhotoCategory, NewPhoto[]> => ({ food: [], outside: [], inside: [], menu: [] });

export default function ManageRestaurantScreen() {
  const { id }            = useLocalSearchParams<{ id: string }>();
  const router            = useRouter();
  const insets            = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [restName,   setRestName]   = useState('');

  // Editable by owner
  const [name,    setName]    = useState('');
  const [address, setAddress] = useState('');
  const [lat,     setLat]     = useState('');
  const [lng,     setLng]     = useState('');
  const [phone,   setPhone]   = useState('');
  const [website, setWebsite] = useState('');
  const [cuisine, setCuisine] = useState('');

  // Hours
  const [weekHours,      setWeekHours]      = useState<WeekHours>(emptyWeek());
  const [sameEveryDay,   setSameEveryDay]   = useState(false);
  const [templateRanges, setTemplateRanges] = useState<TimeRange[]>([{ open: '09:00', close: '22:00' }]);
  const [timePicker,     setTimePicker]     = useState<{ day: string; rangeIndex: number; field: 'open' | 'close' } | null>(null);

  // Images
  const [hasPrayerRoom,    setHasPrayerRoom]    = useState(false);

  // Images
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [newImage,         setNewImage]         = useState<NewPhoto | null>(null);
  const [galleryPhotos,    setGalleryPhotos]    = useState<Record<PhotoCategory, string[]>>(emptyGallery());
  const [newPhotos,        setNewPhotos]        = useState<Record<PhotoCategory, NewPhoto[]>>(emptyNew());
  const [lightboxUrl,      setLightboxUrl]      = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !user) return;
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, name, address, cuisine_type, phone, website, lat, lng, opening_hours, image_url, categorized_photos, has_prayer_room, owner_id')
      .eq('id', id)
      .single();

    if (error || !data) {
      Alert.alert('Error', error?.message ?? 'Listing not found.');
      router.back();
      return;
    }

    if (data.owner_id !== user.id && !isAdmin) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    setAuthorized(true);

    setRestName(data.name);
    setName(data.name);
    setAddress(data.address);
    setLat(data.lat != null ? String(data.lat) : '');
    setLng(data.lng != null ? String(data.lng) : '');
    setPhone(data.phone ?? '');
    setWebsite(data.website ?? '');
    setCuisine(data.cuisine_type ?? '');

    const week = hoursToWeek(data.opening_hours);
    setWeekHours(week);
    const allOpen = DAYS.every(d => week[d].length > 0);
    if (allOpen) {
      const first = JSON.stringify(week[DAYS[0]]);
      if (DAYS.every(d => JSON.stringify(week[d]) === first)) {
        setSameEveryDay(true);
        setTemplateRanges([...week[DAYS[0]]]);
      }
    }

    setHasPrayerRoom(data.has_prayer_room ?? false);
    setExistingImageUrl(data.image_url ?? null);
    const cp = data.categorized_photos;
    setGalleryPhotos({
      food:    Array.isArray(cp?.food)    ? cp!.food!    : [],
      outside: Array.isArray(cp?.outside) ? cp!.outside! : [],
      inside:  Array.isArray(cp?.inside)  ? cp!.inside!  : [],
      menu:    Array.isArray(cp?.menu)    ? cp!.menu!    : [],
    });
    setLoading(false);
  }, [id, user, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // ── Hours helpers ─────────────────────────────────────────────
  const is24Hours = (ranges: TimeRange[]) =>
    ranges.length === 1 && ranges[0].open === '00:00' && ranges[0].close === '00:00';

  const applyTemplate = (ranges: TimeRange[]) => {
    setTemplateRanges(ranges);
    setWeekHours(Object.fromEntries(DAYS.map(d => [d, [...ranges]])));
  };

  const toggleSameEveryDay = (val: boolean) => {
    setSameEveryDay(val);
    if (val) {
      const seed = DAYS.map(d => weekHours[d]).find(r => r.length > 0) ?? [{ open: '09:00', close: '22:00' }];
      applyTemplate([...seed]);
    }
  };

  const setTime = (day: string, rangeIndex: number, field: 'open' | 'close', time: string) => {
    if (day === '__all__') {
      applyTemplate(templateRanges.map((r, i) => i === rangeIndex ? { ...r, [field]: time } : r));
    } else {
      setWeekHours(prev => {
        const ranges = [...prev[day]];
        ranges[rangeIndex] = { ...ranges[rangeIndex], [field]: time };
        return { ...prev, [day]: ranges };
      });
    }
    setTimePicker(null);
  };

  // ── Image helpers ─────────────────────────────────────────────
  const pickMainImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      setNewImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  };

  const uploadImage = async (base64: string, storagePath: string): Promise<string> => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (!isValidImageBytes(bytes)) throw new Error('Invalid image file.');
    const { error } = await supabase.storage.from('gallery_photos').upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('gallery_photos').getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const pickGalleryPhoto = async (category: PhotoCategory) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    if (!result.canceled && result.assets[0].base64) {
      setNewPhotos(prev => ({ ...prev, [category]: [...prev[category], { uri: result.assets[0].uri, base64: result.assets[0].base64! }] }));
    }
  };

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Business name cannot be empty.'); return; }
    if (!address.trim()) { Alert.alert('Required', 'Address cannot be empty.'); return; }

    setSaving(true);
    try {
      const uuid = () => Math.random().toString(36).slice(2);

      const imageUrl = newImage
        ? await uploadImage(newImage.base64, `main/${uuid()}.jpg`)
        : existingImageUrl;

      const uploadCat = async (cat: PhotoCategory) =>
        Promise.all(newPhotos[cat].map(p => uploadImage(p.base64, `gallery/${id}/${cat}/${uuid()}.jpg`)));
      const [upFood, upOutside, upInside, upMenu] = await Promise.all([
        uploadCat('food'), uploadCat('outside'), uploadCat('inside'), uploadCat('menu'),
      ]);

      const finalCategorized: Record<PhotoCategory, string[]> = {
        food:    [...galleryPhotos.food,    ...upFood],
        outside: [...galleryPhotos.outside, ...upOutside],
        inside:  [...galleryPhotos.inside,  ...upInside],
        menu:    [...galleryPhotos.menu,    ...upMenu],
      };
      const galleryImages = [...finalCategorized.food, ...finalCategorized.outside, ...finalCategorized.inside];

      const openingHours: Record<string, TimeRange[]> = {};
      DAYS.forEach(day => { if (weekHours[day].length > 0) openingHours[day] = weekHours[day]; });

      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);

      const { error } = await supabase
        .from('restaurants')
        .update({
          name:               name.trim(),
          address:            address.trim(),
          cuisine_type:       cuisine.trim() || null,
          phone:              phone.trim() || null,
          website:            website.trim() || null,
          lat:                !isNaN(latNum) ? latNum : null,
          lng:                !isNaN(lngNum) ? lngNum : null,
          opening_hours:      Object.keys(openingHours).length > 0 ? openingHours : null,
          image_url:          imageUrl,
          categorized_photos: finalCategorized,
          gallery_images:     galleryImages.length > 0 ? galleryImages : null,
          has_prayer_room:    hasPrayerRoom,
        })
        .eq('id', id);

      if (error) throw new Error(error.message);

      setGalleryPhotos(finalCategorized);
      setNewPhotos(emptyNew());
      setNewImage(null);

      Alert.alert('Saved', 'Your listing has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Unauthorized ──────────────────────────────────────────────
  if (!loading && !authorized) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
          <Text style={s.title}>Manage Listing</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.centered}>
          <Ionicons name="lock-closed-outline" size={48} color={TEXT_MUTED} />
          <Text style={s.unauthorizedText}>You don't have permission to manage this listing.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
          <Text style={s.title}>Manage Listing</Text>
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
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{restName || 'Manage Listing'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Admin-only notice */}
        <View style={s.noticeBanner}>
          <Ionicons name="shield-checkmark-outline" size={16} color={GREEN} />
          <Text style={s.noticeText}>
            Halal certification and zabihah status are verified and managed by the Rihdal team to ensure accuracy for our community.
          </Text>
        </View>

        {/* ── Basic Info ── */}
        <Text style={s.sectionTitle}>Business Info</Text>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>BUSINESS NAME *</Text>
          <TextInput
            style={s.input} value={name} onChangeText={setName}
            placeholder="Name" placeholderTextColor="#bbb"
          />
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>ADDRESS *</Text>
          <AddressAutocomplete
            value={address}
            onChangeText={v => { setAddress(v); setLat(''); setLng(''); }}
            onSelect={r => { setAddress(r.displayName); setLat(String(r.lat)); setLng(String(r.lng)); }}
            placeholder="Full address"
          />
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>CUISINE / SPECIALTY</Text>
          <TextInput
            style={s.input} value={cuisine} onChangeText={setCuisine}
            placeholder="e.g. Pakistani, Mediterranean" placeholderTextColor="#bbb"
          />
        </View>

        {/* ── Contact ── */}
        <Text style={s.sectionTitle}>Contact & Website</Text>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>PHONE</Text>
          <TextInput
            style={s.input} value={phone} onChangeText={setPhone}
            placeholder="(408) 555-0123" placeholderTextColor="#bbb" keyboardType="phone-pad"
          />
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>WEBSITE</Text>
          <TextInput
            style={s.input} value={website} onChangeText={setWebsite}
            placeholder="https://yourbusiness.com" placeholderTextColor="#bbb"
            keyboardType="url" autoCapitalize="none"
          />
        </View>

        {/* ── Main Display Image ── */}
        <Text style={s.sectionTitle}>Display Image</Text>
        <TouchableOpacity style={s.imagePicker} onPress={pickMainImage} activeOpacity={0.8}>
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
              <Text style={s.imagePickerText}>Tap to add a display photo</Text>
              <Text style={s.imagePickerSub}>Shown on restaurant cards in the app</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Gallery Photos ── */}
        <Text style={s.sectionTitle}>Gallery Photos</Text>
        {PHOTO_CATEGORIES.map(cat => {
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.galleryRow}>
                {existing.map((url, i) => (
                  <View key={`e-${i}`} style={s.galleryThumbWrap}>
                    <TouchableOpacity onPress={() => setLightboxUrl(url)} activeOpacity={0.85}>
                      <Image source={url} style={s.galleryThumb} contentFit="cover" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.galleryDeleteBtn}
                      onPress={() => setGalleryPhotos(prev => ({ ...prev, [cat.key]: prev[cat.key].filter((_, j) => j !== i) }))}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="close-circle" size={20} color={RED} />
                    </TouchableOpacity>
                  </View>
                ))}
                {pending.map((p, i) => (
                  <View key={`n-${i}`} style={s.galleryThumbWrap}>
                    <Image source={p.uri} style={s.galleryThumb} contentFit="cover" />
                    <View style={s.galleryPendingBadge}><Text style={s.galleryPendingText}>New</Text></View>
                    <TouchableOpacity
                      style={s.galleryDeleteBtn}
                      onPress={() => setNewPhotos(prev => ({ ...prev, [cat.key]: prev[cat.key].filter((_, j) => j !== i) }))}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="close-circle" size={20} color={RED} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={s.galleryAddBtn} onPress={() => pickGalleryPhoto(cat.key)}>
                  <Ionicons name="add" size={24} color="#bbb" />
                  <Text style={s.galleryAddText}>Add</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          );
        })}

        {/* ── Opening Hours ── */}
        <Text style={s.sectionTitle}>Opening Hours</Text>
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
                    onValueChange={v => applyTemplate(v ? [{ open: '09:00', close: '22:00' }] : [])}
                    trackColor={{ false: '#e0e0e0', true: '#a7e8d3' }}
                    thumbColor={isOpen ? GREEN : '#fff'}
                    ios_backgroundColor="#e0e0e0"
                  />
                  <Text style={[s.dayName, isOpen && s.dayNameOpen]}>All Days</Text>
                  {!isOpen && <Text style={s.closedLabel}>Closed</Text>}
                  {isOpen && (
                    <TouchableOpacity
                      style={[s.addRangeBtn, allDay && s.addRangeBtnActive]}
                      onPress={() => applyTemplate(allDay ? [{ open: '09:00', close: '22:00' }] : [{ open: '00:00', close: '00:00' }])}
                    >
                      <Ionicons name="time-outline" size={13} color={allDay ? '#fff' : GREEN} />
                      <Text style={[s.addRangeText, allDay && s.addRangeTextActive]}>24 hrs</Text>
                    </TouchableOpacity>
                  )}
                  {isOpen && !allDay && ranges.length < 3 && (
                    <TouchableOpacity style={s.addRangeBtn} onPress={() => applyTemplate([...ranges, { open: '17:00', close: '22:00' }])}>
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
                      <TouchableOpacity style={s.timeBtn} onPress={() => setTimePicker({ day: '__all__', rangeIndex: ri, field: 'open' })}>
                        <Text style={s.timeBtnText}>{fmt(range.open)}</Text>
                      </TouchableOpacity>
                      <Text style={s.timeSep}>–</Text>
                      <TouchableOpacity style={s.timeBtn} onPress={() => setTimePicker({ day: '__all__', rangeIndex: ri, field: 'close' })}>
                        <Text style={s.timeBtnText}>{fmt(range.close)}</Text>
                      </TouchableOpacity>
                      {ranges.length > 1 && (
                        <TouchableOpacity style={s.removeRangeBtn} onPress={() => applyTemplate(ranges.filter((_, i) => i !== ri))}
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
                    onValueChange={v => setWeekHours(prev => ({ ...prev, [day]: v ? [{ open: '09:00', close: '22:00' }] : [] }))}
                    trackColor={{ false: '#e0e0e0', true: '#a7e8d3' }}
                    thumbColor={isOpen ? GREEN : '#fff'}
                    ios_backgroundColor="#e0e0e0"
                  />
                  <Text style={[s.dayName, isOpen && s.dayNameOpen]}>{day}</Text>
                  {!isOpen && <Text style={s.closedLabel}>Closed</Text>}
                  {isOpen && (
                    <TouchableOpacity
                      style={[s.addRangeBtn, allDay && s.addRangeBtnActive]}
                      onPress={() => setWeekHours(prev => ({ ...prev, [day]: allDay ? [{ open: '09:00', close: '22:00' }] : [{ open: '00:00', close: '00:00' }] }))}
                    >
                      <Ionicons name="time-outline" size={13} color={allDay ? '#fff' : GREEN} />
                      <Text style={[s.addRangeText, allDay && s.addRangeTextActive]}>24 hrs</Text>
                    </TouchableOpacity>
                  )}
                  {isOpen && !allDay && ranges.length < 3 && (
                    <TouchableOpacity style={s.addRangeBtn} onPress={() => setWeekHours(prev => ({ ...prev, [day]: [...prev[day], { open: '17:00', close: '22:00' }] }))}>
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
                      <TouchableOpacity style={s.timeBtn} onPress={() => setTimePicker({ day, rangeIndex: ri, field: 'open' })}>
                        <Text style={s.timeBtnText}>{fmt(range.open)}</Text>
                      </TouchableOpacity>
                      <Text style={s.timeSep}>–</Text>
                      <TouchableOpacity style={s.timeBtn} onPress={() => setTimePicker({ day, rangeIndex: ri, field: 'close' })}>
                        <Text style={s.timeBtnText}>{fmt(range.close)}</Text>
                      </TouchableOpacity>
                      {ranges.length > 1 && (
                        <TouchableOpacity style={s.removeRangeBtn}
                          onPress={() => setWeekHours(prev => ({ ...prev, [day]: prev[day].filter((_, i) => i !== ri) }))}
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

        {/* ── Amenities ── */}
        <Text style={s.sectionTitle}>Amenities</Text>
        <View style={s.fieldWrap}>
          <View style={s.toggleRow}>
            <View style={s.toggleLabel}>
              <Ionicons name="people-outline" size={18} color={TEXT_DARK} style={{ marginRight: 8 }} />
              <Text style={s.toggleLabelText}>Prayer Room Available</Text>
            </View>
            <Switch
              value={hasPrayerRoom}
              onValueChange={setHasPrayerRoom}
              trackColor={{ false: HAIRLINE, true: GREEN }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[s.saveBtn, saving && s.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="checkmark-circle-outline" size={20} color="#fff" /><Text style={s.saveBtnText}>Save Changes</Text></>}
        </TouchableOpacity>
      </ScrollView>

      {/* Lightbox */}
      <Modal visible={!!lightboxUrl} animationType="fade" transparent onRequestClose={() => setLightboxUrl(null)}>
        <View style={lb.overlay}>
          <TouchableOpacity style={lb.closeBtn} onPress={() => setLightboxUrl(null)}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {lightboxUrl && <Image source={lightboxUrl} style={lb.image} contentFit="contain" />}
        </View>
      </Modal>

      {/* Time picker */}
      <Modal visible={!!timePicker} animationType="slide" transparent onRequestClose={() => setTimePicker(null)}>
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
              initialScrollIndex={timePicker ? Math.max(0, TIME_SLOTS.indexOf(activeRange?.[timePicker.field] ?? '09:00')) : 0}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  unauthorizedText: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center', lineHeight: 22 },

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

  noticeBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#f0faf6', borderWidth: 1, borderColor: '#c3e8d8',
    borderRadius: 12, padding: 12, marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 12, color: GREEN, lineHeight: 17 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  toggleLabel: { flexDirection: 'row', alignItems: 'center' },
  toggleLabelText: { fontSize: 15, color: TEXT_DARK },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: TEXT_DARK,
    marginTop: 16, marginBottom: 10, letterSpacing: 0.2,
  },

  fieldWrap: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4, marginBottom: 10,
  },
  fieldLabel: { fontSize: 10, fontWeight: '600', color: TEXT_MUTED, letterSpacing: 0.5, marginBottom: 2 },
  input: { fontSize: 15, color: TEXT_DARK, paddingVertical: 6, minHeight: 36 },

  imagePicker: {
    height: 160, borderRadius: 14, borderWidth: 1.5, borderColor: HAIRLINE,
    borderStyle: 'dashed', backgroundColor: CREAM,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4, overflow: 'hidden', gap: 6,
  },
  imagePickerPreview: { width: '100%', height: '100%' },
  imagePickerOverlay: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  imagePickerOverlayText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  imagePickerText: { fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },
  imagePickerSub:  { fontSize: 11, color: TEXT_MUTED },

  gallerySection: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  gallerySectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  gallerySectionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  galleryCount: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500' },
  galleryRow: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  galleryThumbWrap: { position: 'relative' },
  galleryThumb: { width: 90, height: 90, borderRadius: 10 },
  galleryDeleteBtn: { position: 'absolute', top: -6, right: -6, zIndex: 1 },
  galleryPendingBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: GREEN, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
  },
  galleryPendingText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  galleryAddBtn: {
    width: 90, height: 90, borderRadius: 10,
    borderWidth: 1.5, borderColor: HAIRLINE, borderStyle: 'dashed',
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  galleryAddText: { fontSize: 12, color: TEXT_MUTED, fontWeight: '500' },

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
    backgroundColor: '#f0faf6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#c3e8d8',
  },
  timeBtnText: { fontSize: 13, color: GREEN, fontWeight: '600' },
  timeSep: { fontSize: 13, color: HAIRLINE },

  saveBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});

const lb = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  closeBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  image: { width: '100%', height: '80%' },
});

const tp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 12 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: TEXT_DARK, flex: 1 },
  timeItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, height: 48, borderBottomWidth: 1, borderBottomColor: CREAM,
  },
  timeItemSelected: { backgroundColor: '#f0faf6' },
  timeItemText: { fontSize: 16, color: TEXT_DARK },
  timeItemTextSelected: { color: GREEN, fontWeight: '700' },
});
