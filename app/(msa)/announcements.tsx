/**
 * (msa)/announcements.tsx
 *
 * MSA admin announcements. Inline create (tap "+") and inline edit (tap to expand).
 */

import { useCallback, useRef, useState } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { Brand, Spacing, Radius } from '../../lib/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  is_published: boolean;
  created_at: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AnnouncementsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const { user } = useAuth();
  const msaId = activeMembership?.msaId ?? '';

  const [items,      setItems]      = useState<Announcement[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [addingNew,  setAddingNew]  = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving,     setSaving]     = useState<string | null>(null);

  // New item draft
  const [newTitle,     setNewTitle]     = useState('');
  const [newBody,      setNewBody]      = useState('');
  const [newPublished, setNewPublished] = useState(false);

  // Edit drafts keyed by id
  const [editDrafts, setEditDrafts] = useState<Record<string, Partial<Announcement>>>({});

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!msaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('campus_announcements')
      .select('id, title, body, is_published, created_at')
      .eq('msa_id', msaId)
      .order('created_at', { ascending: false });

    if (error) Alert.alert('Error', error.message);
    else setItems((data ?? []) as Announcement[]);
    setLoading(false);
  }, [msaId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newTitle.trim()) { Alert.alert('Required', 'Please enter a title.'); return; }
    setSaving('new');
    const { error } = await supabase.from('campus_announcements').insert({
      msa_id:       msaId,
      created_by:   user?.id,
      title:        newTitle.trim(),
      body:         newBody.trim() || null,
      is_published: newPublished,
    });
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setAddingNew(false);
    setNewTitle(''); setNewBody(''); setNewPublished(false);
    load();
  };

  const handleCancelNew = () => {
    setAddingNew(false);
    setNewTitle(''); setNewBody(''); setNewPublished(false);
  };

  // ── Expand / Edit ─────────────────────────────────────────────────────────

  const handleExpand = (item: Announcement) => {
    if (expandedId === item.id) { setExpandedId(null); return; }
    setExpandedId(item.id);
    setEditDrafts(prev => ({
      ...prev,
      [item.id]: { title: item.title, body: item.body ?? '', is_published: item.is_published },
    }));
  };

  const setDraftField = (id: string, field: keyof Announcement, value: any) => {
    setEditDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleUpdate = async (item: Announcement) => {
    const draft = editDrafts[item.id];
    if (!draft?.title?.trim()) { Alert.alert('Required', 'Title cannot be empty.'); return; }
    setSaving(item.id);
    const { error } = await supabase.from('campus_announcements').update({
      title:        draft.title?.trim(),
      body:         (draft.body as string)?.trim() || null,
      is_published: draft.is_published ?? item.is_published,
    }).eq('id', item.id);
    setSaving(null);
    if (error) { Alert.alert('Error', error.message); return; }
    setExpandedId(null);
    load();
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = (item: Announcement) => {
    Alert.alert(
      'Delete Announcement',
      `Remove "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('campus_announcements').delete().eq('id', item.id);
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
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Announcements</Text>
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
                  <Text style={s.newCardTitle}>New Announcement</Text>
                </View>
                <TextInput
                  style={s.newTitleInput}
                  placeholder="Title"
                  placeholderTextColor={Brand.textMuted}
                  value={newTitle}
                  onChangeText={setNewTitle}
                  autoFocus
                  returnKeyType="next"
                />
                <View style={s.cardDivider} />
                <TextInput
                  style={s.newBodyInput}
                  placeholder="Body (optional)"
                  placeholderTextColor={Brand.textMuted}
                  value={newBody}
                  onChangeText={setNewBody}
                  multiline
                  textAlignVertical="top"
                />
                <View style={s.cardDivider} />
                <View style={s.newFooter}>
                  <View style={s.publishRow}>
                    <Text style={s.publishLabel}>Publish now</Text>
                    <Switch
                      value={newPublished}
                      onValueChange={setNewPublished}
                      trackColor={{ false: Brand.hairline, true: Brand.green }}
                      thumbColor="#fff"
                      style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    />
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
                <Ionicons name="megaphone-outline" size={38} color={Brand.textMuted} />
                <Text style={s.emptyTitle}>No announcements yet</Text>
                <Text style={s.emptyBody}>Tap "+" above to post your first announcement.</Text>
              </View>
            )}

            {/* Announcement list */}
            {items.map(item => {
              const draft = editDrafts[item.id];
              const expanded = expandedId === item.id;
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
                        <Text style={s.itemTitle} numberOfLines={expanded ? undefined : 1}>{item.title}</Text>
                        <Text style={s.itemMeta}>
                          {item.is_published ? 'Published' : 'Draft'} · {formatDate(item.created_at)}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={16} color={Brand.textMuted}
                    />
                  </TouchableOpacity>

                  {!expanded && item.body && (
                    <Text style={s.itemPreview} numberOfLines={2}>{item.body}</Text>
                  )}

                  {expanded && draft && (
                    <>
                      <View style={s.cardDivider} />
                      <View style={s.editBlock}>
                        <Text style={s.editFieldLabel}>TITLE</Text>
                        <TextInput
                          style={s.editTitleInput}
                          value={draft.title ?? ''}
                          onChangeText={v => setDraftField(item.id, 'title', v)}
                          placeholderTextColor={Brand.textMuted}
                        />
                      </View>
                      <View style={s.cardDivider} />
                      <View style={s.editBlock}>
                        <Text style={s.editFieldLabel}>BODY</Text>
                        <TextInput
                          style={s.editBodyInput}
                          value={(draft.body as string) ?? ''}
                          onChangeText={v => setDraftField(item.id, 'body', v)}
                          placeholder="Body (optional)"
                          placeholderTextColor={Brand.textMuted}
                          multiline
                          textAlignVertical="top"
                        />
                      </View>
                      <View style={s.cardDivider} />
                      <View style={s.editFooter}>
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline, overflow: 'hidden',
  },
  newCard: { borderColor: Brand.deepGreen, borderWidth: 1.5 },
  cardDivider: { height: 1, backgroundColor: Brand.hairline },

  // New card
  newCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 8,
  },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.deepGreen },
  newCardTitle: { fontSize: 12, fontWeight: '700', color: Brand.deepGreen, letterSpacing: 0.5 },
  newTitleInput: {
    fontSize: 16, fontWeight: '700', color: Brand.textDark,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  newBodyInput: {
    fontSize: 14, color: Brand.textDark, lineHeight: 20,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    minHeight: 80,
  },
  newFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  publishRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  publishLabel:{ fontSize: 13, fontWeight: '500', color: Brand.textDark },
  newActions:  { flexDirection: 'row', gap: 8 },

  // Item
  itemHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 13, gap: 10,
  },
  itemHeaderLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 10 },
  statusDot:      { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  itemTitle:      { fontSize: 14, fontWeight: '700', color: Brand.textDark, lineHeight: 20 },
  itemMeta:       { fontSize: 12, color: Brand.textMuted, marginTop: 2 },
  itemPreview: {
    fontSize: 13, color: Brand.textMuted, lineHeight: 18,
    paddingHorizontal: Spacing.md, paddingBottom: 12,
    paddingLeft: 34, // align with title
  },

  // Edit block
  editBlock: { paddingHorizontal: Spacing.md, paddingVertical: 10 },
  editFieldLabel: {
    fontSize: 10, fontWeight: '700', color: Brand.textMuted,
    letterSpacing: 0.8, marginBottom: 6,
  },
  editTitleInput: {
    fontSize: 15, fontWeight: '700', color: Brand.textDark, paddingVertical: 0,
  },
  editBodyInput: {
    fontSize: 14, color: Brand.textDark, lineHeight: 20,
    minHeight: 80, paddingVertical: 0,
  },
  editFooter: {
    paddingHorizontal: Spacing.md, paddingVertical: 10, gap: 10,
  },
  editActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  editRightActions: { flexDirection: 'row', gap: 8 },
  deleteLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteLinkText: { fontSize: 13, color: Brand.red, fontWeight: '500' },

  // Shared buttons
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
