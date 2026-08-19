/**
 * (msa)/events/[id].tsx
 *
 * Create or edit a campus event.
 * id === 'new' → insert mode. Otherwise → update/delete mode.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../../lib/supabase';
import { useMsa } from '../../../contexts/MsaContext';
import { useAuth } from '../../../contexts/AuthContext';
import { Brand, Spacing, Radius } from '../../../lib/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

const CATEGORIES = ['lecture', 'sisters', 'quran', 'youth', 'community', 'social', 'other'] as const;
type Category = typeof CATEGORIES[number];

interface EventForm {
  title: string;
  body: string;
  event_start: Date | null;
  event_end: Date | null;
  location: string;
  category: Category | '';
  is_published: boolean;
}

const EMPTY_FORM: EventForm = {
  title: '', body: '', event_start: null, event_end: null,
  location: '', category: '', is_published: false,
};

// ── Date picker field state ────────────────────────────────────────────────────

type DateField = 'event_start' | 'event_end' | null;
type PickerMode = 'date' | 'time';

// ── Component ──────────────────────────────────────────────────────────────────

export default function EventEditScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const { user } = useAuth();
  const msaId = activeMembership?.msaId ?? '';

  const isNew = id === 'new';

  const [form,        setForm]        = useState<EventForm>(EMPTY_FORM);
  const [loading,     setLoading]     = useState(!isNew);
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [showPicker,  setShowPicker]  = useState<DateField>(null);
  const [pickerMode,  setPickerMode]  = useState<PickerMode>('date');
  const [pickerTemp,  setPickerTemp]  = useState<Date>(new Date());

  // ── Load existing ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('campus_events')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      Alert.alert('Error', error?.message ?? 'Event not found.');
      router.back();
      return;
    }

    setForm({
      title:        data.title ?? '',
      body:         data.body  ?? '',
      event_start:  data.event_start ? new Date(data.event_start) : null,
      event_end:    data.event_end   ? new Date(data.event_end)   : null,
      location:     data.location    ?? '',
      category:     (data.category as Category | '') ?? '',
      is_published: data.is_published ?? false,
    });
    setLoading(false);
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const set = (field: keyof EventForm, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const openPicker = (field: DateField, mode: PickerMode) => {
    const cur = form[field as keyof EventForm] as Date | null;
    setPickerTemp(cur ?? new Date());
    setPickerMode(mode);
    setShowPicker(field);
  };

  const onPickerChange = (_: any, date?: Date) => {
    if (!date || !showPicker) return;
    if (pickerMode === 'date') {
      // Keep old time, set new date
      const existing = form[showPicker] ?? new Date();
      const merged = new Date(existing);
      merged.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setPickerTemp(merged);
      // Move to time picker
      setPickerMode('time');
    } else {
      const merged = new Date(pickerTemp);
      merged.setHours(date.getHours(), date.getMinutes(), 0, 0);
      set(showPicker, merged);
      setShowPicker(null);
    }
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.title.trim()) { Alert.alert('Required', 'Event title is required.'); return; }

    setSaving(true);
    const payload = {
      msa_id:       msaId,
      title:        form.title.trim(),
      body:         form.body.trim()     || null,
      event_start:  form.event_start?.toISOString() ?? null,
      event_end:    form.event_end?.toISOString()   ?? null,
      location:     form.location.trim() || null,
      category:     form.category        || null,
      is_published: form.is_published,
    };

    let error;
    if (isNew) {
      ({ error } = await supabase.from('campus_events').insert({ ...payload, created_by: user?.id }));
    } else {
      ({ error } = await supabase.from('campus_events').update(payload).eq('id', id));
    }

    setSaving(false);
    if (error) { Alert.alert('Save failed', error.message); return; }
    router.back();
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = () => {
    Alert.alert(
      'Delete Event',
      `Permanently delete "${form.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.from('campus_events').delete().eq('id', id);
            setDeleting(false);
            if (error) { Alert.alert('Error', error.message); return; }
            router.back();
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.root, s.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Brand.green} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>{isNew ? 'New Event' : 'Edit Event'}</Text>
          <Text style={s.headerSub}>{activeMembership?.msaName ?? ''}</Text>
        </View>
        <TouchableOpacity
          style={[s.saveBtn, saving && s.disabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 60 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <View style={s.card}>
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>TITLE *</Text>
              <TextInput
                style={s.titleInput}
                placeholder="Event title"
                placeholderTextColor={Brand.textMuted}
                value={form.title}
                onChangeText={v => set('title', v)}
                returnKeyType="next"
              />
            </View>
            <View style={s.cardDivider} />
            <View style={s.fieldBlock}>
              <Text style={s.fieldLabel}>DESCRIPTION</Text>
              <TextInput
                style={s.bodyInput}
                placeholder="What's this event about? Add details, agenda, etc."
                placeholderTextColor={Brand.textMuted}
                value={form.body}
                onChangeText={v => set('body', v)}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Date & Time */}
          <Text style={s.sectionLabel}>DATE & TIME</Text>
          <View style={s.card}>
            <DateField
              label="Start"
              date={form.event_start}
              onPress={() => openPicker('event_start', 'date')}
              onClear={() => set('event_start', null)}
            />
            <View style={s.cardDivider} />
            <DateField
              label="End"
              date={form.event_end}
              onPress={() => openPicker('event_end', 'date')}
              onClear={() => set('event_end', null)}
            />
          </View>

          {/* Location */}
          <Text style={s.sectionLabel}>LOCATION</Text>
          <View style={s.card}>
            <View style={s.fieldBlock}>
              <TextInput
                style={s.input}
                placeholder="Room, building, or address"
                placeholderTextColor={Brand.textMuted}
                value={form.location}
                onChangeText={v => set('location', v)}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Category */}
          <Text style={s.sectionLabel}>CATEGORY</Text>
          <View style={s.catGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[s.catChip, form.category === cat && s.catChipActive]}
                onPress={() => set('category', form.category === cat ? '' : cat)}
                activeOpacity={0.75}
              >
                <Text style={[s.catChipText, form.category === cat && s.catChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Publish toggle */}
          <Text style={s.sectionLabel}>VISIBILITY</Text>
          <View style={s.card}>
            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={s.toggleLabel}>Published</Text>
                <Text style={s.toggleSub}>
                  {form.is_published ? 'Visible to all MSA members' : 'Only visible to admins'}
                </Text>
              </View>
              <Switch
                value={form.is_published}
                onValueChange={v => set('is_published', v)}
                trackColor={{ false: Brand.hairline, true: Brand.green }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Delete */}
          {!isNew && (
            <TouchableOpacity
              style={[s.deleteBtn, deleting && s.disabled]}
              onPress={handleDelete}
              disabled={deleting}
              activeOpacity={0.7}
            >
              {deleting
                ? <ActivityIndicator size="small" color={Brand.red} />
                : <Text style={s.deleteBtnText}>Delete Event</Text>}
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date/Time Picker */}
      {showPicker && Platform.OS === 'ios' && (
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowPicker(null)}>
                <Text style={s.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>
                {pickerMode === 'date' ? 'Select Date' : 'Select Time'}
              </Text>
              <TouchableOpacity onPress={() => {
                if (pickerMode === 'date') {
                  setPickerTemp(pickerTemp);
                  setPickerMode('time');
                } else {
                  set(showPicker, pickerTemp);
                  setShowPicker(null);
                }
              }}>
                <Text style={s.pickerDone}>
                  {pickerMode === 'date' ? 'Next' : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={pickerTemp}
              mode={pickerMode}
              display="spinner"
              onChange={(_, d) => { if (d) setPickerTemp(d); }}
              textColor={Brand.textDark}
              style={s.picker}
            />
          </View>
        </View>
      )}
      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerTemp}
          mode={pickerMode}
          onChange={onPickerChange}
        />
      )}
    </View>
  );
}

// ── Date Field Sub-component ───────────────────────────────────────────────────

function DateField({ label, date, onPress, onClear }: {
  label: string; date: Date | null; onPress: () => void; onClear: () => void;
}) {
  const formatted = date
    ? date.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : null;

  return (
    <TouchableOpacity style={s.dateRow} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="calendar-outline" size={17} color={Brand.deepGreen} />
      <Text style={s.dateLabel}>{label}</Text>
      <Text style={[s.dateValue, !formatted && s.datePlaceholder]}>
        {formatted ?? 'Tap to set'}
      </Text>
      {formatted && (
        <TouchableOpacity onPress={onClear} hitSlop={10}>
          <Ionicons name="close-circle" size={16} color={Brand.textMuted} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Brand.cream },
  flex:    { flex: 1 },
  centered:{ alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Brand.hairline,
  },
  backBtn:      { padding: 4, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: Brand.textDark },
  headerSub:    { fontSize: 12, color: Brand.textMuted, marginTop: 1 },
  saveBtn: {
    backgroundColor: Brand.deepGreen, borderRadius: Radius.chip,
    paddingHorizontal: 16, paddingVertical: 8, minWidth: 56, alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabled:    { opacity: 0.6 },

  scroll: { padding: Spacing.md, gap: Spacing.md },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Brand.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4,
  },

  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline, overflow: 'hidden',
  },
  cardDivider: { height: 1, backgroundColor: Brand.hairline },

  fieldBlock: { padding: Spacing.md },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', color: Brand.textMuted,
    letterSpacing: 0.8, marginBottom: 8,
  },
  titleInput: {
    fontSize: 18, fontWeight: '700', color: Brand.textDark,
    paddingVertical: 0,
  },
  bodyInput: {
    fontSize: 14, color: Brand.textDark, lineHeight: 20,
    minHeight: 100, paddingVertical: 0,
  },
  input: {
    fontSize: 14, color: Brand.textDark, paddingVertical: 0,
  },

  // Date rows
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  dateLabel:      { fontSize: 14, fontWeight: '600', color: Brand.textDark, width: 34 },
  dateValue:      { flex: 1, fontSize: 14, color: Brand.textDark },
  datePlaceholder:{ color: Brand.textMuted },

  // Category chips
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.chip, borderWidth: 1.5, borderColor: Brand.hairline,
    backgroundColor: '#fff',
  },
  catChipActive: { borderColor: Brand.deepGreen, backgroundColor: Brand.deepGreen },
  catChipText:   { fontSize: 13, fontWeight: '600', color: Brand.textMuted, textTransform: 'capitalize' },
  catChipTextActive: { color: '#fff' },

  // Toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 14, gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: Brand.textDark },
  toggleSub:   { fontSize: 12, color: Brand.textMuted, marginTop: 2 },

  // Delete
  deleteBtn: { alignItems: 'center', paddingVertical: 20, marginTop: 8 },
  deleteBtnText: { fontSize: 13, color: Brand.red, fontWeight: '500' },

  // iOS Date picker overlay
  pickerOverlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Brand.hairline,
  },
  pickerTitle:  { fontSize: 15, fontWeight: '700', color: Brand.textDark },
  pickerCancel: { fontSize: 15, color: Brand.textMuted },
  pickerDone:   { fontSize: 15, fontWeight: '700', color: Brand.deepGreen },
  picker:       { height: 220 },
});
