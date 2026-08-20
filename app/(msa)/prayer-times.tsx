/**
 * (msa)/prayer-times.tsx
 *
 * MSA admin screen for managing campus prayer times.
 * Tap a time to open a native dial picker. Single "Save All" upsert.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { useMsa } from '../../contexts/MsaContext';
import { Brand, Spacing, Radius } from '../../lib/theme';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function parseTime(str: string): Date {
  const d = new Date();
  if (!str) return d;
  const match = str.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) { d.setHours(6, 0, 0, 0); return d; }
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const p = match[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  d.setHours(h, m, 0, 0);
  return d;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PRAYERS = [
  { key: 'fajr',    label: 'Fajr',    icon: 'moon-outline' as const,         desc: 'Pre-dawn' },
  { key: 'dhuhr',   label: 'Dhuhr',   icon: 'sunny-outline' as const,        desc: 'Midday' },
  { key: 'asr',     label: 'Asr',     icon: 'partly-sunny-outline' as const, desc: 'Afternoon' },
  { key: 'maghrib', label: 'Maghrib', icon: 'sunset-outline' as const,       desc: 'Sunset' },
  { key: 'isha',    label: 'Isha',    icon: 'moon' as const,                 desc: 'Night' },
];

interface PrayerRow { prayer: string; time: string; location: string; notes: string; }
type PrayerMap = Record<string, PrayerRow>;

function emptyRow(prayer: string): PrayerRow {
  return { prayer, time: '', location: '', notes: '' };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PrayerTimesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const msaId = activeMembership?.msaId ?? '';

  const [rows, setRows]     = useState<PrayerMap>(() =>
    Object.fromEntries(PRAYERS.map(p => [p.key, emptyRow(p.key)])),
  );
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // Picker state
  const [pickerPrayer,   setPickerPrayer]   = useState<string | null>(null);
  const [pickerDate,     setPickerDate]     = useState(new Date());
  const [pickerTempDate, setPickerTempDate] = useState(new Date());

  // ── Load ──────────────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    if (!msaId) return;
    setLoading(true);
    supabase.from('campus_prayer_times').select('*').eq('msa_id', msaId)
      .then(({ data, error }) => {
        if (error) { Alert.alert('Error', error.message); }
        else {
          const updated: PrayerMap = Object.fromEntries(PRAYERS.map(p => [p.key, emptyRow(p.key)]));
          for (const row of (data ?? [])) {
            updated[row.prayer] = { prayer: row.prayer, time: row.time ?? '', location: row.location ?? '', notes: row.notes ?? '' };
          }
          setRows(updated);
        }
        setLoading(false);
      });
  }, [msaId]));

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const upsertRows = PRAYERS.map(p => ({
      msa_id:   msaId,
      prayer:   p.key,
      time:     rows[p.key].time     || null,
      location: rows[p.key].location.trim() || null,
      notes:    rows[p.key].notes.trim()    || null,
    }));
    setSaving(true);
    const { error } = await supabase
      .from('campus_prayer_times')
      .upsert(upsertRows, { onConflict: 'msa_id,prayer' });
    setSaving(false);
    if (error) Alert.alert('Save failed', error.message);
    else Alert.alert('Saved', 'Prayer times updated.');
  };

  const update = (prayer: string, field: keyof PrayerRow, value: string) =>
    setRows(prev => ({ ...prev, [prayer]: { ...prev[prayer], [field]: value } }));

  // ── Picker handlers ────────────────────────────────────────────────────────

  const openPicker = (prayerKey: string) => {
    const d = parseTime(rows[prayerKey].time);
    setPickerDate(d);
    setPickerTempDate(d);
    setPickerPrayer(prayerKey);
  };

  const confirmPicker = () => {
    if (!pickerPrayer) return;
    update(pickerPrayer, 'time', formatTime(pickerTempDate));
    const idx = PRAYERS.findIndex(p => p.key === pickerPrayer);
    const next = PRAYERS[idx + 1];
    if (next) {
      const d = parseTime(rows[next.key].time);
      setPickerDate(d);
      setPickerTempDate(d);
      setPickerPrayer(next.key);
    } else {
      setPickerPrayer(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Prayer Times</Text>
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
            : <Text style={s.saveBtnText}>Save All</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={Brand.green} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.card}>
            {PRAYERS.map((p, idx) => (
              <View key={p.key}>
                {idx > 0 && <View style={s.divider} />}
                <View style={s.row}>
                  <View style={s.prayerIcon}>
                    <Ionicons name={p.icon} size={18} color={Brand.deepGreen} />
                  </View>
                  <View style={s.prayerInfo}>
                    <Text style={s.prayerLabel}>{p.label}</Text>
                    <Text style={s.prayerDesc}>{p.desc}</Text>
                  </View>
                  <View style={s.rowRight}>
                    {/* Time dial button */}
                    <TouchableOpacity
                      style={s.timeBtn}
                      onPress={() => openPicker(p.key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="time-outline" size={13} color={Brand.green} />
                      <Text style={[s.timeBtnText, !rows[p.key].time && s.timePlaceholder]}>
                        {rows[p.key].time || 'Set time'}
                      </Text>
                    </TouchableOpacity>
                    {/* Location */}
                    <TextInput
                      style={s.locationInput}
                      placeholder="Location"
                      placeholderTextColor={Brand.textMuted}
                      value={rows[p.key].location}
                      onChangeText={v => update(p.key, 'location', v)}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Notes */}
          <Text style={s.sectionLabel}>NOTES</Text>
          <View style={s.card}>
            {PRAYERS.map((p, idx) => (
              <View key={p.key}>
                {idx > 0 && <View style={s.divider} />}
                <View style={s.notesRow}>
                  <Text style={s.notesLabel}>{p.label}</Text>
                  <TextInput
                    style={s.notesInput}
                    placeholder="Optional note (e.g. sisters entrance)"
                    placeholderTextColor={Brand.textMuted}
                    value={rows[p.key].notes}
                    onChangeText={v => update(p.key, 'notes', v)}
                  />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Time picker — spinner in a bottom sheet modal (iOS + Android) */}
      <Modal
        visible={pickerPrayer !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerPrayer(null)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerPrayer(null)}
        />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>
              {pickerPrayer ? PRAYERS.find(p => p.key === pickerPrayer)?.label : ''} Time
            </Text>
            <TouchableOpacity onPress={confirmPicker} style={s.doneBtn}>
              <Text style={s.doneBtnText}>
                {PRAYERS.findIndex(p => p.key === pickerPrayer) < PRAYERS.length - 1 ? 'Next' : 'Done'}
              </Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            mode="time"
            display="spinner"
            value={pickerTempDate}
            onChange={(_, date) => { if (date) setPickerTempDate(date); }}
            textColor={Platform.OS === 'ios' ? Brand.textDark : undefined}
            style={{ height: 180 }}
          />
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: Brand.cream },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
    paddingHorizontal: 16, paddingVertical: 8,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabled:    { opacity: 0.6 },

  scroll: { padding: Spacing.md, gap: Spacing.md },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Brand.textMuted,
    letterSpacing: 0.8, marginTop: 4,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline,
  },
  divider: { height: 1, backgroundColor: Brand.hairline, marginLeft: 60 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12, gap: 12,
  },
  prayerIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center',
  },
  prayerInfo: { width: 60 },
  prayerLabel: { fontSize: 14, fontWeight: '700', color: Brand.textDark },
  prayerDesc:  { fontSize: 11, color: Brand.textMuted, marginTop: 1 },

  rowRight: { flex: 1, gap: 6 },

  timeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Brand.cream, borderRadius: Radius.chip,
    borderWidth: 1, borderColor: Brand.hairline,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  timeBtnText:    { fontSize: 14, fontWeight: '700', color: Brand.textDark },
  timePlaceholder:{ color: Brand.textMuted, fontWeight: '400' },

  locationInput: {
    backgroundColor: Brand.cream, borderRadius: Radius.chip,
    borderWidth: 1, borderColor: Brand.hairline,
    paddingHorizontal: 12, paddingVertical: 7,
    fontSize: 13, color: Brand.textDark,
  },

  notesRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12, gap: 12,
  },
  notesLabel: { width: 56, fontSize: 13, fontWeight: '600', color: Brand.textDark },
  notesInput: { flex: 1, fontSize: 13, color: Brand.textDark, paddingVertical: 0 },

  // Modal / sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Brand.hairline,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, marginBottom: 4,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: Brand.textDark },
  doneBtn: {
    backgroundColor: Brand.deepGreen, borderRadius: Radius.chip,
    paddingHorizontal: 20, paddingVertical: 8,
  },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
