/**
 * (msa)/jummah.tsx
 *
 * MSA admin screen for managing Jummah sessions.
 * Multiple sessions supported (e.g. 1pm + 2pm). Inline editing, swipe-to-delete.
 */

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useMsa } from '../../contexts/MsaContext';
import { useAuth } from '../../contexts/AuthContext';
import { Brand, Spacing, Radius } from '../../lib/theme';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function parseTime(str: string): Date {
  const d = new Date();
  if (!str) { d.setHours(13, 0, 0, 0); return d; }
  const match = str.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) { d.setHours(13, 0, 0, 0); return d; }
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const p = match[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  d.setHours(h, m, 0, 0);
  return d;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface JummahSession {
  id: string;
  time: string;
  location: string;
  building: string;
  khateeb: string;
  language: string;
  notes: string;
  is_active: boolean;
  position: number;
}

function emptySession(msaId: string, position: number): Omit<JummahSession, 'id'> & { msa_id: string } {
  return {
    msa_id: msaId, time: '', location: '', building: '',
    khateeb: '', language: 'English', notes: '',
    is_active: true, position,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function JummahScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const { user } = useAuth();
  const msaId = activeMembership?.msaId ?? '';

  const [sessions,   setSessions]   = useState<JummahSession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingNew,  setAddingNew]  = useState(false);
  const [draft,      setDraft]      = useState<Partial<JummahSession>>({});
  const [saving,     setSaving]     = useState<string | null>(null); // session id or 'new'

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!msaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('campus_jummah')
      .select('*')
      .eq('msa_id', msaId)
      .order('position', { ascending: true });

    if (error) { Alert.alert('Error', error.message); }
    else { setSessions((data ?? []) as JummahSession[]); }
    setLoading(false);
  }, [msaId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Add new ───────────────────────────────────────────────────────────────

  const handleStartAdd = () => {
    setDraft({ time: '', location: '', building: '', khateeb: '', language: 'English', notes: '', is_active: true });
    setAddingNew(true);
    setExpandedId(null);
  };

  const handleSaveNew = async () => {
    if (!draft.time?.trim()) { Alert.alert('Required', 'Please enter a time.'); return; }
    setSaving('new');
    const { error } = await supabase.from('campus_jummah').insert({
      msa_id:    msaId,
      time:      draft.time?.trim(),
      location:  draft.location?.trim() || null,
      building:  draft.building?.trim() || null,
      khateeb:   draft.khateeb?.trim()  || null,
      language:  draft.language?.trim() || 'English',
      notes:     draft.notes?.trim()    || null,
      is_active: draft.is_active ?? true,
      position:  sessions.length,
    });
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setAddingNew(false);
    setDraft({});
    load();
  };

  const handleCancelNew = () => { setAddingNew(false); setDraft({}); };

  // ── Update existing ───────────────────────────────────────────────────────

  const handleUpdate = async (session: JummahSession) => {
    setSaving(session.id);
    const { error } = await supabase.from('campus_jummah').update({
      time:      session.time?.trim()      || null,
      location:  session.location?.trim()  || null,
      building:  session.building?.trim()  || null,
      khateeb:   session.khateeb?.trim()   || null,
      language:  session.language?.trim()  || 'English',
      notes:     session.notes?.trim()     || null,
      is_active: session.is_active,
    }).eq('id', session.id);
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setExpandedId(null);
    load();
  };

  const updateSession = (id: string, field: keyof JummahSession, value: any) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // ── Toggle active ─────────────────────────────────────────────────────────

  const handleToggleActive = async (session: JummahSession) => {
    const next = !session.is_active;
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, is_active: next } : s));
    await supabase.from('campus_jummah').update({ is_active: next }).eq('id', session.id);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = (session: JummahSession) => {
    Alert.alert(
      'Delete Jummah',
      `Remove the ${session.time} Jummah session?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('campus_jummah').delete().eq('id', session.id);
            if (error) { Alert.alert('Error', error.message); return; }
            load();
          },
        },
      ],
    );
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
          <Text style={s.headerTitle}>Jummah</Text>
          <Text style={s.headerSub}>{activeMembership?.msaName ?? ''}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={handleStartAdd} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={Brand.green} /></View>
      ) : (
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* New session form */}
            {addingNew && (
              <SessionForm
                session={draft}
                onChange={(f, v) => setDraft(prev => ({ ...prev, [f]: v }))}
                onSave={handleSaveNew}
                onCancel={handleCancelNew}
                saving={saving === 'new'}
                isNew
              />
            )}

            {/* Empty state */}
            {sessions.length === 0 && !addingNew && (
              <View style={s.empty}>
                <Ionicons name="people-outline" size={36} color={Brand.textMuted} />
                <Text style={s.emptyTitle}>No Jummah sessions yet</Text>
                <Text style={s.emptyBody}>Tap "Add" above to create your first Jummah.</Text>
              </View>
            )}

            {/* Session cards */}
            {sessions.map(session => (
              <View key={session.id} style={s.card}>
                {/* Card header */}
                <TouchableOpacity
                  style={s.cardHeader}
                  onPress={() => setExpandedId(expandedId === session.id ? null : session.id)}
                  activeOpacity={0.8}
                >
                  <View style={s.cardHeaderLeft}>
                    <View style={[s.activeDot, { backgroundColor: session.is_active ? Brand.green : Brand.textMuted }]} />
                    <View>
                      <Text style={s.cardTime}>{session.time || 'No time set'}</Text>
                      <Text style={s.cardSub}>
                        {[session.location, session.building].filter(Boolean).join(' · ') || 'No location'}
                      </Text>
                    </View>
                  </View>
                  <View style={s.cardHeaderRight}>
                    <Switch
                      value={session.is_active}
                      onValueChange={() => handleToggleActive(session)}
                      trackColor={{ false: Brand.hairline, true: Brand.green }}
                      thumbColor="#fff"
                      style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    />
                    <Ionicons
                      name={expandedId === session.id ? 'chevron-up' : 'chevron-down'}
                      size={16} color={Brand.textMuted}
                    />
                  </View>
                </TouchableOpacity>

                {/* Khateeb chip */}
                {session.khateeb ? (
                  <View style={s.khatibRow}>
                    <Ionicons name="person-outline" size={12} color={Brand.textMuted} />
                    <Text style={s.khatibText}>{session.khateeb}</Text>
                    {session.language && session.language !== 'English' && (
                      <View style={s.langChip}>
                        <Text style={s.langText}>{session.language}</Text>
                      </View>
                    )}
                  </View>
                ) : null}

                {/* Expanded inline editor */}
                {expandedId === session.id && (
                  <SessionForm
                    session={session}
                    onChange={(f, v) => updateSession(session.id, f as keyof JummahSession, v)}
                    onSave={() => handleUpdate(session)}
                    onCancel={() => setExpandedId(null)}
                    onDelete={() => handleDelete(session)}
                    saving={saving === session.id}
                  />
                )}
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ── Session Form Sub-component ─────────────────────────────────────────────────

function SessionForm({
  session, onChange, onSave, onCancel, onDelete, saving, isNew,
}: {
  session: Partial<JummahSession>;
  onChange: (field: string, value: any) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  isNew?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [pickerOpen,    setPickerOpen]    = useState(false);
  const [pickerDate,    setPickerDate]    = useState(() => parseTime(session.time ?? ''));
  const [pickerTemp,    setPickerTemp]    = useState(() => parseTime(session.time ?? ''));

  const openPicker = () => {
    const d = parseTime(session.time ?? '');
    setPickerDate(d); setPickerTemp(d); setPickerOpen(true);
  };
  const confirmPicker = () => {
    onChange('time', formatTime(pickerTemp));
    setPickerOpen(false);
  };

  return (
    <View style={[sf.form, isNew && sf.formNew]}>
      {/* Time — dial picker */}
      <View style={sf.field}>
        <Text style={sf.fieldLabel}>Time *</Text>
        <TouchableOpacity style={sf.timeBtn} onPress={openPicker} activeOpacity={0.7}>
          <Ionicons name="time-outline" size={14} color={Brand.green} />
          <Text style={[sf.timeBtnText, !session.time && sf.timePlaceholder]}>
            {session.time || 'Tap to set time'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={Brand.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Android picker (renders as dialog) */}
      {Platform.OS === 'android' && pickerOpen && (
        <DateTimePicker
          mode="time" display="clock" value={pickerDate}
          onChange={(_, date) => {
            setPickerOpen(false);
            if (date) onChange('time', formatTime(date));
          }}
        />
      )}

      {/* iOS spinner sheet */}
      {Platform.OS === 'ios' && (
        <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
          <TouchableOpacity style={sf.overlay} activeOpacity={1} onPress={() => setPickerOpen(false)} />
          <View style={[sf.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={sf.sheetHandle} />
            <View style={sf.sheetHeader}>
              <Text style={sf.sheetTitle}>Jummah Time</Text>
              <TouchableOpacity onPress={confirmPicker} style={sf.doneBtn}>
                <Text style={sf.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              mode="time" display="spinner" value={pickerTemp}
              onChange={(_, date) => { if (date) setPickerTemp(date); }}
              textColor={Brand.textDark}
              style={{ height: 180 }}
            />
          </View>
        </Modal>
      )}
      <Field label="Location" placeholder="Masjid, prayer room name" value={session.location ?? ''} onChange={v => onChange('location', v)} />
      <Field label="Building" placeholder="Building name or code" value={session.building ?? ''} onChange={v => onChange('building', v)} />
      <Field label="Khateeb" placeholder="Sheikh / speaker name" value={session.khateeb ?? ''} onChange={v => onChange('khateeb', v)} />
      <Field label="Language" placeholder="English" value={session.language ?? ''} onChange={v => onChange('language', v)} />
      <Field label="Notes" placeholder="Any additional info" value={session.notes ?? ''} onChange={v => onChange('notes', v)} multiline />

      <View style={sf.actions}>
        {onDelete && (
          <TouchableOpacity onPress={onDelete} style={sf.deleteBtn} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={15} color={Brand.red} />
            <Text style={sf.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        )}
        <View style={sf.rightActions}>
          <TouchableOpacity onPress={onCancel} style={sf.cancelBtn} activeOpacity={0.8}>
            <Text style={sf.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSave}
            style={[sf.saveBtn, saving && sf.disabled]}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={sf.saveBtnText}>{isNew ? 'Add' : 'Save'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function Field({
  label, placeholder, value, onChange, multiline,
}: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; multiline?: boolean;
}) {
  return (
    <View style={sf.field}>
      <Text style={sf.fieldLabel}>{label}</Text>
      <TextInput
        style={[sf.input, multiline && sf.inputMulti]}
        placeholder={placeholder}
        placeholderTextColor={Brand.textMuted}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        returnKeyType={multiline ? 'default' : 'next'}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Brand.cream },
  flex:    { flex: 1 },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Brand.hairline,
  },
  backBtn:      { padding: 4, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: Brand.textDark },
  headerSub:    { fontSize: 12, color: Brand.textMuted, marginTop: 1 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Brand.deepGreen, borderRadius: Radius.chip,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  scroll: { padding: Spacing.md, gap: Spacing.md },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Brand.textDark },
  emptyBody:  { fontSize: 13, color: Brand.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  cardHeaderLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeDot:       { width: 8, height: 8, borderRadius: 4 },
  cardTime:        { fontSize: 16, fontWeight: '700', color: Brand.textDark },
  cardSub:         { fontSize: 12, color: Brand.textMuted, marginTop: 2 },
  khatibRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingBottom: 12,
  },
  khatibText: { fontSize: 13, color: Brand.textMuted },
  langChip: {
    backgroundColor: Brand.cream, borderRadius: Radius.chip,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: Brand.hairline,
  },
  langText: { fontSize: 11, fontWeight: '600', color: Brand.textMuted },
});

const sf = StyleSheet.create({
  form: {
    borderTopWidth: 1, borderTopColor: Brand.hairline,
    padding: Spacing.md, gap: 12,
    backgroundColor: Brand.cream,
  },
  formNew: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline, borderTopWidth: 1,
  },
  field: { gap: 5 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Brand.textMuted, letterSpacing: 0.5 },

  timeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Brand.cream, borderRadius: Radius.input,
    borderWidth: 1, borderColor: Brand.hairline,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  timeBtnText:    { flex: 1, fontSize: 15, fontWeight: '700', color: Brand.textDark },
  timePlaceholder:{ color: Brand.textMuted, fontWeight: '400', fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Brand.hairline,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 4,
  },
  sheetTitle:   { fontSize: 16, fontWeight: '700', color: Brand.textDark },
  doneBtn:      { backgroundColor: Brand.deepGreen, borderRadius: Radius.chip, paddingHorizontal: 20, paddingVertical: 8 },
  doneBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },

  input: {
    backgroundColor: Brand.cream, borderRadius: Radius.input,
    borderWidth: 1, borderColor: Brand.hairline,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: Brand.textDark,
  },
  inputMulti: { height: 70, textAlignVertical: 'top' },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingTop: 4,
  },
  rightActions: { flexDirection: 'row', gap: 8 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  deleteBtnText: { fontSize: 13, color: Brand.red, fontWeight: '500' },
  cancelBtn: {
    borderRadius: Radius.chip, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: Brand.hairline,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Brand.textDark },
  saveBtn: {
    backgroundColor: Brand.deepGreen, borderRadius: Radius.chip,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
