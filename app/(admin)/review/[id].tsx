import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator,
  Alert, Modal, FlatList, Switch, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
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
type DaySchedule = TimeRange[]; // empty array = closed
type WeekHours = Record<string, DaySchedule>;

const DEFAULT_HOURS: WeekHours = Object.fromEntries(DAYS.map(d => [d, []]));

interface Submission {
  id: string;
  user_id: string;
  name: string;
  address: string;
  cuisine_type: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  certification_photo_url: string;
  food_photo_urls: string[] | null;
  restaurant_photo_urls: string[] | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export default function AdminReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);

  // Admin-editable fields
  const [certifiers,   setCertifiers]   = useState<Certifier[]>(['unknown']);
  const [zabihahStatus, setZabihahStatus] = useState<'full' | 'partial' | null>(null);
  const [zabihahNotes,  setZabihahNotes]  = useState('');
  const [adminPhone,   setAdminPhone]   = useState('');
  const [adminWebsite, setAdminWebsite] = useState('');
  const [adminLat,     setAdminLat]     = useState('');
  const [adminLng,     setAdminLng]     = useState('');
  const [weekHours,    setWeekHours]    = useState<WeekHours>(DEFAULT_HOURS);
  const [rejectNote,   setRejectNote]   = useState('');
  const [mainImage,    setMainImage]    = useState<{ uri: string; base64: string } | null>(null);

  // Modals
  const [lightboxUrl,   setLightboxUrl]   = useState<string | null>(null);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectError,   setRejectError]   = useState<string | null>(null);
  // Time picker: which day + range index + field is being edited
  // day can be '__all__' when sameEveryDay is active
  const [timePicker, setTimePicker] = useState<{ day: string; rangeIndex: number; field: 'open' | 'close' } | null>(null);
  const [sameEveryDay, setSameEveryDay] = useState(false);
  const [templateRanges, setTemplateRanges] = useState<TimeRange[]>([{ open: '09:00', close: '22:00' }]);

  const loadSubmission = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('submissions')
      .select('id, user_id, name, address, cuisine_type, phone, website, notes, certification_photo_url, food_photo_urls, restaurant_photo_urls, lat, lng, created_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      Alert.alert('Error', error?.message ?? 'Submission not found');
      router.back();
      return;
    }
    const sub = data as Submission;
    setSubmission(sub);
    setAdminPhone(sub.phone ?? '');
    setAdminWebsite(sub.website ?? '');
    if (sub.lat != null) setAdminLat(String(sub.lat));
    if (sub.lng != null) setAdminLng(String(sub.lng));
    setLoading(false);
  }, [id]);

  useEffect(() => { loadSubmission(); }, [loadSubmission]);

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
    setWeekHours(prev => {
      const next = prev[day].filter((_, i) => i !== index);
      return { ...prev, [day]: next };
    });
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

  const pickMainImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setMainImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  };

  const uploadMainImage = async (base64: string): Promise<string> => {
    const uuid = Math.random().toString(36).slice(2);
    const path = `main/${uuid}.jpg`;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const { error } = await supabase.storage
      .from('gallery_photos')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('gallery_photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const doApprove = async () => {
    if (!submission) return;
    setSaving(true);
    try {
      const imageUrl = mainImage ? await uploadMainImage(mainImage.base64) : null;

      // Build categorized_photos from submission uploads
      const categorizedPhotos: Record<string, string[]> = {};
      if (submission.food_photo_urls && submission.food_photo_urls.length > 0) {
        categorizedPhotos.food = submission.food_photo_urls;
      }
      if (submission.restaurant_photo_urls && submission.restaurant_photo_urls.length > 0) {
        categorizedPhotos.outside = submission.restaurant_photo_urls;
      }

      // Build opening_hours — only include days that have at least one range
      const openingHours: Record<string, TimeRange[]> = {};
      DAYS.forEach(day => {
        if (weekHours[day].length > 0) openingHours[day] = weekHours[day];
      });

      // Fall back to first uploaded photo if no explicit main image was chosen
      const firstPhoto =
        imageUrl ??
        submission.food_photo_urls?.[0] ??
        submission.restaurant_photo_urls?.[0] ??
        null;

      const { data: newRestaurant, error: insertErr } = await supabase.from('restaurants').insert({
        name:               submission.name,
        address:            submission.address,
        cuisine_type:       submission.cuisine_type ?? 'Unknown',
        primary_certifier:  certifiers[0] ?? 'unknown',
        certifiers:         certifiers,
        confidence:         'medium',
        status:             'approved',
        is_verified:        true,
        phone:              adminPhone.trim() || null,
        website:            adminWebsite.trim() || null,
        lat:                parseFloat(adminLat),
        lng:                parseFloat(adminLng),
        opening_hours:      Object.keys(openingHours).length > 0 ? openingHours : null,
        categorized_photos: Object.keys(categorizedPhotos).length > 0 ? categorizedPhotos : null,
        image_url:          firstPhoto,
        zabihah_status:     zabihahStatus,
        zabihah_notes:      zabihahNotes.trim() || null,
      }).select('id').single();

      if (insertErr) throw new Error(insertErr.message);

      const { error: updateErr } = await supabase
        .from('submissions')
        .update({ status: 'approved', restaurant_id: newRestaurant!.id })
        .eq('id', submission.id);

      if (updateErr) throw new Error(updateErr.message);

      // Notify the submitting user
      supabase.functions.invoke('notify-user', {
        body: {
          userId: submission.user_id,
          title: '🎉 Restaurant Approved!',
          body: `${submission.name} has been approved and is now live on HalalForMe.`,
        },
      }).catch(() => {});

      Alert.alert('Approved', `${submission.name} is now live.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!submission) return;
    if (!adminLat || !adminLng) {
      Alert.alert('Missing coordinates', 'Please fill in lat and lng before approving.');
      return;
    }

    // Duplicate check — query by name (case-insensitive)
    const { data: existing } = await supabase
      .from('restaurants')
      .select('id, name, address')
      .ilike('name', submission.name.trim())
      .limit(5);

    if (existing && existing.length > 0) {
      const list = existing.map(r => `• ${r.name}\n  ${r.address}`).join('\n\n');
      Alert.alert(
        'Possible Duplicate',
        `A restaurant with this name already exists:\n\n${list}\n\nApproving will create a second entry. Are you sure?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Approve Anyway', style: 'destructive', onPress: doApprove },
        ],
      );
      return;
    }

    doApprove();
  };

  const handleReject = async () => {
    if (!submission) return;
    if (!rejectNote.trim()) {
      setRejectError('Please provide a reason for rejection.');
      return;
    }

    setSaving(true);
    setRejectError(null);
    const { data: updated, error } = await supabase
      .from('submissions')
      .update({ status: 'rejected', reviewer_notes: rejectNote.trim() })
      .eq('id', submission.id)
      .select('id')
      .single();
    setSaving(false);

    if (error || !updated) {
      setRejectError(error?.message ?? 'Update failed — admin may lack UPDATE permission on submissions.');
      return;
    }

    // Notify the submitting user
    supabase.functions.invoke('notify-user', {
      body: {
        userId: submission.user_id,
        title: 'Submission Update',
        body: `Your submission for ${submission.name} was not approved. Reason: ${rejectNote.trim()}`,
      },
    }).catch(() => {});

    setRejectVisible(false);
    setTimeout(() => router.back(), 350);
  };

  if (loading || !submission) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
          <Text style={s.title}>Review Submission</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  const allGallery = [
    ...(submission.food_photo_urls?.map(url => ({ url, type: 'Food' })) ?? []),
    ...(submission.restaurant_photo_urls?.map(url => ({ url, type: 'Restaurant' })) ?? []),
  ];

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
        <Text style={s.title}>Review Submission</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Section 1: Submitted info ──────────────────────────── */}
        <Text style={s.sectionTitle}>Submitted Info</Text>
        <View style={s.card}>
          <InfoRow label="Name"    value={submission.name} />
          <InfoRow label="Address" value={submission.address} />
          {submission.cuisine_type ? <InfoRow label="Cuisine" value={submission.cuisine_type} /> : null}
          {submission.phone   ? <InfoRow label="Phone"   value={submission.phone} /> : null}
          {submission.website ? <InfoRow label="Website" value={submission.website} /> : null}
          {submission.notes   ? <InfoRow label="Notes"   value={submission.notes} /> : null}
        </View>

        {/* ── Section 2: Certification photo ────────────────────── */}
        <Text style={s.sectionTitle}>Halal Certificate</Text>
        <TouchableOpacity
          style={s.certPhotoWrap}
          onPress={() => setLightboxUrl(submission.certification_photo_url)}
          activeOpacity={0.85}
        >
          <Image
            source={submission.certification_photo_url}
            style={s.certPhoto}
            contentFit="cover"
          />
          <View style={s.certPhotoOverlay}>
            <Ionicons name="expand-outline" size={18} color="#fff" />
            <Text style={s.certPhotoTap}>Tap to expand</Text>
          </View>
        </TouchableOpacity>

        {/* ── Section 3: Gallery photos ──────────────────────────── */}
        {allGallery.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Gallery Photos ({allGallery.length})</Text>
            <FlatList
              data={allGallery}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => setLightboxUrl(item.url)} style={s.galleryThumbWrap}>
                  <Image source={item.url} style={s.galleryThumb} contentFit="cover" />
                  <View style={s.galleryTypeTag}>
                    <Text style={s.galleryTypeText}>{item.type}</Text>
                  </View>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ gap: 10, marginBottom: 20 }}
              scrollEnabled={allGallery.length > 3}
            />
          </>
        ) : null}

        {/* ── Section 4: Admin fields ────────────────────────────── */}
        <Text style={s.sectionTitle}>Admin Details</Text>

        <Text style={s.fieldGroupLabel}>Main Display Image</Text>
        <TouchableOpacity style={s.imagePicker} onPress={pickMainImage} activeOpacity={0.8}>
          {mainImage ? (
            <>
              <Image source={mainImage.uri} style={s.imagePickerPreview} contentFit="cover" />
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

        <Text style={s.fieldGroupLabel}>Certifier * (select all that apply)</Text>
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
        <Text style={s.fieldGroupLabel}>Zabihah Halal</Text>
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

        <View style={s.twoCol}>
          <View style={[s.fieldWrap, { flex: 1 }]}>
            <Text style={s.fieldLabel}>LATITUDE *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 37.3382"
              placeholderTextColor="#bbb"
              value={adminLat}
              onChangeText={setAdminLat}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[s.fieldWrap, { flex: 1 }]}>
            <Text style={s.fieldLabel}>LONGITUDE *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. -121.8863"
              placeholderTextColor="#bbb"
              value={adminLng}
              onChangeText={setAdminLng}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>PHONE</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. (408) 555-0123"
            placeholderTextColor="#bbb"
            value={adminPhone}
            onChangeText={setAdminPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>WEBSITE</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. https://restaurant.com"
            placeholderTextColor="#bbb"
            value={adminWebsite}
            onChangeText={setAdminWebsite}
            keyboardType="url"
            autoCapitalize="none"
          />
        </View>

        {/* ── Opening hours ──────────────────────────────────────── */}
        <Text style={s.fieldGroupLabel}>Opening Hours (optional)</Text>

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
                      <TouchableOpacity
                        style={s.timeBtn}
                        onPress={() => setTimePicker({ day: '__all__', rangeIndex: ri, field: 'open' })}
                      >
                        <Text style={s.timeBtnText}>{fmt(range.open)}</Text>
                      </TouchableOpacity>
                      <Text style={s.timeSep}>–</Text>
                      <TouchableOpacity
                        style={s.timeBtn}
                        onPress={() => setTimePicker({ day: '__all__', rangeIndex: ri, field: 'close' })}
                      >
                        <Text style={s.timeBtnText}>{fmt(range.close)}</Text>
                      </TouchableOpacity>
                      {ranges.length > 1 && (
                        <TouchableOpacity
                          style={s.removeRangeBtn}
                          onPress={() => removeTemplateRange(ri)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
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
            const allDay  = is24Hours(ranges);
            return (
              <View
                key={day}
                style={[s.dayBlock, index < DAYS.length - 1 && s.dayBlockBorder]}
              >
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
                      <TouchableOpacity
                        style={s.timeBtn}
                        onPress={() => setTimePicker({ day, rangeIndex: ri, field: 'open' })}
                      >
                        <Text style={s.timeBtnText}>{fmt(range.open)}</Text>
                      </TouchableOpacity>
                      <Text style={s.timeSep}>–</Text>
                      <TouchableOpacity
                        style={s.timeBtn}
                        onPress={() => setTimePicker({ day, rangeIndex: ri, field: 'close' })}
                      >
                        <Text style={s.timeBtnText}>{fmt(range.close)}</Text>
                      </TouchableOpacity>
                      {ranges.length > 1 && (
                        <TouchableOpacity
                          style={s.removeRangeBtn}
                          onPress={() => removeRange(day, ri)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
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

        {/* ── Section 5: Actions ─────────────────────────────────── */}
        <TouchableOpacity
          style={[s.approveBtn, saving && s.btnDisabled]}
          onPress={handleApprove}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={s.approveBtnText}>Approve & Publish</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.rejectBtn, saving && s.btnDisabled]}
          onPress={() => setRejectVisible(true)}
          disabled={saving}
        >
          <Ionicons name="close-circle-outline" size={20} color={RED} />
          <Text style={s.rejectBtnText}>Reject</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Time picker modal ──────────────────────────────────── */}
      <Modal
        visible={!!timePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setTimePicker(null)}
      >
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
                const selected = timePicker
                  ? activeRange?.[timePicker.field] === item
                  : false;
                return (
                  <TouchableOpacity
                    style={[tp.timeItem, selected && tp.timeItemSelected]}
                    onPress={() => timePicker && setTime(timePicker.day, timePicker.rangeIndex, timePicker.field, item)}
                  >
                    <Text style={[tp.timeItemText, selected && tp.timeItemTextSelected]}>
                      {fmt(item)}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={18} color={GREEN} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Lightbox modal ─────────────────────────────────────── */}
      <Modal
        visible={!!lightboxUrl}
        animationType="fade"
        transparent
        onRequestClose={() => setLightboxUrl(null)}
      >
        <View style={lb.overlay}>
          <TouchableOpacity style={lb.closeBtn} onPress={() => setLightboxUrl(null)}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {lightboxUrl ? (
            <Image source={lightboxUrl} style={lb.image} contentFit="contain" />
          ) : null}
        </View>
      </Modal>

      {/* ── Reject modal ───────────────────────────────────────── */}
      <Modal
        visible={rejectVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRejectVisible(false)}
      >
        <View style={rm.overlay}>
          <TouchableOpacity style={rm.backdrop} activeOpacity={1} onPress={Keyboard.dismiss} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[rm.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={rm.handle} />
              <TouchableOpacity style={rm.closeBtn} onPress={() => { Keyboard.dismiss(); setRejectVisible(false); setRejectError(null); }}>
                <Ionicons name="close" size={18} color="#999" />
              </TouchableOpacity>
              <Text style={rm.title}>Reject Submission</Text>
              {rejectError ? (
                <View style={rm.errorBox}>
                  <Text style={rm.errorText}>{rejectError}</Text>
                </View>
              ) : null}
              <Text style={rm.label}>Reason (shown to submitter)</Text>
              <TextInput
                style={rm.input}
                placeholder="e.g. Could not verify the certificate authenticity"
                placeholderTextColor="#bbb"
                value={rejectNote}
                onChangeText={setRejectNote}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={Keyboard.dismiss}
              />
              <TouchableOpacity
                style={[rm.rejectBtn, saving && rm.btnDisabled]}
                onPress={handleReject}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={rm.rejectBtnText}>Confirm Rejection</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    marginBottom: 4, gap: 8,
  },
  infoRow: { flexDirection: 'row', gap: 10 },
  infoLabel: { width: 72, fontSize: 12, fontWeight: '600', color: TEXT_MUTED, textTransform: 'uppercase' },
  infoValue: { flex: 1, fontSize: 14, color: TEXT_DARK, lineHeight: 20 },

  certPhotoWrap: {
    borderRadius: 14, overflow: 'hidden', marginBottom: 4, height: 200,
  },
  certPhoto: { width: '100%', height: '100%' },
  certPhotoOverlay: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  certPhotoTap: { fontSize: 12, color: '#fff', fontWeight: '600' },

  galleryThumbWrap: { position: 'relative' },
  galleryThumb: { width: 100, height: 100, borderRadius: 12 },
  galleryTypeTag: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  galleryTypeText: { fontSize: 10, color: '#fff', fontWeight: '600' },

  fieldGroupLabel: { fontSize: 12, fontWeight: '600', color: TEXT_MUTED, marginBottom: 8, marginTop: 4 },

  imagePicker: {
    height: 140, borderRadius: 14, borderWidth: 1.5, borderColor: HAIRLINE,
    borderStyle: 'dashed', backgroundColor: CREAM,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
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
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
    marginBottom: 10,
  },
  fieldLabel: { fontSize: 10, fontWeight: '600', color: TEXT_MUTED, letterSpacing: 0.5, marginBottom: 2 },
  input: { fontSize: 15, color: TEXT_DARK, paddingVertical: 6, minHeight: 36 },

  // Same every day toggle
  sameEveryDayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1.5, borderColor: HAIRLINE,
  },
  sameEveryDayLabel: { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  sameEveryDaySub: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },

  // Hours
  hoursCard: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: 'hidden',
  },
  dayBlock: { paddingHorizontal: 14, paddingVertical: 10 },
  dayBlockBorder: { borderBottomWidth: 1, borderBottomColor: CREAM },
  dayHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4,
  },
  dayName: { flex: 1, fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },
  dayNameOpen: { color: TEXT_DARK, fontWeight: '600' },
  closedLabel: { fontSize: 13, color: HAIRLINE },
  addRangeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#c3e8d8',
    backgroundColor: '#f0faf6',
  },
  addRangeBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  addRangeText: { fontSize: 11, color: GREEN, fontWeight: '600' },
  addRangeTextActive: { color: '#fff' },
  allDayLabel: { fontSize: 13, color: GREEN, fontWeight: '600' },
  rangeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 46, marginTop: 6,
  },
  removeRangeBtn: { marginLeft: 2 },
  timeBtn: {
    backgroundColor: '#f0faf6', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#c3e8d8',
  },
  timeBtnText: { fontSize: 13, color: GREEN, fontWeight: '600' },
  timeSep: { fontSize: 13, color: HAIRLINE },

  approveBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 15, marginTop: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  approveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rejectBtn: {
    borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 14,
    paddingVertical: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff5f5',
  },
  rejectBtnText: { color: '#e53e3e', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
});

const tp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  timeItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, height: 48,
    borderBottomWidth: 1, borderBottomColor: CREAM,
  },
  timeItemSelected: { backgroundColor: '#f0faf6' },
  timeItemText: { fontSize: 16, color: TEXT_DARK },
  timeItemTextSelected: { color: GREEN, fontWeight: '700' },
});

const lb = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute', top: 60, right: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  image: { width: '100%', height: '80%' },
});

const rm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12,
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
  title: { fontSize: 19, fontWeight: '800', color: TEXT_DARK, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 12,
    padding: 12, fontSize: 14, color: TEXT_DARK, minHeight: 90,
    backgroundColor: CREAM,
  },
  errorBox: {
    backgroundColor: '#fff5f5', borderRadius: 10, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#fca5a5',
  },
  errorText: { fontSize: 13, color: '#e53e3e', lineHeight: 18 },
  rejectBtn: {
    marginTop: 16, backgroundColor: RED, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  rejectBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
