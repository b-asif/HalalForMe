/**
 * (msa)/resources.tsx
 *
 * MSA admin resources. Grouped by category with inline create, edit,
 * up/down reordering, and delete with confirmation.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useMsa } from '../../contexts/MsaContext';
import { Brand, Spacing, Radius } from '../../lib/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

const CATEGORIES = ['halal_food', 'prayer', 'spiritual', 'social', 'academic', 'other'] as const;
type Category = typeof CATEGORIES[number];

const CAT_LABELS: Record<Category, string> = {
  halal_food: 'Halal Food',
  prayer:     'Prayer',
  spiritual:  'Spiritual',
  social:     'Social',
  academic:   'Academic',
  other:      'Other',
};

const CAT_COLORS: Record<Category, { bg: string; text: string }> = {
  halal_food: { bg: '#FFF7ED', text: '#9A3412' },
  prayer:     { bg: '#F0FDF4', text: '#166534' },
  spiritual:  { bg: '#EEF2FF', text: '#4338CA' },
  social:     { bg: '#F5F3FF', text: '#6D28D9' },
  academic:   { bg: '#EFF6FF', text: '#1D4ED8' },
  other:      { bg: Brand.cream, text: Brand.textMuted },
};

interface Resource {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  url: string | null;
  address: string | null;
  is_active: boolean;
  position: number;
}

type ResourceDraft = Omit<Resource, 'id'>;

function emptyDraft(position: number): ResourceDraft {
  return {
    title: '', description: '', category: 'other',
    url: '', address: '', is_active: true, position,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ResourcesScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const msaId = activeMembership?.msaId ?? '';

  const [resources,  setResources]  = useState<Resource[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [addingNew,  setAddingNew]  = useState(false);
  const [newDraft,   setNewDraft]   = useState<ResourceDraft>(emptyDraft(0));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, ResourceDraft>>({});
  const [saving,     setSaving]     = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!msaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('campus_resources')
      .select('*')
      .eq('msa_id', msaId)
      .order('position', { ascending: true });

    if (error) Alert.alert('Error', error.message);
    else setResources((data ?? []) as Resource[]);
    setLoading(false);
  }, [msaId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newDraft.title.trim()) { Alert.alert('Required', 'Title is required.'); return; }
    setSaving('new');
    const { error } = await supabase.from('campus_resources').insert({
      msa_id:      msaId,
      title:       newDraft.title.trim(),
      description: newDraft.description?.trim() || null,
      category:    newDraft.category,
      url:         newDraft.url?.trim()         || null,
      address:     newDraft.address?.trim()     || null,
      is_active:   newDraft.is_active,
      position:    resources.length,
    });
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setAddingNew(false);
    setNewDraft(emptyDraft(0));
    load();
  };

  // ── Expand / Edit ─────────────────────────────────────────────────────────

  const handleExpand = (r: Resource) => {
    if (expandedId === r.id) { setExpandedId(null); return; }
    setExpandedId(r.id);
    setEditDrafts(prev => ({ ...prev, [r.id]: { ...r } }));
  };

  const setField = (id: string, field: keyof ResourceDraft, value: any) => {
    setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleUpdate = async (id: string) => {
    const d = editDrafts[id];
    if (!d?.title?.trim()) { Alert.alert('Required', 'Title is required.'); return; }
    setSaving(id);
    const { error } = await supabase.from('campus_resources').update({
      title:       d.title.trim(),
      description: d.description?.trim() || null,
      category:    d.category,
      url:         d.url?.trim()         || null,
      address:     d.address?.trim()     || null,
      is_active:   d.is_active,
    }).eq('id', id);
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setExpandedId(null);
    load();
  };

  // ── Reorder ───────────────────────────────────────────────────────────────

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= resources.length) return;

    const next = [...resources];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];

    // Optimistic update
    setResources(next);

    // Persist positions
    await Promise.all([
      supabase.from('campus_resources').update({ position: swapIndex }).eq('id', next[swapIndex].id),
      supabase.from('campus_resources').update({ position: index   }).eq('id', next[index].id),
    ]);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = (r: Resource) => {
    Alert.alert(
      'Delete Resource',
      `Remove "${r.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('campus_resources').delete().eq('id', r.id);
            if (error) { Alert.alert('Error', error.message); return; }
            setExpandedId(null);
            load();
          },
        },
      ],
    );
  };

  // ── Group by category ─────────────────────────────────────────────────────

  const grouped = CATEGORIES.reduce<Record<Category, Resource[]>>((acc, cat) => {
    acc[cat] = resources.filter(r => r.category === cat);
    return acc;
  }, {} as any);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Resources</Text>
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
                  <Text style={s.newCardLabelText}>New Resource</Text>
                </View>
                <ResourceForm
                  draft={newDraft}
                  onChange={(f, v) => setNewDraft(prev => ({ ...prev, [f]: v }))}
                  onSave={handleCreate}
                  onCancel={() => { setAddingNew(false); setNewDraft(emptyDraft(0)); }}
                  saving={saving === 'new'}
                  isNew
                />
              </View>
            )}

            {/* Empty state */}
            {resources.length === 0 && !addingNew && (
              <View style={s.empty}>
                <Ionicons name="link-outline" size={38} color={Brand.textMuted} />
                <Text style={s.emptyTitle}>No resources added</Text>
                <Text style={s.emptyBody}>Add helpful links, addresses, and tips for your MSA members.</Text>
              </View>
            )}

            {/* Grouped sections */}
            {CATEGORIES.map(cat => {
              const catResources = grouped[cat];
              if (catResources.length === 0) return null;
              const { bg, text } = CAT_COLORS[cat];
              return (
                <View key={cat}>
                  <View style={s.catHeader}>
                    <View style={[s.catChip, { backgroundColor: bg }]}>
                      <Text style={[s.catChipText, { color: text }]}>{CAT_LABELS[cat]}</Text>
                    </View>
                    <Text style={s.catCount}>{catResources.length}</Text>
                  </View>
                  <View style={s.card}>
                    {catResources.map((r, idx) => {
                      const expanded = expandedId === r.id;
                      const draft    = editDrafts[r.id];
                      const globalIdx = resources.findIndex(x => x.id === r.id);
                      return (
                        <View key={r.id}>
                          {idx > 0 && <View style={s.cardDivider} />}
                          <View style={s.resourceRow}>
                            <TouchableOpacity
                              style={s.resourceMain}
                              onPress={() => handleExpand(r)}
                              activeOpacity={0.8}
                            >
                              <View style={s.resourceInfo}>
                                <Text style={s.resourceTitle} numberOfLines={1}>{r.title}</Text>
                                {r.description && (
                                  <Text style={s.resourceDesc} numberOfLines={1}>{r.description}</Text>
                                )}
                                {r.url && (
                                  <Text style={s.resourceUrl} numberOfLines={1}>{r.url}</Text>
                                )}
                              </View>
                              <Ionicons
                                name={expanded ? 'chevron-up' : 'chevron-down'}
                                size={15} color={Brand.textMuted}
                              />
                            </TouchableOpacity>
                            <View style={s.reorderBtns}>
                              <TouchableOpacity
                                style={[s.reorderBtn, globalIdx === 0 && s.reorderBtnDisabled]}
                                onPress={() => handleMove(globalIdx, 'up')}
                                disabled={globalIdx === 0}
                                hitSlop={8}
                              >
                                <Ionicons name="chevron-up" size={14} color={globalIdx === 0 ? Brand.hairline : Brand.textMuted} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[s.reorderBtn, globalIdx === resources.length - 1 && s.reorderBtnDisabled]}
                                onPress={() => handleMove(globalIdx, 'down')}
                                disabled={globalIdx === resources.length - 1}
                                hitSlop={8}
                              >
                                <Ionicons name="chevron-down" size={14} color={globalIdx === resources.length - 1 ? Brand.hairline : Brand.textMuted} />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {expanded && draft && (
                            <>
                              <View style={s.cardDivider} />
                              <ResourceForm
                                draft={draft}
                                onChange={(f, v) => setField(r.id, f as keyof ResourceDraft, v)}
                                onSave={() => handleUpdate(r.id)}
                                onCancel={() => setExpandedId(null)}
                                onDelete={() => handleDelete(r)}
                                saving={saving === r.id}
                              />
                            </>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ── Resource Form ─────────────────────────────────────────────────────────────

function ResourceForm({ draft, onChange, onSave, onCancel, onDelete, saving, isNew }: {
  draft: ResourceDraft;
  onChange: (field: string, value: any) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
  isNew?: boolean;
}) {
  return (
    <View style={rf.form}>
      <RFField label="Title *" placeholder="Resource name" value={draft.title} onChange={v => onChange('title', v)} />
      <RFField label="Description" placeholder="Brief description" value={draft.description ?? ''} onChange={v => onChange('description', v)} multiline />
      <RFField label="URL" placeholder="https://" value={draft.url ?? ''} onChange={v => onChange('url', v)} keyboardType="url" />
      <RFField label="Address" placeholder="Street address (optional)" value={draft.address ?? ''} onChange={v => onChange('address', v)} />

      {/* Category picker */}
      <View style={rf.field}>
        <Text style={rf.fieldLabel}>CATEGORY</Text>
        <View style={rf.catGrid}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[rf.catChip, draft.category === cat && rf.catChipActive]}
              onPress={() => onChange('category', cat)}
              activeOpacity={0.75}
            >
              <Text style={[rf.catChipText, draft.category === cat && rf.catChipTextActive]}>
                {CAT_LABELS[cat]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={rf.actions}>
        {onDelete && (
          <TouchableOpacity onPress={onDelete} style={rf.deleteBtn} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={15} color={Brand.red} />
            <Text style={rf.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        )}
        <View style={rf.rightActions}>
          <TouchableOpacity onPress={onCancel} style={rf.cancelBtn} activeOpacity={0.8}>
            <Text style={rf.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSave}
            style={[rf.saveBtn, saving && rf.disabled]}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={rf.saveBtnText}>{isNew ? 'Add' : 'Save'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function RFField({ label, placeholder, value, onChange, multiline, keyboardType }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; multiline?: boolean;
  keyboardType?: 'default' | 'url';
}) {
  return (
    <View style={rf.field}>
      <Text style={rf.fieldLabel}>{label}</Text>
      <TextInput
        style={[rf.input, multiline && rf.inputMulti]}
        placeholder={placeholder}
        placeholderTextColor={Brand.textMuted}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'}
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

  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  catChip: {
    borderRadius: Radius.chip, paddingHorizontal: 10, paddingVertical: 4,
  },
  catChipText:  { fontSize: 12, fontWeight: '700' },
  catCount:     { fontSize: 12, color: Brand.textMuted },

  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline, overflow: 'hidden',
  },
  newCard: { borderColor: Brand.deepGreen, borderWidth: 1.5 },
  newCardLabel: { paddingHorizontal: Spacing.md, paddingTop: 12, paddingBottom: 0 },
  newCardLabelText: { fontSize: 11, fontWeight: '700', color: Brand.deepGreen, letterSpacing: 0.5 },
  cardDivider: { height: 1, backgroundColor: Brand.hairline },

  resourceRow:  { flexDirection: 'row', alignItems: 'stretch' },
  resourceMain: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 13, gap: 10,
  },
  resourceInfo: { flex: 1 },
  resourceTitle:{ fontSize: 14, fontWeight: '700', color: Brand.textDark },
  resourceDesc: { fontSize: 12, color: Brand.textMuted, marginTop: 2 },
  resourceUrl:  { fontSize: 11, color: Brand.green, marginTop: 2 },
  reorderBtns: {
    borderLeftWidth: 1, borderLeftColor: Brand.hairline,
    justifyContent: 'center', gap: 0,
    paddingHorizontal: 6,
  },
  reorderBtn:        { padding: 4 },
  reorderBtnDisabled:{ opacity: 0.3 },
});

const rf = StyleSheet.create({
  form:    { padding: Spacing.md, gap: 12 },
  field:   { gap: 5 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: Brand.textMuted, letterSpacing: 0.8 },
  input: {
    backgroundColor: Brand.cream, borderRadius: Radius.input,
    borderWidth: 1, borderColor: Brand.hairline,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: Brand.textDark,
  },
  inputMulti: { height: 60, textAlignVertical: 'top' },
  catGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.chip, borderWidth: 1.5, borderColor: Brand.hairline,
    backgroundColor: '#fff',
  },
  catChipActive:     { borderColor: Brand.deepGreen, backgroundColor: Brand.deepGreen },
  catChipText:       { fontSize: 12, fontWeight: '600', color: Brand.textMuted },
  catChipTextActive: { color: '#fff' },
  actions:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  rightActions:   { flexDirection: 'row', gap: 8 },
  deleteBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  deleteBtnText:  { fontSize: 13, color: Brand.red, fontWeight: '500' },
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
