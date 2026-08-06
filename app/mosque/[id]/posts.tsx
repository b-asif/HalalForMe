import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Brand } from '../../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const RED        = Brand.red;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const EVENT_CATEGORIES = ['lectures', 'quran', 'youth', 'sisters', 'community', 'other'];

type PostType = 'event' | 'announcement';
type TabType = 'events' | 'announcements';

interface MosquePost {
  id: string;
  type: PostType;
  title: string;
  body: string | null;
  category: string | null;
  event_start: string | null;
  event_end: string | null;
}

function formatEventRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const startStr = start.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  if (!endIso) return startStr;
  const end = new Date(endIso);
  return `${startStr} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export default function PostsScreen() {
  const { id: mosqueId, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { user, isAdmin } = useAuth();

  const [posts,        setPosts]        = useState<MosquePost[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [activeTab,    setActiveTab]    = useState<TabType>(initialTab === 'announcements' ? 'announcements' : 'events');
  const [mosqueWebsite, setMosqueWebsite] = useState<string | null>(null);
  const [syncing,      setSyncing]      = useState(false);

  // Form state
  const [showForm,      setShowForm]      = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postType,      setPostType]      = useState<PostType>('event');
  const [postTitle,     setPostTitle]     = useState('');
  const [postBody,      setPostBody]      = useState('');
  const [postCategory,  setPostCategory]  = useState('');
  const [eventDate,     setEventDate]     = useState<Date | null>(null);
  const [startTime,     setStartTime]     = useState<Date | null>(null);
  const [endTime,       setEndTime]       = useState<Date | null>(null);
  const [saving,        setSaving]        = useState(false);

  const loadData = useCallback(async () => {
    if (!mosqueId || !user) return;
    setLoading(true);

    const { data: m } = await supabase
      .from('mosques')
      .select('id, owner_id, website')
      .eq('id', mosqueId)
      .maybeSingle();

    if (!m || (m.owner_id !== user.id && !isAdmin)) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }
    setMosqueWebsite(m.website ?? null);

    const eventCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: p } = await supabase
      .from('mosque_posts')
      .select('id, type, title, body, category, event_start, event_end')
      .eq('mosque_id', mosqueId)
      .or(`type.eq.announcement,event_start.is.null,event_start.gte.${eventCutoff}`)
      .order('created_at', { ascending: false });

    setPosts((p as MosquePost[]) ?? []);
    setLoading(false);
  }, [mosqueId, user, isAdmin]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const clearForm = () => {
    setPostTitle(''); setPostBody(''); setPostCategory('');
    setEventDate(null); setStartTime(null); setEndTime(null);
    setEditingPostId(null); setShowForm(false);
  };

  const openAddForm = () => {
    clearForm();
    setPostType(activeTab === 'events' ? 'event' : 'announcement');
    setShowForm(true);
  };

  const openEditForm = (p: MosquePost) => {
    setPostType(p.type);
    setPostTitle(p.title);
    setPostBody(p.body ?? '');
    setPostCategory(p.category ?? '');
    setEditingPostId(p.id);
    if (p.event_start) {
      const d = new Date(p.event_start);
      setEventDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      setStartTime(d);
    } else {
      setEventDate(null); setStartTime(null);
    }
    setEndTime(p.event_end ? new Date(p.event_end) : null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!postTitle.trim()) {
      Alert.alert('Required', 'Enter a title.');
      return;
    }
    if (postType === 'event' && (startTime || endTime) && !eventDate) {
      Alert.alert('Date required', 'Pick the date before setting a start or end time.');
      return;
    }

    let eventStartIso: string | null = null;
    let eventEndIso: string | null = null;
    if (postType === 'event' && eventDate) {
      if (startTime) {
        const merged = new Date(eventDate);
        merged.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
        eventStartIso = merged.toISOString();
      }
      if (endTime) {
        const merged = new Date(eventDate);
        merged.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
        eventEndIso = merged.toISOString();
      }
      if (eventStartIso && eventEndIso && eventEndIso < eventStartIso) {
        Alert.alert('Invalid range', 'End time must be after the start time.');
        return;
      }
    }

    const catVal = postType === 'event' && postCategory ? postCategory : null;
    const payload = {
      type: postType,
      title: postTitle.trim(),
      body: postBody.trim() || null,
      category: catVal,
      categories: catVal ? [catVal] : [],
      event_start: eventStartIso,
      event_end: eventEndIso,
    };

    setSaving(true);
    try {
      if (editingPostId) {
        const { error } = await supabase.from('mosque_posts').update(payload).eq('id', editingPostId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('mosque_posts').insert({
          ...payload, mosque_id: mosqueId, created_by: user!.id,
        });
        if (error) throw new Error(error.message);
      }
      clearForm();
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFromWebsite = async () => {
    if (!mosqueWebsite) {
      Alert.alert('No website set', 'Add a website URL in portal settings before syncing.');
      return;
    }
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const res = await fetch(`${supabaseUrl}/functions/v1/parse-mosque-website`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ url: mosqueWebsite, mosqueId, scope: 'events', force: true }),
      });

      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      const data = await res.json();
      const now = new Date().toISOString();
      const allWithDates: any[] = (data.events ?? []).filter((e: any) => e.event_start);
      const events: any[] = allWithDates.filter((e: any) => e.event_start >= now);

      if (allWithDates.length > 0 && events.length === 0) {
        Alert.alert('No upcoming events', 'Events were found on the website but they all have past dates. The mosque page may not have updated their events calendar yet.');
        return;
      }

      if (events.length === 0) {
        Alert.alert('No events found', 'The website sync did not find any upcoming events.');
        return;
      }

      Alert.alert(
        `${events.length} event${events.length !== 1 ? 's' : ''} found`,
        `Publish these to your mosque page?\n\n${events.slice(0, 3).map((e: any) => `• ${e.title}`).join('\n')}${events.length > 3 ? `\n+${events.length - 3} more` : ''}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Publish',
            onPress: async () => {
              try {
                const rows = events.map((e: any) => ({
                  mosque_id:   mosqueId,
                  type:        'event',
                  title:       e.title,
                  body:        e.body ?? null,
                  category:    e.categories?.[0] ?? e.category ?? null,
                  categories:  e.categories ?? [],
                  event_start: e.event_start ?? null,
                  event_end:   e.event_end ?? null,
                  source_url:  e.source_url ?? mosqueWebsite,
                  created_by:  user!.id,
                }));

                // Events with a date: upsert to avoid duplicates on re-sync.
                // Events without a date (null event_start): plain insert — the
                // partial unique index only covers non-null event_start, so
                // upsert with onConflict would fail for null rows.
                const dated   = rows.filter(r => r.event_start);
                const undated = rows.filter(r => !r.event_start);

                if (dated.length > 0) {
                  const { error } = await supabase.from('mosque_posts').upsert(dated, {
                    onConflict: 'mosque_id,title,event_start',
                    ignoreDuplicates: true,
                  });
                  if (error) throw new Error(error.message);
                }

                if (undated.length > 0) {
                  // Fetch existing undated events for this mosque to skip exact-title dupes.
                  const { data: existing } = await supabase
                    .from('mosque_posts')
                    .select('title')
                    .eq('mosque_id', mosqueId)
                    .is('event_start', null);
                  const existingTitles = new Set((existing ?? []).map((r: any) => r.title));
                  const newUndated = undated.filter(r => !existingTitles.has(r.title));
                  if (newUndated.length > 0) {
                    const { error } = await supabase.from('mosque_posts').insert(newUndated);
                    if (error) throw new Error(error.message);
                  }
                }

                loadData();
                Alert.alert('Done', `${events.length} event${events.length !== 1 ? 's' : ''} published.`);
              } catch (e: any) {
                Alert.alert('Error', e.message ?? 'Failed to publish events');
              }
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = (postId: string) => {
    Alert.alert('Delete', 'Remove this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('mosque_posts').delete().eq('id', postId);
          loadData();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} title="Events & Posts" />
        <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
      </SafeAreaView>
    );
  }

  if (unauthorized) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} title="Events & Posts" />
        <View style={s.centered}>
          <Ionicons name="lock-closed-outline" size={40} color={TEXT_MUTED} />
          <Text style={s.unauthorizedText}>You don't manage this mosque's page.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const filteredPosts = posts.filter(p =>
    activeTab === 'events' ? p.type === 'event' : p.type === 'announcement',
  );

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <Header router={router} title="Events & Posts" />

      {/* Tabs */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'events' && s.tabActive]}
          onPress={() => setActiveTab('events')}
          activeOpacity={0.75}
        >
          <Text style={[s.tabText, activeTab === 'events' && s.tabTextActive]}>
            Events ({posts.filter(p => p.type === 'event').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === 'announcements' && s.tabActive]}
          onPress={() => setActiveTab('announcements')}
          activeOpacity={0.75}
        >
          <Text style={[s.tabText, activeTab === 'announcements' && s.tabTextActive]}>
            Announcements ({posts.filter(p => p.type === 'announcement').length})
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Post list */}
          {filteredPosts.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons
                name={activeTab === 'events' ? 'calendar-outline' : 'megaphone-outline'}
                size={40}
                color={HAIRLINE}
              />
              <Text style={s.emptyTitle}>No {activeTab === 'events' ? 'events' : 'announcements'} yet</Text>
              <Text style={s.emptySubtitle}>
                {activeTab === 'events'
                  ? 'Add upcoming events so your community knows what\'s happening.'
                  : 'Post announcements for important updates to your community.'}
              </Text>
            </View>
          ) : (
            filteredPosts.map(p => (
              <View
                key={p.id}
                style={[s.postCard, editingPostId === p.id && s.postCardEditing]}
              >
                <View style={{ flex: 1 }}>
                  {p.category ? (
                    <Text style={s.postCategory}>{p.category.toUpperCase()}</Text>
                  ) : null}
                  <Text style={s.postTitle}>{p.title}</Text>
                  {p.event_start ? (
                    <Text style={s.postMeta}>{formatEventRange(p.event_start, p.event_end)}</Text>
                  ) : null}
                  {p.body ? (
                    <Text style={s.postBody} numberOfLines={2}>{p.body}</Text>
                  ) : null}
                </View>
                <View style={s.postActions}>
                  <TouchableOpacity onPress={() => openEditForm(p)} hitSlop={8} style={s.postEditBtn}>
                    <Ionicons name="pencil-outline" size={16} color={GREEN} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(p.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={RED} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* Sync from website — events tab only */}
          {!showForm && activeTab === 'events' && mosqueWebsite && (
            <TouchableOpacity
              style={[s.syncBtn, syncing && s.btnDisabled]}
              onPress={handleSyncFromWebsite}
              disabled={syncing}
              activeOpacity={0.85}
            >
              {syncing
                ? <ActivityIndicator size="small" color={DEEP_GREEN} />
                : <Ionicons name="sync-outline" size={18} color={DEEP_GREEN} />}
              <Text style={s.syncBtnText}>
                {syncing ? 'Syncing…' : 'Sync Events from Website'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Add / Edit button */}
          {!showForm && (
            <TouchableOpacity style={s.addBtn} onPress={openAddForm} activeOpacity={0.85}>
              <Ionicons name="add-circle-outline" size={18} color={GREEN} />
              <Text style={s.addBtnText}>
                Add {activeTab === 'events' ? 'Event' : 'Announcement'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Add / Edit form modal */}
      <Modal
        visible={showForm}
        animationType="slide"
        transparent
        onRequestClose={clearForm}
      >
        <View style={fm.overlay}>
          <View style={[fm.sheet, { height: screenH * 0.92 }]}>
            <View style={fm.handle} />
            <View style={fm.formHeader}>
              <Text style={fm.formTitle}>
                {editingPostId
                  ? `Edit ${postType === 'event' ? 'Event' : 'Announcement'}`
                  : `New ${activeTab === 'events' ? 'Event' : 'Announcement'}`}
              </Text>
              <TouchableOpacity onPress={clearForm} hitSlop={8}>
                <Ionicons name="close" size={22} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
              <ScrollView
                contentContainerStyle={[fm.formContent, { paddingBottom: insets.bottom + 24 }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Type toggle — only shown when adding (editing type is fixed) */}
                {!editingPostId && (
                  <View style={fm.typeToggle}>
                    <TouchableOpacity
                      style={[fm.typeChip, postType === 'event' && fm.typeChipActive]}
                      onPress={() => setPostType('event')}
                    >
                      <Text style={[fm.typeChipText, postType === 'event' && fm.typeChipTextActive]}>Event</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[fm.typeChip, postType === 'announcement' && fm.typeChipActive]}
                      onPress={() => setPostType('announcement')}
                    >
                      <Text style={[fm.typeChipText, postType === 'announcement' && fm.typeChipTextActive]}>Announcement</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={fm.label}>Title *</Text>
                <TextInput
                  style={fm.input}
                  placeholder="Event or announcement title"
                  placeholderTextColor={TEXT_MUTED}
                  value={postTitle}
                  onChangeText={setPostTitle}
                />
                <Text style={fm.label}>Details (optional)</Text>
                <TextInput
                  style={[fm.input, fm.textarea]}
                  placeholder="Additional details..."
                  placeholderTextColor={TEXT_MUTED}
                  value={postBody}
                  onChangeText={setPostBody}
                  multiline
                />

                {postType === 'event' && (
                  <>
                    <Text style={fm.label}>Category (optional)</Text>
                    <View style={fm.categoryRow}>
                      {EVENT_CATEGORIES.map(cat => (
                        <TouchableOpacity
                          key={cat}
                          style={[fm.catChip, postCategory === cat && fm.catChipActive]}
                          onPress={() => setPostCategory(prev => prev === cat ? '' : cat)}
                          activeOpacity={0.75}
                        >
                          <Text style={[fm.catChipText, postCategory === cat && fm.catChipTextActive]}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <PickerField label="Date" mode="date" value={eventDate} onChange={setEventDate} />
                    <View style={fm.timeRow}>
                      <PickerField label="Starts" mode="time" value={startTime} onChange={setStartTime} style={fm.timeRowItem} />
                      <PickerField label="Ends"   mode="time" value={endTime}   onChange={setEndTime}   style={fm.timeRowItem} />
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[fm.saveBtn, saving && fm.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={fm.saveBtnText}>
                        {editingPostId ? 'Save Changes' : `Add ${postType === 'event' ? 'Event' : 'Announcement'}`}
                      </Text>}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ router, title }: { router: ReturnType<typeof useRouter>; title: string }) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
      </TouchableOpacity>
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 38 }} />
    </View>
  );
}

function PickerField({ label, mode, value, onChange, style }: {
  label: string; mode: 'date' | 'time'; value: Date | null;
  onChange: (d: Date | null) => void; style?: object;
}) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? new Date());

  const open = () => { setDraft(value ?? new Date()); setVisible(true); };
  const cancel = () => setVisible(false);
  const confirm = () => { onChange(draft); setVisible(false); };
  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => { if (selected) setDraft(selected); };

  const formatted = value
    ? mode === 'date'
      ? value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : 'Select';

  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <Text style={fm.label}>{label}</Text>
      <TouchableOpacity style={fm.dateBtn} onPress={open} activeOpacity={0.75}>
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={15} color={value ? GREEN : TEXT_MUTED} />
        <Text style={[fm.dateBtnText, !value && { color: TEXT_MUTED }]} numberOfLines={1}>{formatted}</Text>
      </TouchableOpacity>
      {value && (
        <TouchableOpacity onPress={() => onChange(null)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          <Text style={{ fontSize: 12, color: RED }}>Clear</Text>
        </TouchableOpacity>
      )}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
        <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={cancel}>
          <TouchableOpacity style={pk.sheet} activeOpacity={1} onPress={() => {}}>
            <Text style={pk.title}>{label}</Text>
            <DateTimePicker value={draft} mode={mode} display="spinner" onChange={handleChange} style={pk.picker} textColor={TEXT_DARK} />
            <View style={pk.actions}>
              <TouchableOpacity style={pk.cancelBtn} onPress={cancel} activeOpacity={0.75}>
                <Text style={pk.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={pk.doneBtn} onPress={confirm} activeOpacity={0.85}>
                <Text style={pk.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const pk = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingHorizontal: 16 },
  title: { fontSize: 15, fontWeight: '700', color: TEXT_DARK, textAlign: 'center', marginBottom: 4 },
  picker: { width: '100%', height: 200 },
  actions: { flexDirection: 'row', gap: 10, paddingVertical: 16, borderTopWidth: 1, borderTopColor: HAIRLINE, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  doneBtn: { flex: 1, backgroundColor: DEEP_GREEN, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

const fm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: HAIRLINE, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  formTitle: { fontSize: 17, fontWeight: '700', color: TEXT_DARK },
  formContent: { padding: 20, paddingBottom: 40 },

  typeToggle: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  typeChip: { flex: 1, borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  typeChipActive: { backgroundColor: '#e6f9f2', borderColor: GREEN },
  typeChipText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  typeChipTextActive: { color: GREEN },

  label: { fontSize: 12, fontWeight: '600', color: TEXT_MUTED, marginBottom: 6 },
  input: {
    backgroundColor: CREAM, borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: TEXT_DARK, marginBottom: 16,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE },
  catChipActive: { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  catChipText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  catChipTextActive: { color: '#fff' },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeRowItem: { flex: 1, marginBottom: 0 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CREAM, borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12,
  },
  dateBtnText: { fontSize: 13, fontWeight: '600', color: TEXT_DARK, flexShrink: 1 },
  saveBtn: { backgroundColor: DEEP_GREEN, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  saveBtnDisabled: { opacity: 0.65 },
});

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  unauthorizedText: { fontSize: 14, color: TEXT_MUTED, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE, backgroundColor: '#fff',
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: TEXT_DARK, textAlign: 'center', marginHorizontal: 8 },

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: DEEP_GREEN },
  tabText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  tabTextActive: { color: DEEP_GREEN },

  content: { padding: 16 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },
  emptySubtitle: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 19, maxWidth: 260 },

  postCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  postCardEditing: { borderWidth: 1.5, borderColor: GREEN },
  postCategory: { fontSize: 10, fontWeight: '700', color: GREEN, letterSpacing: 0.6, marginBottom: 2 },
  postTitle: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  postMeta: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  postBody: { fontSize: 12, color: TEXT_MUTED, marginTop: 3, lineHeight: 17 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 2 },
  postEditBtn: { padding: 2 },

  syncBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: DEEP_GREEN, backgroundColor: '#fff',
    borderRadius: 14, paddingVertical: 14, marginTop: 6, marginBottom: 8,
  },
  syncBtnText: { fontSize: 14, fontWeight: '700', color: DEEP_GREEN },
  btnDisabled: { opacity: 0.5 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#c3e8d8', backgroundColor: '#f0faf6',
    borderRadius: 14, paddingVertical: 14, marginTop: 6,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: GREEN },
});
