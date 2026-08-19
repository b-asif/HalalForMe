/**
 * (msa)/prayer-spaces.tsx
 *
 * MSA admin prayer spaces. Inline create and inline edit.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useMsa } from '../../contexts/MsaContext';
import { Brand, Spacing, Radius } from '../../lib/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PrayerSpace {
  id: string;
  name: string;
  building: string | null;
  room_number: string | null;
  floor: string | null;
  capacity: number | null;
  wudu_available: boolean;
  sisters_space: boolean;
  hours_text: string | null;
  notes: string | null;
  is_active: boolean;
}

type SpaceDraft = Omit<PrayerSpace, 'id'>;

function emptyDraft(): SpaceDraft {
  return {
    name: '', building: '', room_number: '', floor: '',
    capacity: null, wudu_available: false, sisters_space: false,
    hours_text: '', notes: '', is_active: true,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PrayerSpacesScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const msaId = activeMembership?.msaId ?? '';

  const [spaces,     setSpaces]     = useState<PrayerSpace[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [addingNew,  setAddingNew]  = useState(false);
  const [newDraft,   setNewDraft]   = useState<SpaceDraft>(emptyDraft());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, SpaceDraft>>({});
  const [saving,     setSaving]     = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!msaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('campus_prayer_spaces')
      .select('*')
      .eq('msa_id', msaId)
      .order('name', { ascending: true });

    if (error) Alert.alert('Error', error.message);
    else setSpaces((data ?? []) as PrayerSpace[]);
    setLoading(false);
  }, [msaId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newDraft.name.trim()) { Alert.alert('Required', 'Space name is required.'); return; }
    setSaving('new');
    const { error } = await supabase.from('campus_prayer_spaces').insert({
      msa_id:         msaId,
      name:           newDraft.name.trim(),
      building:       newDraft.building?.trim()    || null,
      room_number:    newDraft.room_number?.trim() || null,
      floor:          newDraft.floor?.trim()       || null,
      capacity:       newDraft.capacity            || null,
      wudu_available: newDraft.wudu_available,
      sisters_space:  newDraft.sisters_space,
      hours_text:     newDraft.hours_text?.trim()  || null,
      notes:          newDraft.notes?.trim()       || null,
      is_active:      newDraft.is_active,
    });
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setAddingNew(false);
    setNewDraft(emptyDraft());
    load();
  };

  // ── Expand / edit ─────────────────────────────────────────────────────────

  const handleExpand = (space: PrayerSpace) => {
    if (expandedId === space.id) { setExpandedId(null); return; }
    setExpandedId(space.id);
    setEditDrafts(prev => ({ ...prev, [space.id]: { ...space } }));
  };

  const setField = (id: string, field: keyof SpaceDraft, value: any) => {
    setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleUpdate = async (id: string) => {
    const d = editDrafts[id];
    if (!d?.name?.trim()) { Alert.alert('Required', 'Space name is required.'); return; }
    setSaving(id);
    const { error } = await supabase.from('campus_prayer_spaces').update({
      name:           d.name.trim(),
      building:       d.building?.trim()    || null,
      room_number:    d.room_number?.trim() || null,
      floor:          d.floor?.trim()       || null,
      capacity:       d.capacity            || null,
      wudu_available: d.wudu_available,
      sisters_space:  d.sisters_space,
      hours_text:     d.hours_text?.trim()  || null,
      notes:          d.notes?.trim()       || null,
      is_active:      d.is_active,
    }).eq('id', id);
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setExpandedId(null);
    load();
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = (space: PrayerSpace) => {
    Alert.alert(
      'Delete Space',
      `Remove "${space.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('campus_prayer_spaces').delete().eq('id', space.id);
            if (error) { Alert.alert('Error', error.message); return; }
            setExpandedId(null);
            load();
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Prayer Spaces</Text>
          <Text style={s.headerSub}>{activeMembership?.msaName ?? ''}</Text>
        </View>
        <TouchableOpacity
          style={[s.addBtn, addingNew && s.addBtnActive]}
          onPress={() => { setExpandedId(null); setAddingNew(!addingNew); }}
          hitSlop={8}
          activeOpacity={0.8}
        >
          <Ionicons name={addingNew ? 'close' : 'add'} size={22} color={Brand.deepGreen} />
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
            {/* Inline new form */}
            {addingNew && (
              <View style={[s.card, s.newCard]}>
                <View style={s.newCardLabel}>
                  <Text style={s.newCardLabelText}>New Prayer Space</Text>
                </View>
                <SpaceForm
                  draft={newDraft}
                  onChange={(f, v) => setNewDraft(prev => ({ ...prev, [f]: v }))}
                  onSave={handleCreate}
                  onCancel={() => { setAddingNew(false); setNewDraft(emptyDraft()); }}
                  saving={saving === 'new'}
                  isNew
                />
              </View>
            )}

            {/* Empty state */}
            {spaces.length === 0 && !addingNew && (
              <View style={s.empty}>
                <Ionicons name="business-outline" size={38} color={Brand.textMuted} />
                <Text style={s.emptyTitle}>No prayer spaces listed</Text>
                <Text style={s.emptyBody}>Tap "+" to add a campus prayer room or masjid.</Text>
              </View>
            )}

            {/* Space cards */}
            {spaces.map(space => {
              const expanded = expandedId === space.id;
              const draft    = editDrafts[space.id];
              return (
                <View key={space.id} style={[s.card, !space.is_active && s.inactiveCard]}>
                  <TouchableOpacity
                    style={s.cardHeader}
                    onPress={() => handleExpand(space)}
                    activeOpacity={0.8}
                  >
                    <View style={s.cardIcon}>
                      <Ionicons name="location-outline" size={17} color={Brand.deepGreen} />
                    </View>
                    <View style={s.cardInfo}>
                      <Text style={s.cardName}>{space.name}</Text>
                      <Text style={s.cardSub}>
                        {[space.building, space.room_number ? `Room ${space.room_number}` : null]
                          .filter(Boolean).join(' · ') || 'No location details'}
                      </Text>
                    </View>
                    <View style={s.cardBadges}>
                      {space.wudu_available && (
                        <View style={s.badge}>
                          <Text style={s.badgeText}>Wudu</Text>
                        </View>
                      )}
                      {space.sisters_space && (
                        <View style={[s.badge, s.badgeSisters]}>
                          <Text style={[s.badgeText, s.badgeSistersText]}>Sisters</Text>
                        </View>
                      )}
                    </View>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={16} color={Brand.textMuted}
                    />
                  </TouchableOpacity>

                  {expanded && draft && (
                    <>
                      <View style={s.cardDivider} />
                      <SpaceForm
                        draft={draft}
                        onChange={(f, v) => setField(space.id, f as keyof SpaceDraft, v)}
                        onSave={() => handleUpdate(space.id)}
                        onCancel={() => setExpandedId(null)}
                        onDelete={() => handleDelete(space)}
                        saving={saving === space.id}
                      />
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ── Space Form ────────────────────────────────────────────────────────────────

function SpaceForm({ draft, onChange, onSave, onCancel, onDelete, saving, isNew }: {
  draft: SpaceDraft;
  onChange: (field: string, value: any) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  isNew?: boolean;
}) {
  return (
    <View style={sf.form}>
      <FormField label="Name *" placeholder="e.g. MSA Prayer Room" value={draft.name} onChange={v => onChange('name', v)} />
      <FormField label="Building" placeholder="Building name or code" value={draft.building ?? ''} onChange={v => onChange('building', v)} />
      <View style={sf.row}>
        <View style={sf.half}>
          <FormField label="Room Number" placeholder="e.g. 204B" value={draft.room_number ?? ''} onChange={v => onChange('room_number', v)} />
        </View>
        <View style={sf.half}>
          <FormField label="Floor" placeholder="e.g. 2nd" value={draft.floor ?? ''} onChange={v => onChange('floor', v)} />
        </View>
      </View>
      <FormField label="Capacity" placeholder="Max occupancy" value={draft.capacity?.toString() ?? ''} onChange={v => onChange('capacity', v ? parseInt(v) || null : null)} keyboardType="number-pad" />
      <FormField label="Hours" placeholder="e.g. 8am–10pm daily" value={draft.hours_text ?? ''} onChange={v => onChange('hours_text', v)} />
      <FormField label="Notes" placeholder="Additional info" value={draft.notes ?? ''} onChange={v => onChange('notes', v)} multiline />

      <View style={sf.toggleRow}>
        <View style={sf.toggleItem}>
          <Text style={sf.toggleLabel}>Wudu Available</Text>
          <Switch
            value={draft.wudu_available}
            onValueChange={v => onChange('wudu_available', v)}
            trackColor={{ false: Brand.hairline, true: Brand.green }}
            thumbColor="#fff"
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>
        <View style={sf.toggleItem}>
          <Text style={sf.toggleLabel}>Sisters Space</Text>
          <Switch
            value={draft.sisters_space}
            onValueChange={v => onChange('sisters_space', v)}
            trackColor={{ false: Brand.hairline, true: '#9D174D' }}
            thumbColor="#fff"
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>
        <View style={sf.toggleItem}>
          <Text style={sf.toggleLabel}>Active</Text>
          <Switch
            value={draft.is_active}
            onValueChange={v => onChange('is_active', v)}
            trackColor={{ false: Brand.hairline, true: Brand.green }}
            thumbColor="#fff"
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>
      </View>

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
              : <Text style={sf.saveBtnText}>{isNew ? 'Add Space' : 'Save'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function FormField({ label, placeholder, value, onChange, multiline, keyboardType }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; multiline?: boolean;
  keyboardType?: 'default' | 'number-pad';
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
        keyboardType={keyboardType ?? 'default'}
        returnKeyType={multiline ? 'default' : 'next'}
        textAlignVertical={multiline ? 'top' : 'center'}
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
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Brand.hairline,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnActive: { backgroundColor: Brand.cream, borderColor: Brand.deepGreen },

  scroll: { padding: Spacing.md, gap: Spacing.md },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Brand.textDark },
  emptyBody:  { fontSize: 13, color: Brand.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline, overflow: 'hidden',
  },
  inactiveCard: { opacity: 0.6 },
  newCard: { borderColor: Brand.deepGreen, borderWidth: 1.5 },
  newCardLabel: {
    paddingHorizontal: Spacing.md, paddingTop: 12, paddingBottom: 4,
  },
  newCardLabelText: { fontSize: 11, fontWeight: '700', color: Brand.deepGreen, letterSpacing: 0.5 },
  cardDivider: { height: 1, backgroundColor: Brand.hairline },

  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 13, gap: 10,
  },
  cardIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EFF6F1', alignItems: 'center', justifyContent: 'center',
  },
  cardInfo:   { flex: 1 },
  cardName:   { fontSize: 15, fontWeight: '700', color: Brand.textDark },
  cardSub:    { fontSize: 12, color: Brand.textMuted, marginTop: 2 },
  cardBadges: { flexDirection: 'row', gap: 4 },
  badge: {
    backgroundColor: '#E8F4FF', borderRadius: Radius.chip,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  badgeText:        { fontSize: 10, fontWeight: '700', color: '#1D4ED8' },
  badgeSisters:     { backgroundColor: '#FDF2F8' },
  badgeSistersText: { color: '#9D174D' },
});

const sf = StyleSheet.create({
  form: { padding: Spacing.md, gap: 12 },
  row:  { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: Brand.textMuted, letterSpacing: 0.8 },
  input: {
    backgroundColor: Brand.cream, borderRadius: Radius.input,
    borderWidth: 1, borderColor: Brand.hairline,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: Brand.textDark,
  },
  inputMulti: { height: 70, textAlignVertical: 'top' },
  toggleRow:  { flexDirection: 'row', gap: 0 },
  toggleItem: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: 8,
  },
  toggleLabel: { fontSize: 11, fontWeight: '600', color: Brand.textDark, textAlign: 'center' },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingTop: 4,
  },
  rightActions: { flexDirection: 'row', gap: 8 },
  deleteBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  deleteBtnText:{ fontSize: 13, color: Brand.red, fontWeight: '500' },
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
  disabled:    { opacity: 0.6 },
});
