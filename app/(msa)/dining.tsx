/**
 * (msa)/dining.tsx
 *
 * MSA admin — daily halal dining updates.
 * Inline create (tap "+") and inline edit (tap to expand).
 * Each update has: dining hall name, date, halal items (free text), optional notes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useMsa } from '../../contexts/MsaContext';
import { useAuth } from '../../contexts/AuthContext';
import { Brand, Spacing, Radius } from '../../lib/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DiningUpdate {
  id: string;
  dining_hall: string;
  date: string;        // ISO date "YYYY-MM-DD"
  items: string;
  notes: string | null;
  is_published: boolean;
  created_at: string;
}

const EMPTY_NEW = { dining_hall: '', date: todayISO(), items: '', notes: '', is_published: false, notify_followers: false };

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DiningScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const { user } = useAuth();
  const msaId = activeMembership?.msaId ?? '';
  const { openNew } = useLocalSearchParams<{ openNew?: string }>();

  const [items,      setItems]      = useState<DiningUpdate[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [addingNew,  setAddingNew]  = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving,     setSaving]     = useState<string | null>(null);

  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [editDrafts, setEditDrafts] = useState<Record<string, Partial<DiningUpdate>>>({});

  useEffect(() => {
    if (openNew === '1') setAddingNew(true);
  }, []);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!msaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('campus_dining_updates')
      .select('id, dining_hall, date, items, notes, is_published, created_at')
      .eq('msa_id', msaId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) Alert.alert('Error', error.message);
    else setItems((data ?? []) as DiningUpdate[]);
    setLoading(false);
  }, [msaId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newForm.dining_hall.trim()) { Alert.alert('Required', 'Please enter the dining hall name.'); return; }
    if (!newForm.items.trim())       { Alert.alert('Required', 'Please enter the halal items.'); return; }
    if (!newForm.date)               { Alert.alert('Required', 'Please enter a date.'); return; }
    setSaving('new');
    const { error } = await supabase.from('campus_dining_updates').insert({
      msa_id:          msaId,
      created_by:      user?.id,
      dining_hall:     newForm.dining_hall.trim(),
      date:            newForm.date,
      items:           newForm.items.trim(),
      notes:           newForm.notes.trim() || null,
      is_published:    newForm.is_published,
      notify_followers: newForm.notify_followers,
    });
    if (!error && newForm.is_published && newForm.notify_followers) {
      const uniId = activeMembership?.universityId;
      if (uniId) {
        supabase.functions.invoke('notify-campus-followers', {
          body: {
            msaId,
            category: 'dining',
            title: `${newForm.dining_hall.trim()} — Halal Dining`,
            body: newForm.items.trim().slice(0, 100),
          },
        });
      }
    }
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setAddingNew(false);
    setNewForm(EMPTY_NEW);
    load();
  };

  const handleCancelNew = () => {
    setAddingNew(false);
    setNewForm(EMPTY_NEW);
  };

  // ── Expand / Edit ──────────────────────────────────────────────────────────

  const handleExpand = (item: DiningUpdate) => {
    if (expandedId === item.id) { setExpandedId(null); return; }
    setExpandedId(item.id);
    setEditDrafts(prev => ({
      ...prev,
      [item.id]: {
        dining_hall:      item.dining_hall,
        date:             item.date,
        items:            item.items,
        notes:            item.notes ?? '',
        is_published:     item.is_published,
        notify_followers: false,
      },
    }));
  };

  const setDraftField = (id: string, field: keyof DiningUpdate, value: any) => {
    setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleUpdate = async (item: DiningUpdate) => {
    const draft = editDrafts[item.id];
    if (!draft?.dining_hall?.toString().trim()) { Alert.alert('Required', 'Dining hall name cannot be empty.'); return; }
    if (!draft?.items?.toString().trim())        { Alert.alert('Required', 'Items cannot be empty.'); return; }
    const isPublished    = draft.is_published ?? item.is_published;
    const notifyFollowers = draft.notify_followers ?? false;
    setSaving(item.id);
    const { error } = await supabase.from('campus_dining_updates').update({
      dining_hall:  draft.dining_hall?.toString().trim(),
      date:         draft.date ?? item.date,
      items:        draft.items?.toString().trim(),
      notes:        (draft.notes as string)?.trim() || null,
      is_published: isPublished,
    }).eq('id', item.id);
    if (!error && isPublished && notifyFollowers) {
      supabase.functions.invoke('notify-campus-followers', {
        body: {
          msaId,
          category: 'dining',
          title: `${draft.dining_hall?.toString().trim()} — Halal Dining`,
          body: draft.items?.toString().trim().slice(0, 100),
        },
      });
    }
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setExpandedId(null);
    load();
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = (item: DiningUpdate) => {
    Alert.alert(
      'Delete Update',
      `Remove the dining update for "${item.dining_hall}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('campus_dining_updates').delete().eq('id', item.id);
            if (error) { Alert.alert('Error', error.message); return; }
            setExpandedId(null);
            load();
          },
        },
      ],
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Dining Updates</Text>
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
            {/* Inline create card */}
            {addingNew && (
              <View style={[s.card, s.newCard]}>
                <View style={s.newCardHeader}>
                  <View style={s.newDot} />
                  <Text style={s.newCardTitle}>New Dining Update</Text>
                </View>

                <TextInput
                  style={s.newTitleInput}
                  placeholder="Dining Hall (e.g. North Dining Hall)"
                  placeholderTextColor={Brand.textMuted}
                  value={newForm.dining_hall}
                  onChangeText={v => setNewForm(p => ({ ...p, dining_hall: v }))}
                  autoFocus
                  returnKeyType="next"
                />
                <View style={s.cardDivider} />

                <TextInput
                  style={s.newTitleInput}
                  placeholder="Date (YYYY-MM-DD)"
                  placeholderTextColor={Brand.textMuted}
                  value={newForm.date}
                  onChangeText={v => setNewForm(p => ({ ...p, date: v }))}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="next"
                />
                <View style={s.cardDivider} />

                <TextInput
                  style={s.newBodyInput}
                  placeholder={"Halal items today:\n• Grilled Chicken\n• Rice\n• Lentil Soup"}
                  placeholderTextColor={Brand.textMuted}
                  value={newForm.items}
                  onChangeText={v => setNewForm(p => ({ ...p, items: v }))}
                  multiline
                  textAlignVertical="top"
                />
                <View style={s.cardDivider} />

                <TextInput
                  style={[s.newBodyInput, { minHeight: 48 }]}
                  placeholder="Notes (optional — hours, station, etc.)"
                  placeholderTextColor={Brand.textMuted}
                  value={newForm.notes}
                  onChangeText={v => setNewForm(p => ({ ...p, notes: v }))}
                  multiline
                  textAlignVertical="top"
                />
                <View style={s.cardDivider} />

                <View style={s.newFooter}>
                  <View style={s.publishToggles}>
                    <View style={s.publishRow}>
                      <Text style={s.publishLabel}>Publish now</Text>
                      <Switch
                        value={newForm.is_published}
                        onValueChange={v => setNewForm(p => ({ ...p, is_published: v }))}
                        trackColor={{ false: Brand.hairline, true: Brand.green }}
                        thumbColor="#fff"
                        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                      />
                    </View>
                    {newForm.is_published && (
                      <View style={s.publishRow}>
                        <Text style={s.publishLabel}>Notify followers</Text>
                        <Switch
                          value={newForm.notify_followers}
                          onValueChange={v => setNewForm(p => ({ ...p, notify_followers: v }))}
                          trackColor={{ false: Brand.hairline, true: Brand.green }}
                          thumbColor="#fff"
                          style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                        />
                      </View>
                    )}
                  </View>
                  <View style={s.newActions}>
                    <TouchableOpacity onPress={handleCancelNew} style={s.cancelBtn} activeOpacity={0.8}>
                      <Text style={s.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCreate}
                      style={[s.saveBtn, saving === 'new' && s.disabled]}
                      disabled={saving === 'new'}
                      activeOpacity={0.8}
                    >
                      {saving === 'new'
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.saveBtnText}>Post</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Empty state */}
            {items.length === 0 && !addingNew && (
              <View style={s.empty}>
                <Ionicons name="restaurant-outline" size={38} color={Brand.textMuted} />
                <Text style={s.emptyTitle}>No dining updates yet</Text>
                <Text style={s.emptyBody}>Tap "+" above to post today's halal options.</Text>
              </View>
            )}

            {/* Dining update list */}
            {items.map(item => {
              const draft    = editDrafts[item.id];
              const expanded = expandedId === item.id;
              const isToday  = item.date === todayISO();
              return (
                <View key={item.id} style={s.card}>
                  <TouchableOpacity
                    style={s.itemHeader}
                    onPress={() => handleExpand(item)}
                    activeOpacity={0.8}
                  >
                    <View style={s.itemHeaderLeft}>
                      <View style={[s.statusDot, { backgroundColor: item.is_published ? Brand.green : Brand.amber }]} />
                      <View style={s.flex1}>
                        <View style={s.itemTitleRow}>
                          <Text style={s.itemTitle} numberOfLines={1}>{item.dining_hall}</Text>
                          {isToday && (
                            <View style={s.todayBadge}>
                              <Text style={s.todayBadgeText}>Today</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.itemMeta}>
                          {item.is_published ? 'Published' : 'Draft'} · {formatDisplayDate(item.date)} · Posted {formatCreatedAt(item.created_at)}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Brand.textMuted} />
                  </TouchableOpacity>

                  {!expanded && (
                    <Text style={s.itemPreview} numberOfLines={3}>{item.items}</Text>
                  )}

                  {expanded && draft && (
                    <>
                      <View style={s.cardDivider} />
                      <View style={s.editBlock}>
                        <Text style={s.editFieldLabel}>DINING HALL</Text>
                        <TextInput
                          style={s.editTitleInput}
                          value={draft.dining_hall?.toString() ?? ''}
                          onChangeText={v => setDraftField(item.id, 'dining_hall', v)}
                          placeholderTextColor={Brand.textMuted}
                        />
                      </View>
                      <View style={s.cardDivider} />
                      <View style={s.editBlock}>
                        <Text style={s.editFieldLabel}>DATE (YYYY-MM-DD)</Text>
                        <TextInput
                          style={s.editTitleInput}
                          value={draft.date?.toString() ?? ''}
                          onChangeText={v => setDraftField(item.id, 'date', v)}
                          keyboardType="numbers-and-punctuation"
                          placeholderTextColor={Brand.textMuted}
                        />
                      </View>
                      <View style={s.cardDivider} />
                      <View style={s.editBlock}>
                        <Text style={s.editFieldLabel}>HALAL ITEMS</Text>
                        <TextInput
                          style={s.editBodyInput}
                          value={draft.items?.toString() ?? ''}
                          onChangeText={v => setDraftField(item.id, 'items', v)}
                          multiline
                          textAlignVertical="top"
                          placeholderTextColor={Brand.textMuted}
                        />
                      </View>
                      <View style={s.cardDivider} />
                      <View style={s.editBlock}>
                        <Text style={s.editFieldLabel}>NOTES (OPTIONAL)</Text>
                        <TextInput
                          style={[s.editBodyInput, { minHeight: 48 }]}
                          value={(draft.notes as string) ?? ''}
                          onChangeText={v => setDraftField(item.id, 'notes', v)}
                          placeholder="Hours, station, etc."
                          placeholderTextColor={Brand.textMuted}
                          multiline
                          textAlignVertical="top"
                        />
                      </View>
                      <View style={s.cardDivider} />
                      <View style={s.editFooter}>
                        <View style={s.publishToggles}>
                          <View style={s.publishRow}>
                            <Text style={s.publishLabel}>Published</Text>
                            <Switch
                              value={draft.is_published ?? false}
                              onValueChange={v => setDraftField(item.id, 'is_published', v)}
                              trackColor={{ false: Brand.hairline, true: Brand.green }}
                              thumbColor="#fff"
                              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                            />
                          </View>
                          {(draft.is_published ?? false) && (
                            <View style={s.publishRow}>
                              <Text style={s.publishLabel}>Notify followers</Text>
                              <Switch
                                value={(draft.notify_followers as boolean) ?? false}
                                onValueChange={v => setDraftField(item.id, 'notify_followers', v)}
                                trackColor={{ false: Brand.hairline, true: Brand.green }}
                                thumbColor="#fff"
                                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                              />
                            </View>
                          )}
                        </View>
                        <View style={s.editActions}>
                          <TouchableOpacity onPress={() => handleDelete(item)} style={s.deleteLink} activeOpacity={0.8}>
                            <Ionicons name="trash-outline" size={15} color={Brand.red} />
                            <Text style={s.deleteLinkText}>Delete</Text>
                          </TouchableOpacity>
                          <View style={s.editRightActions}>
                            <TouchableOpacity onPress={() => setExpandedId(null)} style={s.cancelBtn} activeOpacity={0.8}>
                              <Text style={s.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleUpdate(item)}
                              style={[s.saveBtn, saving === item.id && s.disabled]}
                              disabled={saving === item.id}
                              activeOpacity={0.8}
                            >
                              {saving === item.id
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={s.saveBtnText}>Save</Text>}
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
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

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Brand.cream },
  flex:    { flex: 1 },
  flex1:   { flex: 1 },
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
  newCard:     { borderColor: Brand.deepGreen, borderWidth: 1.5 },
  cardDivider: { height: 1, backgroundColor: Brand.hairline },

  newCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 8,
  },
  newDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.deepGreen },
  newCardTitle: { fontSize: 12, fontWeight: '700', color: Brand.deepGreen, letterSpacing: 0.5 },
  newTitleInput: {
    fontSize: 15, fontWeight: '600', color: Brand.textDark,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  newBodyInput: {
    fontSize: 14, color: Brand.textDark, lineHeight: 20,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    minHeight: 90,
  },
  newFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  publishToggles: { gap: 6 },
  publishRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  publishLabel: { fontSize: 13, fontWeight: '500', color: Brand.textDark },
  newActions:   { flexDirection: 'row', gap: 8 },

  itemHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 13, gap: 10,
  },
  itemHeaderLeft:  { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 10 },
  statusDot:       { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  itemTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemTitle:       { fontSize: 14, fontWeight: '700', color: Brand.textDark, lineHeight: 20 },
  todayBadge: {
    backgroundColor: '#fff7ed', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  todayBadgeText:  { fontSize: 11, fontWeight: '700', color: '#ea580c' },
  itemMeta:        { fontSize: 12, color: Brand.textMuted, marginTop: 2 },
  itemPreview: {
    fontSize: 13, color: Brand.textMuted, lineHeight: 18,
    paddingHorizontal: Spacing.md, paddingBottom: 12,
    paddingLeft: 34,
  },

  editBlock:      { paddingHorizontal: Spacing.md, paddingVertical: 10 },
  editFieldLabel: {
    fontSize: 10, fontWeight: '700', color: Brand.textMuted,
    letterSpacing: 0.8, marginBottom: 6,
  },
  editTitleInput: { fontSize: 15, fontWeight: '600', color: Brand.textDark, paddingVertical: 0 },
  editBodyInput:  {
    fontSize: 14, color: Brand.textDark, lineHeight: 20,
    minHeight: 80, paddingVertical: 0,
  },
  editFooter: { paddingHorizontal: Spacing.md, paddingVertical: 10, gap: 10 },
  editActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  editRightActions: { flexDirection: 'row', gap: 8 },
  deleteLink:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteLinkText:   { fontSize: 13, color: Brand.red, fontWeight: '500' },

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
