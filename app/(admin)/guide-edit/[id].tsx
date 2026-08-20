import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Switch, Alert,
  KeyboardAvoidingView, Platform, Modal, PanResponder, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { formatError } from '../../../lib/errors';
import { isValidImageBytes } from '../../../lib/validateImageBytes';
import { Brand } from '../../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const CREAM      = Brand.cream;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const RED        = Brand.red;

type Category = 'universities' | 'cities' | 'travel' | 'food' | 'cafes' | 'butcher' | 'ramadan' | 'family' | 'reverts';

const GUIDE_CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'universities', label: 'Universities',      icon: 'school-outline'      },
  { key: 'cities',       label: 'Cities',            icon: 'business-outline'    },
  { key: 'travel',       label: 'Travel',            icon: 'airplane-outline'    },
  { key: 'food',         label: 'Food',              icon: 'restaurant-outline'  },
  { key: 'cafes',        label: 'Cafés',             icon: 'cafe-outline'        },
  { key: 'butcher',      label: 'Butcher & Grocery', icon: 'storefront-outline'  },
  { key: 'ramadan',      label: 'Ramadan',           icon: 'moon-outline'        },
  { key: 'family',       label: 'Family',            icon: 'people-outline'      },
  { key: 'reverts',      label: 'Reverts',           icon: 'book-outline'        },
];

const PRESET_TAGS = [
  'Halal Food', 'Study Spots', 'Prayer', 'Cafés',
  'Mosques', 'Community', 'Groceries', 'Family-Friendly',
];

type SearchTab = 'restaurant' | 'butcher' | 'mosque' | 'prayer_room' | 'suggestions';

type GuideItem =
  | { type: 'restaurant';  restaurant_id: string;  name: string; address: string; category?: string }
  | { type: 'mosque';      mosque_id: string;       name: string; address: string | null }
  | { type: 'prayer_room'; prayer_room_id: string;  building_name: string; room_number: string | null;
      wudu_available: boolean; hours: string | null; lat: number | null; lng: number | null };

interface RestaurantResult {
  id: string;
  name: string;
  address: string;
  category?: string;
}

interface MosqueResult {
  id: string;
  osm_id: string;
  name: string;
  address: string | null;
}

interface GuideSuggestion {
  id: string;
  restaurant_id: string | null;
  name: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
  restaurants: { name: string; address: string } | null;
}

export default function AdminGuideEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isNew   = id === 'new';

  // ── Form state
  const [title,            setTitle]            = useState('');
  const [subtitle,         setSubtitle]         = useState('');
  const [coverImageUrl,    setCoverImageUrl]     = useState<string | null>(null); // existing URL from DB
  const [newCoverImage,    setNewCoverImage]     = useState<{ uri: string; base64: string } | null>(null); // newly picked
  const [uploadingCover,   setUploadingCover]    = useState(false);
  const [coverFocusY,      _setCoverFocusY]      = useState(0.5); // 0=top 0.5=center 1=bottom
  const coverFocusYRef = useRef(0.5);
  const setCoverFocusY = (v: number) => { coverFocusYRef.current = v; _setCoverFocusY(v); };
  const [repositionVisible, setRepositionVisible] = useState(false);
  const [coverNaturalSize, _setCoverNaturalSize]  = useState<{ width: number; height: number } | null>(null);
  const coverNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const setCoverNaturalSize = (v: { width: number; height: number } | null) => {
    coverNaturalSizeRef.current = v;
    _setCoverNaturalSize(v);
  };
  const [category,         setCategory]          = useState<Category>('universities');
  const [location,         setLocation]          = useState('');
  const [tags,          setTags]          = useState<string[]>([]);
  const [customTag,     setCustomTag]     = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [isFeatured,    setIsFeatured]    = useState(false);
  const [isPublished,   setIsPublished]   = useState(true);
  const [campusLat,     setCampusLat]     = useState('');
  const [campusLng,     setCampusLng]     = useState('');

  // ── Guide items
  const [items, setItems] = useState<GuideItem[]>([]);

  // ── Search
  const [activeSearchTab,     setActiveSearchTab]     = useState<SearchTab>('restaurant');
  const [searchQuery,         setSearchQuery]         = useState('');
  const [searchResults,       setSearchResults]       = useState<RestaurantResult[]>([]);
  const [searching,           setSearching]           = useState(false);
  const [mosqueSearchQuery,    setMosqueSearchQuery]    = useState('');
  const [mosqueSearchResults,  setMosqueSearchResults]  = useState<MosqueResult[]>([]);
  const [searchingMosques,     setSearchingMosques]     = useState(false);
  const [butcherSearchQuery,   setButcherSearchQuery]   = useState('');
  const [butcherSearchResults, setButcherSearchResults] = useState<RestaurantResult[]>([]);
  const [searchingButchers,    setSearchingButchers]    = useState(false);
  const searchTimer        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mosqueSearchTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const butcherSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Suggestions
  const [suggestions,        setSuggestions]        = useState<GuideSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionCount,    setSuggestionCount]    = useState(0);

  // ── Prayer room form (inline create)
  const [prBuildingName,  setPrBuildingName]  = useState('');
  const [prRoomNumber,    setPrRoomNumber]    = useState('');
  const [prWudu,          setPrWudu]          = useState(false);
  const [prHourSections,  setPrHourSections]  = useState<{ label: string; time: string }[]>([{ label: '', time: '' }]);
  const [prLat,           setPrLat]           = useState('');
  const [prLng,           setPrLng]           = useState('');
  const [savingPrayer,    setSavingPrayer]    = useState(false);

  // ── Loading / saving
  const [loading,  setLoading]  = useState(!isNew);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Load existing guide
  useEffect(() => {
    if (isNew) return;
    (async () => {
      const [guideRes, itemsRes] = await Promise.all([
        supabase
          .from('guides')
          .select('title, subtitle, cover_image_url, cover_focus_y, category, tags, instagram_handle, is_featured, is_published, campus_lat, campus_lng, location')
          .eq('id', id)
          .single(),
        supabase
          .from('guide_items')
          .select(`restaurant_id, mosque_id, prayer_room_id, position,
            restaurants(id, name, address, category),
            mosques(id, osm_id, name, address),
            prayer_rooms(id, building_name, room_number, wudu_available, hours, lat, lng)`)
          .eq('guide_id', id)
          .order('position'),
      ]);

      if (guideRes.data) {
        const g = guideRes.data;
        setTitle(g.title ?? '');
        setSubtitle(g.subtitle ?? '');
        setCoverImageUrl(g.cover_image_url ?? null);
        setCoverFocusY(g.cover_focus_y ?? 0.5);
        setCategory((g.category as Category) ?? 'universities');
        setLocation(g.location ?? '');
        setTags(g.tags ?? []);
        setInstagramHandle((g.instagram_handle ?? '').replace(/^@/, ''));
        setIsFeatured(g.is_featured ?? false);
        setIsPublished(g.is_published ?? true);
        setCampusLat(g.campus_lat?.toString() ?? '');
        setCampusLng(g.campus_lng?.toString() ?? '');
      }

      if (itemsRes.data) {
        setItems(
          (itemsRes.data as any[]).map(row => {
            if (row.restaurant_id) {
              return {
                type: 'restaurant' as const,
                restaurant_id: row.restaurant_id,
                name:     row.restaurants?.name     ?? '',
                address:  row.restaurants?.address  ?? '',
                category: row.restaurants?.category ?? undefined,
              };
            } else if (row.mosque_id) {
              return {
                type: 'mosque' as const,
                mosque_id: row.mosque_id,
                name:    row.mosques?.name    ?? '',
                address: row.mosques?.address ?? null,
              };
            } else {
              return {
                type: 'prayer_room' as const,
                prayer_room_id: row.prayer_room_id,
                building_name:  row.prayer_rooms?.building_name  ?? '',
                room_number:    row.prayer_rooms?.room_number    ?? null,
                wudu_available: row.prayer_rooms?.wudu_available ?? false,
                hours:          row.prayer_rooms?.hours          ?? null,
                lat:            row.prayer_rooms?.lat            ?? null,
                lng:            row.prayer_rooms?.lng            ?? null,
              };
            }
          }),
        );
      }
      setLoading(false);
    })();
  }, [id, isNew]);

  // ── Tag helpers
  const togglePresetTag = (tag: string) => {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  };

  const addCustomTag = () => {
    const t = customTag.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setCustomTag('');
  };

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  // ── Restaurant search (debounced)
  const runSearch = async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('restaurants')
      .select('id, name, address, category')
      .not('category', 'in', '("grocery","butcher")')
      .ilike('name', `%${q.trim()}%`)
      .order('name')
      .limit(20);
    setSearchResults((data as RestaurantResult[]) ?? []);
    setSearching(false);
  };

  const onSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(q), 350);
  };

  // ── Butcher/Grocery search (debounced)
  const runButcherSearch = async (q: string) => {
    if (q.trim().length < 2) { setButcherSearchResults([]); return; }
    setSearchingButchers(true);
    const { data } = await supabase
      .from('restaurants')
      .select('id, name, address, category')
      .in('category', ['grocery', 'butcher'])
      .ilike('name', `%${q.trim()}%`)
      .order('name')
      .limit(20);
    setButcherSearchResults((data as RestaurantResult[]) ?? []);
    setSearchingButchers(false);
  };

  const onButcherSearchChange = (q: string) => {
    setButcherSearchQuery(q);
    if (butcherSearchTimer.current) clearTimeout(butcherSearchTimer.current);
    butcherSearchTimer.current = setTimeout(() => runButcherSearch(q), 350);
  };

  // ── Mosque search (debounced)
  const runMosqueSearch = async (q: string) => {
    if (q.trim().length < 2) { setMosqueSearchResults([]); return; }
    setSearchingMosques(true);
    const { data } = await supabase
      .from('mosques')
      .select('id, osm_id, name, address')
      .ilike('name', `%${q.trim()}%`)
      .order('name')
      .limit(20);
    setMosqueSearchResults((data as MosqueResult[]) ?? []);
    setSearchingMosques(false);
  };

  const onMosqueSearchChange = (q: string) => {
    setMosqueSearchQuery(q);
    if (mosqueSearchTimer.current) clearTimeout(mosqueSearchTimer.current);
    mosqueSearchTimer.current = setTimeout(() => runMosqueSearch(q), 350);
  };

  // ── Add / remove helpers
  const addRestaurantItem = (r: RestaurantResult) => {
    if (items.some(i => i.type === 'restaurant' && i.restaurant_id === r.id)) return;
    setItems(prev => [...prev, { type: 'restaurant', restaurant_id: r.id, name: r.name, address: r.address, category: r.category }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const addButcherItem = (r: RestaurantResult) => {
    if (items.some(i => i.type === 'restaurant' && i.restaurant_id === r.id)) return;
    setItems(prev => [...prev, { type: 'restaurant', restaurant_id: r.id, name: r.name, address: r.address, category: r.category }]);
    setButcherSearchQuery('');
    setButcherSearchResults([]);
  };

  const addMosqueItem = (m: MosqueResult) => {
    if (items.some(i => i.type === 'mosque' && i.mosque_id === m.id)) return;
    setItems(prev => [...prev, { type: 'mosque', mosque_id: m.id, name: m.name, address: m.address }]);
    setMosqueSearchQuery('');
    setMosqueSearchResults([]);
  };

  const addPrayerRoom = async () => {
    if (!prBuildingName.trim()) { Alert.alert('Building name is required.'); return; }
    setSavingPrayer(true);
    const filledSections = prHourSections.filter(s => s.time.trim());
    const hoursValue = filledSections.length === 0 ? null
      : filledSections.length === 1 && !filledSections[0].label.trim()
        ? filledSections[0].time.trim()
        : JSON.stringify(filledSections.map(s => ({ label: s.label.trim(), time: s.time.trim() })));
    const { data, error } = await supabase
      .from('prayer_rooms')
      .insert({
        building_name:  prBuildingName.trim(),
        room_number:    prRoomNumber.trim() || null,
        wudu_available: prWudu,
        hours:          hoursValue,
        lat:            prLat ? parseFloat(prLat) : null,
        lng:            prLng ? parseFloat(prLng) : null,
      })
      .select('id, building_name, room_number, wudu_available, hours, lat, lng')
      .single();
    setSavingPrayer(false);
    if (error || !data) { console.error('[admin/guide-edit] prayer room error:', error); Alert.alert('Error', 'Failed to create prayer room.'); return; }
    setItems(prev => [...prev, {
      type: 'prayer_room',
      prayer_room_id: (data as any).id,
      building_name:  (data as any).building_name,
      room_number:    (data as any).room_number,
      wudu_available: (data as any).wudu_available,
      hours:          (data as any).hours,
      lat:            (data as any).lat,
      lng:            (data as any).lng,
    }]);
    setPrBuildingName(''); setPrRoomNumber(''); setPrWudu(false);
    setPrHourSections([{ label: '', time: '' }]); setPrLat(''); setPrLng('');
  };

  // ── Suggestions
  const loadSuggestions = async () => {
    if (isNew) return;
    setLoadingSuggestions(true);
    const { data } = await supabase
      .from('guide_suggestions')
      .select('id, restaurant_id, name, address, note, created_at, restaurants(name, address)')
      .eq('guide_id', id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    const rows = (data as unknown as GuideSuggestion[]) ?? [];
    setSuggestions(rows);
    setSuggestionCount(rows.length);
    setLoadingSuggestions(false);
  };

  const approveSuggestion = async (suggestion: GuideSuggestion) => {
    if (!suggestion.restaurant_id) {
      Alert.alert('Cannot auto-approve', 'This is a new-place suggestion. Review manually and add via restaurant search once it is in the database.');
      return;
    }
    // Add to guide items
    const nextPosition = items.length;
    const { error: itemError } = await supabase.from('guide_items').insert({
      guide_id:      id,
      restaurant_id: suggestion.restaurant_id,
      mosque_id:     null,
      prayer_room_id: null,
      position:      nextPosition,
    });
    if (itemError) { console.error('[admin/guide-edit] item error:', itemError); Alert.alert('Error', formatError(itemError)); return; }

    // Update suggestion status
    await supabase.from('guide_suggestions').update({ status: 'approved' }).eq('id', suggestion.id);

    // Update local state
    const r = suggestion.restaurants;
    if (r) {
      setItems(prev => [...prev, {
        type: 'restaurant',
        restaurant_id: suggestion.restaurant_id!,
        name: r.name,
        address: r.address,
      }]);
    }
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    setSuggestionCount(prev => Math.max(0, prev - 1));
    Alert.alert('Added', `"${r?.name ?? 'Place'}" has been added to the guide.`);
  };

  const rejectSuggestion = (suggestion: GuideSuggestion) => {
    const displayName = suggestion.restaurant_id
      ? (suggestion.restaurants?.name ?? 'this place')
      : (suggestion.name ?? 'this place');
    Alert.alert('Reject suggestion', `Reject "${displayName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject', style: 'destructive',
        onPress: async () => {
          await supabase.from('guide_suggestions').update({ status: 'rejected' }).eq('id', suggestion.id);
          setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
          setSuggestionCount(prev => Math.max(0, prev - 1));
        },
      },
    ]);
  };

  const removeItem = (item: GuideItem) => {
    setItems(prev => prev.filter(i => {
      if (item.type === 'restaurant' && i.type === 'restaurant') return i.restaurant_id !== item.restaurant_id;
      if (item.type === 'mosque'     && i.type === 'mosque')     return i.mosque_id      !== item.mosque_id;
      if (item.type === 'prayer_room'&& i.type === 'prayer_room') return i.prayer_room_id !== item.prayer_room_id;
      return true;
    }));
  };

  // ── Cover image pick + upload
  const pickCoverImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setNewCoverImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  };

  const uploadCoverImage = async (base64: string, uri: string): Promise<string> => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (!isValidImageBytes(bytes)) throw new Error('Invalid image file.');
    const ext = uri.toLowerCase().endsWith('.png') ? 'png'
              : uri.toLowerCase().endsWith('.webp') ? 'webp'
              : 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const uuid = Math.random().toString(36).slice(2);
    const path = `guide-covers/${uuid}.${ext}`;
    const { error } = await supabase.storage
      .from('gallery_photos')
      .upload(path, bytes, { contentType: mimeType, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('gallery_photos').getPublicUrl(path);
    return data.publicUrl;
  };

  // ── Save
  const save = async () => {
    if (!title.trim()) { Alert.alert('Title required'); return; }
    setSaving(true);

    let finalCoverUrl = coverImageUrl;
    if (newCoverImage) {
      try {
        setUploadingCover(true);
        finalCoverUrl = await uploadCoverImage(newCoverImage.base64, newCoverImage.uri);
        setUploadingCover(false);
      } catch (e: any) {
        console.error('[admin/guide-edit] cover upload error:', e);
        Alert.alert('Upload failed', formatError(e));
        setSaving(false);
        setUploadingCover(false);
        return;
      }
    }

    const payload = {
      title:            title.trim(),
      subtitle:         subtitle.trim() || null,
      cover_image_url:  finalCoverUrl,
      cover_focus_y:    coverFocusY,
      category,
      tags,
      instagram_handle: instagramHandle.trim().replace(/^@/, '') || null,
      is_featured:      isFeatured,
      is_published:     isPublished,
      campus_lat:       campusLat ? parseFloat(campusLat) : null,
      campus_lng:       campusLng ? parseFloat(campusLng) : null,
      location:         location.trim() || null,
      updated_at:       new Date().toISOString(),
    };

    let guideId = isNew ? null : id;

    if (isNew) {
      const { data, error } = await supabase.from('guides').insert(payload).select('id').single();
      if (error || !data) {
        console.error('[admin/guide-edit] create guide error:', error);
        Alert.alert('Error', 'Failed to create guide.');
        setSaving(false);
        return;
      }
      guideId = data.id;
    } else {
      const { error } = await supabase.from('guides').update(payload).eq('id', id);
      if (error) { console.error('[admin/guide-edit] update guide error:', error); Alert.alert('Error', formatError(error)); setSaving(false); return; }
    }

    // Replace all guide items
    await supabase.from('guide_items').delete().eq('guide_id', guideId!);
    if (items.length > 0) {
      await supabase.from('guide_items').insert(
        items.map((item, idx) => ({
          guide_id:       guideId!,
          restaurant_id:  item.type === 'restaurant'  ? item.restaurant_id  : null,
          mosque_id:      item.type === 'mosque'      ? item.mosque_id      : null,
          prayer_room_id: item.type === 'prayer_room' ? item.prayer_room_id : null,
          position: idx,
        })),
      );
    }

    setSaving(false);
    Alert.alert('Saved', isNew ? 'Guide created.' : 'Guide updated.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  // ── Delete
  const confirmDelete = () =>
    Alert.alert('Delete Guide', `Delete "${title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);

  const doDelete = async () => {
    setDeleting(true);
    await supabase.from('guides').delete().eq('id', id);
    setDeleting(false);
    router.back();
  };

  // ── Reposition pan responder
  const repositionPanState = useRef({ startY: 0, startFocusY: 0.5 });
  const repositionPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (_, gs) => {
        repositionPanState.current = { startY: gs.y0, startFocusY: coverFocusYRef.current };
      },
      onPanResponderMove: (_, gs) => {
        const nat = coverNaturalSizeRef.current;
        if (!nat) return;
        const screenW = Dimensions.get('window').width;
        const containerH = 260;
        const scale = Math.max(screenW / nat.width, containerH / nat.height);
        const maxOffset = Math.max(0, nat.height * scale - containerH);
        if (maxOffset === 0) return;
        const delta = gs.moveY - repositionPanState.current.startY;
        // dragging finger DOWN shifts the image down → shows the top → focusY decreases
        const next = Math.max(0, Math.min(1, repositionPanState.current.startFocusY - delta / maxOffset));
        setCoverFocusY(next);
      },
    }),
  ).current;

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <Header title="Edit Guide" onBack={() => router.back()} onSave={save} saving={false} />
        <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <Header
        title={isNew ? 'New Guide' : (title || 'Edit Guide')}
        onBack={() => router.back()}
        onSave={save}
        saving={saving}
      />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 60 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Basic Info ── */}
        <Text style={s.sectionTitle}>Basic Info</Text>

        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>TITLE</Text>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Muslim Student Guide: SJSU"
            placeholderTextColor="#bbb"
          />
        </View>

        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>SUBTITLE</Text>
          <TextInput
            style={[s.input, s.inputMultiline]}
            value={subtitle}
            onChangeText={setSubtitle}
            placeholder="Short description shown on cards and the featured hero"
            placeholderTextColor="#bbb"
            multiline
          />
        </View>

        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>LOCATION</Text>
          <TextInput
            style={s.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. San Jose, CA or Tokyo, Japan"
            placeholderTextColor="#bbb"
          />
        </View>

        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>INSTAGRAM HANDLE</Text>
          <View style={s.instaInputRow}>
            <Text style={s.instaAt}>@</Text>
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={instagramHandle}
              onChangeText={t => setInstagramHandle(t.replace(/^@/, ''))}
              placeholder="sjsumsa"
              placeholderTextColor="#bbb"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="twitter"
            />
          </View>
        </View>

        <Text style={s.fieldLabel}>COVER IMAGE</Text>
        {(newCoverImage?.uri ?? coverImageUrl) ? (
          <View style={s.imagePicker}>
            <Image
              source={{ uri: newCoverImage?.uri ?? coverImageUrl! }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              contentPosition={{ top: -(coverFocusY * Math.max(0,
                coverNaturalSize
                  ? coverNaturalSize.height
                      * Math.max(160 / coverNaturalSize.height, Dimensions.get('window').width / coverNaturalSize.width)
                      - 160
                  : 0
              )) }}
              transition={200}
              onLoad={(e) => setCoverNaturalSize({ width: e.source.width, height: e.source.height })}
            />
            <View style={s.imagePickerTopRow}>
              <TouchableOpacity style={s.imagePickerOverlay} onPress={pickCoverImage}>
                <Ionicons name="camera" size={14} color="#fff" />
                <Text style={s.imagePickerOverlayText}>Change photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.repositionBtn} onPress={() => setRepositionVisible(true)}>
                <Ionicons name="move" size={14} color="#fff" />
                <Text style={s.imagePickerOverlayText}>Reposition</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.imagePicker} onPress={pickCoverImage} activeOpacity={0.8}>
            <Ionicons name="image-outline" size={28} color={TEXT_MUTED} />
            <Text style={s.imagePickerText}>Tap to upload a cover photo</Text>
            <Text style={s.imagePickerSub}>Recommended: 1200 × 600 px</Text>
          </TouchableOpacity>
        )}

        {/* ── Category ── */}
        <Text style={s.sectionTitle}>Category</Text>
        <View style={s.chips}>
          {GUIDE_CATEGORIES.map(c => {
            const selected = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[s.chip, selected && s.chipSelected]}
                onPress={() => setCategory(c.key)}
              >
                <Ionicons
                  name={c.icon as any}
                  size={13}
                  color={selected ? GREEN : TEXT_MUTED}
                />
                {selected && <Ionicons name="checkmark" size={12} color={GREEN} />}
                <Text style={[s.chipText, selected && s.chipTextSelected]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Campus Location ── */}
        {category === 'universities' && (
          <>
            <Text style={s.sectionTitle}>Campus Location</Text>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>CAMPUS LATITUDE</Text>
              <TextInput
                style={s.input}
                value={campusLat}
                onChangeText={setCampusLat}
                placeholder="e.g. 37.3352"
                placeholderTextColor="#bbb"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>CAMPUS LONGITUDE</Text>
              <TextInput
                style={s.input}
                value={campusLng}
                onChangeText={setCampusLng}
                placeholder="e.g. -121.8811"
                placeholderTextColor="#bbb"
                keyboardType="decimal-pad"
              />
            </View>
          </>
        )}

        {/* ── Tags ── */}
        <Text style={s.sectionTitle}>Tags</Text>
        <View style={s.chips}>
          {PRESET_TAGS.map(tag => {
            const selected = tags.includes(tag);
            return (
              <TouchableOpacity
                key={tag}
                style={[s.chip, selected && s.chipSelected]}
                onPress={() => togglePresetTag(tag)}
              >
                {selected && <Ionicons name="checkmark" size={12} color={GREEN} />}
                <Text style={[s.chipText, selected && s.chipTextSelected]}>{tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom tag input */}
        <View style={[s.fieldWrap, { flexDirection: 'row', alignItems: 'center' }]}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={customTag}
            onChangeText={setCustomTag}
            placeholder="Add a custom tag..."
            placeholderTextColor="#bbb"
            onSubmitEditing={addCustomTag}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={addCustomTag} style={s.addTagBtn}>
            <Ionicons name="add" size={18} color={GREEN} />
          </TouchableOpacity>
        </View>

        {/* Show non-preset selected tags */}
        {tags.filter(t => !PRESET_TAGS.includes(t)).length > 0 && (
          <View style={[s.chips, { marginTop: 6 }]}>
            {tags.filter(t => !PRESET_TAGS.includes(t)).map(tag => (
              <TouchableOpacity
                key={tag}
                style={[s.chip, s.chipSelected]}
                onPress={() => removeTag(tag)}
              >
                <Ionicons name="checkmark" size={12} color={GREEN} />
                <Text style={[s.chipText, s.chipTextSelected]}>{tag}</Text>
                <Ionicons name="close" size={11} color={GREEN} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Settings ── */}
        <Text style={s.sectionTitle}>Settings</Text>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Featured Guide</Text>
            <Text style={s.switchSub}>Show as the hero card at the top of the Guides tab</Text>
          </View>
          <Switch
            value={isFeatured}
            onValueChange={setIsFeatured}
            trackColor={{ false: HAIRLINE, true: GREEN }}
            thumbColor="#fff"
          />
        </View>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Published</Text>
            <Text style={s.switchSub}>Unpublished guides are hidden from all users</Text>
          </View>
          <Switch
            value={isPublished}
            onValueChange={setIsPublished}
            trackColor={{ false: HAIRLINE, true: GREEN }}
            thumbColor="#fff"
          />
        </View>

        {/* ── Places ── */}
        <Text style={s.sectionTitle}>Places in this Guide</Text>

        {items.length === 0 ? (
          <View style={s.emptyItems}>
            <Ionicons name="location-outline" size={28} color="#ccc" />
            <Text style={s.emptyItemsText}>No places added yet.</Text>
            <Text style={s.emptyItemsSub}>Use the search below to add places.</Text>
          </View>
        ) : (
          <View style={s.itemsList}>
            {items.map((item, idx) => {
              const key = item.type === 'restaurant' ? item.restaurant_id
                        : item.type === 'mosque'      ? item.mosque_id
                        : item.prayer_room_id;
              const primaryText = item.type === 'prayer_room'
                ? item.building_name + (item.room_number ? `, Room ${item.room_number}` : '')
                : item.name;
              const secondaryText = item.type === 'prayer_room' ? null
                : item.type === 'mosque' ? (item.address ?? null)
                : item.address;
              return (
                <View key={key} style={[s.itemRow, idx > 0 && s.itemRowBorder]}>
                  <View style={s.itemPos}>
                    <Text style={s.itemPosText}>{idx + 1}</Text>
                  </View>
                  <View style={s.itemBody}>
                    <View style={s.itemTopRow}>
                      <Text style={s.itemName} numberOfLines={1}>{primaryText}</Text>
                      <View style={[
                        s.itemBadge,
                        item.type === 'mosque'      ? s.itemBadgeTeal   : undefined,
                        item.type === 'prayer_room' ? s.itemBadgePurple : undefined,
                        item.type === 'restaurant' && (item.category === 'grocery' || item.category === 'butcher')
                          ? s.itemBadgeAmber : undefined,
                      ]}>
                        <Text style={[
                          s.itemBadgeText,
                          item.type === 'mosque'      ? s.itemBadgeTextTeal   : undefined,
                          item.type === 'prayer_room' ? s.itemBadgeTextPurple : undefined,
                          item.type === 'restaurant' && (item.category === 'grocery' || item.category === 'butcher')
                            ? s.itemBadgeTextAmber : undefined,
                        ]}>
                          {item.type === 'mosque' ? 'Mosque'
                           : item.type === 'prayer_room' ? 'Prayer Room'
                           : (item.category === 'grocery' || item.category === 'butcher') ? 'Butcher/Grocery'
                           : item.category === 'cafe' ? 'Café'
                           : 'Restaurant'}
                        </Text>
                      </View>
                    </View>
                    {secondaryText ? (
                      <Text style={s.itemAddress} numberOfLines={1}>{secondaryText}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => removeItem(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color="#ccc" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Search tab switcher ── */}
        <View style={s.searchTabs}>
          {([
            'restaurant', 'butcher', 'mosque',
            ...(category === 'universities' ? ['prayer_room'] as const : []),
            ...(!isNew ? ['suggestions'] as const : []),
          ] as SearchTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.searchTab, activeSearchTab === tab && s.searchTabActive]}
              onPress={() => {
                setActiveSearchTab(tab);
                if (tab === 'suggestions' && suggestions.length === 0 && !loadingSuggestions) {
                  loadSuggestions();
                }
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[s.searchTabText, activeSearchTab === tab && s.searchTabTextActive]}>
                  {tab === 'restaurant'  ? 'Restaurant'
                   : tab === 'butcher'   ? 'Butcher/Grocery'
                   : tab === 'mosque'    ? 'Mosque'
                   : tab === 'prayer_room' ? 'Prayer Room'
                   : 'Suggestions'}
                </Text>
                {tab === 'suggestions' && suggestionCount > 0 && (
                  <View style={[s.suggestionBadge, activeSearchTab === tab && s.suggestionBadgeActive]}>
                    <Text style={[s.suggestionBadgeText, activeSearchTab === tab && s.suggestionBadgeTextActive]}>
                      {suggestionCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Restaurant search ── */}
        {activeSearchTab === 'restaurant' && (
          <>
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={15} color={TEXT_MUTED} />
              <TextInput
                style={s.searchInput}
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder="Search to add a restaurant..."
                placeholderTextColor="#bbb"
                returnKeyType="search"
              />
              {searching && <ActivityIndicator size="small" color={GREEN} />}
            </View>
            {searchResults.length > 0 && (
              <View style={s.resultsList}>
                {searchResults.map((r, idx) => {
                  const added = items.some(i => i.type === 'restaurant' && i.restaurant_id === r.id);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[s.resultRow, idx > 0 && s.resultBorder, added && s.resultAdded]}
                      onPress={() => !added && addRestaurantItem(r)}
                      activeOpacity={added ? 1 : 0.7}
                    >
                      <View style={s.resultBody}>
                        <Text style={s.resultName} numberOfLines={1}>{r.name}</Text>
                        <Text style={s.resultAddr} numberOfLines={1}>{r.address}</Text>
                      </View>
                      <Ionicons
                        name={added ? 'checkmark-circle' : 'add-circle-outline'}
                        size={20}
                        color={added ? GREEN : '#ccc'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ── Butcher/Grocery search ── */}
        {activeSearchTab === 'butcher' && (
          <>
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={15} color={TEXT_MUTED} />
              <TextInput
                style={s.searchInput}
                value={butcherSearchQuery}
                onChangeText={onButcherSearchChange}
                placeholder="Search to add a butcher or grocery store..."
                placeholderTextColor="#bbb"
                returnKeyType="search"
              />
              {searchingButchers && <ActivityIndicator size="small" color={GREEN} />}
            </View>
            {butcherSearchResults.length > 0 && (
              <View style={s.resultsList}>
                {butcherSearchResults.map((r, idx) => {
                  const added = items.some(i => i.type === 'restaurant' && i.restaurant_id === r.id);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[s.resultRow, idx > 0 && s.resultBorder, added && s.resultAdded]}
                      onPress={() => !added && addButcherItem(r)}
                      activeOpacity={added ? 1 : 0.7}
                    >
                      <View style={s.resultBody}>
                        <Text style={s.resultName} numberOfLines={1}>{r.name}</Text>
                        <Text style={s.resultAddr} numberOfLines={1}>{r.address}</Text>
                      </View>
                      <Ionicons
                        name={added ? 'checkmark-circle' : 'add-circle-outline'}
                        size={20}
                        color={added ? GREEN : '#ccc'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ── Mosque search ── */}
        {activeSearchTab === 'mosque' && (
          <>
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={15} color={TEXT_MUTED} />
              <TextInput
                style={s.searchInput}
                value={mosqueSearchQuery}
                onChangeText={onMosqueSearchChange}
                placeholder="Search to add a mosque..."
                placeholderTextColor="#bbb"
                returnKeyType="search"
              />
              {searchingMosques && <ActivityIndicator size="small" color={GREEN} />}
            </View>
            <Text style={s.searchHint}>Only mosques with a Rihdal page can be added.</Text>
            {mosqueSearchResults.length > 0 && (
              <View style={s.resultsList}>
                {mosqueSearchResults.map((m, idx) => {
                  const added = items.some(i => i.type === 'mosque' && i.mosque_id === m.id);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[s.resultRow, idx > 0 && s.resultBorder, added && s.resultAdded]}
                      onPress={() => !added && addMosqueItem(m)}
                      activeOpacity={added ? 1 : 0.7}
                    >
                      <View style={s.resultBody}>
                        <Text style={s.resultName} numberOfLines={1}>{m.name}</Text>
                        {m.address ? <Text style={s.resultAddr} numberOfLines={1}>{m.address}</Text> : null}
                      </View>
                      <Ionicons
                        name={added ? 'checkmark-circle' : 'add-circle-outline'}
                        size={20}
                        color={added ? GREEN : '#ccc'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ── Prayer room inline create (campus guides only) ── */}
        {activeSearchTab === 'prayer_room' && category === 'universities' && (
          <View style={s.prayerForm}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>BUILDING NAME *</Text>
              <TextInput
                style={s.input}
                value={prBuildingName}
                onChangeText={setPrBuildingName}
                placeholder="e.g. Student Union"
                placeholderTextColor="#bbb"
              />
            </View>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>ROOM NUMBER</Text>
              <TextInput
                style={s.input}
                value={prRoomNumber}
                onChangeText={setPrRoomNumber}
                placeholder="e.g. 104"
                placeholderTextColor="#bbb"
              />
            </View>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchLabel}>Wudu Available</Text>
              </View>
              <Switch
                value={prWudu}
                onValueChange={setPrWudu}
                trackColor={{ false: HAIRLINE, true: GREEN }}
                thumbColor="#fff"
              />
            </View>
            <Text style={[s.fieldLabel, { marginBottom: 6 }]}>HOURS</Text>
            {prHourSections.map((section, idx) => (
              <View key={idx} style={s.hourSectionRow}>
                <View style={s.hourSectionInputs}>
                  <TextInput
                    style={[s.input, s.hourLabelInput]}
                    value={section.label}
                    onChangeText={v => setPrHourSections(prev => prev.map((s, i) => i === idx ? { ...s, label: v } : s))}
                    placeholder="Label (e.g. Weekdays)"
                    placeholderTextColor="#bbb"
                  />
                  <TextInput
                    style={[s.input, s.hourTimeInput]}
                    value={section.time}
                    onChangeText={v => setPrHourSections(prev => prev.map((s, i) => i === idx ? { ...s, time: v } : s))}
                    placeholder="e.g. 8:00 AM – 10:00 PM"
                    placeholderTextColor="#bbb"
                  />
                </View>
                {prHourSections.length > 1 && (
                  <TouchableOpacity
                    onPress={() => setPrHourSections(prev => prev.filter((_, i) => i !== idx))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#ccc" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity
              style={s.addHourBtn}
              onPress={() => setPrHourSections(prev => [...prev, { label: '', time: '' }])}
            >
              <Ionicons name="add" size={14} color={GREEN} />
              <Text style={s.addHourBtnText}>Add Hours Section</Text>
            </TouchableOpacity>
            <View style={[s.fieldWrap, { flexDirection: 'row', gap: 8 }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>LATITUDE (optional)</Text>
                <TextInput
                  style={s.input}
                  value={prLat}
                  onChangeText={setPrLat}
                  placeholder="37.3352"
                  placeholderTextColor="#bbb"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>LONGITUDE (optional)</Text>
                <TextInput
                  style={s.input}
                  value={prLng}
                  onChangeText={setPrLng}
                  placeholder="-121.8811"
                  placeholderTextColor="#bbb"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <TouchableOpacity
              style={[s.addPrayerBtn, savingPrayer && { opacity: 0.6 }]}
              onPress={addPrayerRoom}
              disabled={savingPrayer}
            >
              {savingPrayer
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.addPrayerBtnText}>Add Prayer Room</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── Suggestions ── */}
        {activeSearchTab === 'suggestions' && !isNew && (
          <View style={s.suggestionsWrap}>
            {loadingSuggestions ? (
              <View style={s.suggestionLoading}>
                <ActivityIndicator size="small" color={GREEN} />
              </View>
            ) : suggestions.length === 0 ? (
              <View style={s.emptyItems}>
                <Ionicons name="checkmark-circle-outline" size={28} color="#ccc" />
                <Text style={s.emptyItemsText}>No pending suggestions</Text>
                <Text style={s.emptyItemsSub}>Students can suggest places from the guide page.</Text>
              </View>
            ) : (
              suggestions.map((suggestion, idx) => {
                const isExisting = !!suggestion.restaurant_id;
                const displayName = isExisting
                  ? (suggestion.restaurants?.name ?? 'Unknown restaurant')
                  : (suggestion.name ?? 'New place');
                const displayAddr = isExisting
                  ? (suggestion.restaurants?.address ?? '')
                  : (suggestion.address ?? '');
                return (
                  <View key={suggestion.id} style={[s.suggestionCard, idx > 0 && { marginTop: 10 }]}>
                    <View style={s.suggestionTopRow}>
                      <View style={[s.itemBadge, !isExisting && s.itemBadgeAmber]}>
                        <Text style={[s.itemBadgeText, !isExisting && s.itemBadgeTextAmber]}>
                          {isExisting ? 'Existing' : 'New place'}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.suggestionName}>{displayName}</Text>
                    {displayAddr ? (
                      <Text style={s.suggestionAddr} numberOfLines={1}>{displayAddr}</Text>
                    ) : null}
                    {suggestion.note ? (
                      <View style={s.suggestionNoteRow}>
                        <Ionicons name="chatbubble-outline" size={12} color={GREEN} />
                        <Text style={s.suggestionNote}>{suggestion.note}</Text>
                      </View>
                    ) : null}
                    <View style={s.suggestionActions}>
                      <TouchableOpacity
                        style={s.approveBtn}
                        onPress={() => approveSuggestion(suggestion)}
                      >
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={s.approveBtnText}>
                          {isExisting ? 'Add to Guide' : 'Mark Noted'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.rejectBtn}
                        onPress={() => rejectSuggestion(suggestion)}
                      >
                        <Text style={s.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── Danger zone ── */}
        {!isNew && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 32 }]}>Danger Zone</Text>
            <TouchableOpacity
              style={s.deleteBtn}
              onPress={confirmDelete}
              disabled={deleting}
            >
              {deleting
                ? <ActivityIndicator size="small" color={RED} />
                : <>
                    <Ionicons name="trash-outline" size={16} color={RED} />
                    <Text style={s.deleteBtnText}>Delete This Guide</Text>
                  </>
              }
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Reposition modal ── */}
      <Modal
        visible={repositionVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRepositionVisible(false)}
      >
        <View style={s.repoModal}>
          <View style={s.repoHeader}>
            <Text style={s.repoTitle}>Reposition Cover</Text>
            <TouchableOpacity style={s.repoDone} onPress={() => setRepositionVisible(false)}>
              <Text style={s.repoDoneText}>Done</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.repoHint}>Drag the image up or down to set the focal point.</Text>

          {/* Preview at exact hero proportions */}
          <View style={s.repoPreviewWrap}>
            {(newCoverImage?.uri ?? coverImageUrl) ? (
              <View
                style={s.repoPreview}
                {...repositionPanResponder.panHandlers}
              >
                <Image
                  source={{ uri: newCoverImage?.uri ?? coverImageUrl! }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  contentPosition={{ top: -(coverFocusY * Math.max(0,
                    coverNaturalSize
                      ? coverNaturalSize.height
                          * Math.max(
                              Dimensions.get('window').width / coverNaturalSize.width,
                              260 / coverNaturalSize.height,
                            )
                          - 260
                      : 0
                  )) }}
                  onLoad={(e) => setCoverNaturalSize({ width: e.source.width, height: e.source.height })}
                />
                {/* centre-line guide */}
                <View style={s.repoGuide} />
              </View>
            ) : null}
          </View>

          {/* Position indicator: left = top of image, right = bottom */}
          <View style={s.repoIndicatorWrap}>
            <Text style={s.repoIndicatorLabel}>Top</Text>
            <View style={s.repoIndicatorTrack}>
              <View style={[s.repoIndicatorThumb, { left: `${coverFocusY * 100}%` as any }]} />
            </View>
            <Text style={s.repoIndicatorLabel}>Bottom</Text>
          </View>
          <Text style={s.repoPositionText}>
            {coverFocusY < 0.2 ? 'Showing: Top'
              : coverFocusY < 0.4 ? 'Showing: Upper'
              : coverFocusY < 0.6 ? 'Showing: Center'
              : coverFocusY < 0.8 ? 'Showing: Lower'
              : 'Showing: Bottom'}
          </Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({
  title, onBack, onSave, saving,
}: { title: string; onBack: () => void; onSave: () => void; saving: boolean }) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={onBack}>
        <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
      </TouchableOpacity>
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      <TouchableOpacity style={s.saveBtn} onPress={onSave} disabled={saving}>
        {saving
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={s.saveBtnText}>Save</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },
  saveBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 18, minWidth: 60, alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  content: { padding: 16 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: TEXT_DARK,
    marginTop: 16, marginBottom: 10, letterSpacing: 0.2,
  },

  // ── Field wrap (label inside, matching existing admin screens)
  fieldWrap: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 10, fontWeight: '600', color: TEXT_MUTED,
    letterSpacing: 0.5, marginBottom: 2,
  },
  input: { fontSize: 15, color: TEXT_DARK, paddingVertical: 6, minHeight: 36 },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },

  addTagBtn: { padding: 4, marginLeft: 4 },
  instaInputRow: { flexDirection: 'row', alignItems: 'center' },
  instaAt: { fontSize: 15, fontWeight: '600', color: TEXT_MUTED, paddingRight: 2 },

  // ── Chips (matching existing admin chip style exactly)
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: HAIRLINE, backgroundColor: CREAM,
  },
  chipSelected:     { borderColor: GREEN, backgroundColor: '#e6f9f2' },
  chipText:         { fontSize: 13, color: TEXT_MUTED, fontWeight: '500' },
  chipTextSelected: { color: GREEN, fontWeight: '700' },

  // ── Switch rows (matching existing admin switch style)
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 10, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1.5, borderColor: HAIRLINE,
  },
  switchLabel: { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  switchSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 2, lineHeight: 16 },

  // ── Items list
  emptyItems: {
    alignItems: 'center', padding: 24, gap: 4,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE, marginBottom: 10,
  },
  emptyItemsText: { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  emptyItemsSub:  { fontSize: 12, color: '#ccc' },

  itemsList: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    marginBottom: 10, overflow: 'hidden',
  },
  itemRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: CREAM },
  itemPos: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#eef5f0', alignItems: 'center', justifyContent: 'center',
  },
  itemPosText:  { fontSize: 11, fontWeight: '700', color: GREEN },
  itemBody:     { flex: 1, gap: 2 },
  itemTopRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName:     { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  itemAddress:  { fontSize: 12, color: TEXT_MUTED },
  itemBadge: {
    backgroundColor: '#eef5f0', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  itemBadgeTeal:   { backgroundColor: '#e0f7f8' },
  itemBadgePurple: { backgroundColor: '#ede9fe' },
  itemBadgeAmber:  { backgroundColor: '#fef3c7' },
  itemBadgeText:       { fontSize: 9, fontWeight: '700', color: GREEN, letterSpacing: 0.2 },
  itemBadgeTextTeal:   { color: '#0d9488' },
  itemBadgeTextPurple: { color: '#6d28d9' },
  itemBadgeTextAmber:  { color: '#b45309' },

  // ── Search tabs
  searchTabs: {
    flexDirection: 'row', gap: 6, marginBottom: 8,
  },
  searchTab: {
    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  searchTabActive:     { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  searchTabText:       { fontSize: 12, fontWeight: '600', color: TEXT_MUTED },
  searchTabTextActive: { color: '#fff' },

  searchHint: { fontSize: 11, color: TEXT_MUTED, marginBottom: 8, marginLeft: 2 },

  // ── Prayer room hours sections
  hourSectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  hourSectionInputs: { flex: 1, gap: 6 },
  hourLabelInput: {
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 0,
  },
  hourTimeInput: {
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 0,
  },
  addHourBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, marginBottom: 10,
  },
  addHourBtnText: { fontSize: 13, fontWeight: '600', color: GREEN },

  // ── Prayer room form
  prayerForm: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    padding: 14, marginBottom: 10, gap: 0,
  },
  addPrayerBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginTop: 8,
  },
  addPrayerBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ── Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: TEXT_DARK },

  resultsList: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    overflow: 'hidden', marginBottom: 12,
  },
  resultRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  resultBorder: { borderTopWidth: 1, borderTopColor: CREAM },
  resultAdded:  { opacity: 0.45 },
  resultBody:   { flex: 1 },
  resultName:   { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  resultAddr:   { fontSize: 12, color: TEXT_MUTED },

  // ── Cover image picker
  imagePicker: {
    height: 160, borderRadius: 14, borderWidth: 1.5, borderColor: HAIRLINE,
    borderStyle: 'dashed', backgroundColor: CREAM,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14, overflow: 'hidden', gap: 6,
  },
  imagePickerTopRow: {
    position: 'absolute', bottom: 10, left: 10, right: 10,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  imagePickerOverlay: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  repositionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  imagePickerOverlayText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  imagePickerText: { fontSize: 14, color: TEXT_MUTED, fontWeight: '500' },
  imagePickerSub:  { fontSize: 11, color: '#bbb' },

  // ── Reposition modal
  repoModal: { flex: 1, backgroundColor: CREAM },
  repoHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  repoTitle: { fontSize: 17, fontWeight: '700', color: TEXT_DARK },
  repoDone:  {
    backgroundColor: DEEP_GREEN, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  repoDoneText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  repoHint: {
    fontSize: 13, color: TEXT_MUTED, textAlign: 'center',
    paddingHorizontal: 24, paddingVertical: 12,
  },
  repoPreviewWrap: { paddingHorizontal: 0 },
  repoPreview: {
    height: 260, overflow: 'hidden',
  },
  repoGuide: {
    position: 'absolute', left: 0, right: 0,
    top: '50%' as any, height: 1,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  repoIndicatorWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 40, paddingTop: 20,
  },
  repoIndicatorTrack: {
    flex: 1, height: 4, backgroundColor: HAIRLINE, borderRadius: 2,
  },
  repoIndicatorThumb: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8,
    backgroundColor: DEEP_GREEN, top: -6, marginLeft: -8,
  },
  repoIndicatorLabel: { fontSize: 11, color: TEXT_MUTED, fontWeight: '600' },
  repoPositionText: {
    fontSize: 13, color: TEXT_DARK, fontWeight: '600',
    textAlign: 'center', paddingTop: 12,
  },

  // ── Suggestions tab
  suggestionBadge: {
    backgroundColor: RED, borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center',
  },
  suggestionBadgeActive:    { backgroundColor: 'rgba(255,255,255,0.3)' },
  suggestionBadgeText:      { fontSize: 9, fontWeight: '800', color: '#fff' },
  suggestionBadgeTextActive: { color: '#fff' },

  suggestionsWrap: { gap: 0, marginBottom: 10 },
  suggestionLoading: { paddingVertical: 24, alignItems: 'center' },

  suggestionCard: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: HAIRLINE,
    padding: 14, gap: 4,
  },
  suggestionTopRow: { flexDirection: 'row', marginBottom: 4 },
  suggestionName:  { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  suggestionAddr:  { fontSize: 12, color: TEXT_MUTED },
  suggestionNoteRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#f0f9f3', borderRadius: 8, padding: 8, marginTop: 4,
  },
  suggestionNote:  { flex: 1, fontSize: 12, color: GREEN, lineHeight: 16 },

  suggestionActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: DEEP_GREEN, borderRadius: 10, paddingVertical: 10,
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  rejectBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: RED, alignItems: 'center', justifyContent: 'center',
  },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: RED },

  // ── Delete
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderWidth: 1.5, borderColor: RED, borderRadius: 12,
    backgroundColor: '#fff5f5',
  },
  deleteBtnText: { fontSize: 15, fontWeight: '600', color: RED },
});
