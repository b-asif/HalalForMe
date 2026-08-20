import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, ImageBackground, Linking, Modal,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Localization from 'expo-localization';

import { supabase } from '../lib/supabase';
import { haversineMi } from '../lib/geo';
import { Brand } from '../lib/theme';
import { loadPrayerSettings } from '../lib/prayer/settingsStore';
import { useAuth } from '../contexts/AuthContext';
import { setGuestLoginIntent } from '../lib/guestLoginIntent';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const RED        = Brand.red;

// ─── Category registry ────────────────────────────────────────────────────────

const CATEGORIES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'all',        label: 'All',       icon: 'calendar-outline',              color: DEEP_GREEN  },
  { key: 'lectures',   label: 'Lecture',   icon: 'mic-outline',                   color: '#1B4332'   },
  { key: 'sisters',    label: 'Sisters',   icon: 'female-outline',                color: '#6B2737'   },
  { key: 'quran',      label: 'Quran',     icon: 'book-outline',                  color: '#1A3A5C'   },
  { key: 'youth',      label: 'Youth',     icon: 'people-outline',                color: '#4A1942'   },
  { key: 'community',  label: 'Community', icon: 'people-circle-outline',          color: '#7C4700'   },
  { key: 'other',      label: 'Other',     icon: 'ellipsis-horizontal-outline',   color: '#374151'   },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

function categoryFor(raw: string | null | undefined) {
  if (!raw) return CATEGORY_MAP['other'];
  return CATEGORY_MAP[raw.toLowerCase()] ?? { ...CATEGORY_MAP['other'], label: raw };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDayWindow(count = 8): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtTimeRange(start: string, end: string | null): string {
  return end ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MosqueInfo {
  id: string;
  osm_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

interface EventRow {
  id: string;
  title: string;
  body: string | null;
  event_start: string;
  event_end: string | null;
  categories: string[];
  category: string | null;
  mosque_id: string;
  mosque: MosqueInfo;
  distanceMi: number;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function EventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [locationInput,  setLocationInput]  = useState('');
  const [locationQuery,  setLocationQuery]  = useState('');
  const [searchLat,      setSearchLat]      = useState<number | null>(null);
  const [searchLng,      setSearchLng]      = useState<number | null>(null);
  const [geoLoading,     setGeoLoading]     = useState(false);
  const [geoError,       setGeoError]       = useState<string | null>(null);

  const [searchQuery,    setSearchQuery]    = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedDay,    setSelectedDay]    = useState<Date | null>(null); // null = all days

  const [events,        setEvents]        = useState<EventRow[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);

  const [activeReminder,  setActiveReminder]  = useState<{ lead_minutes: number } | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);

  const days = useMemo(() => getDayWindow(8), []);

  // Load the user's active reminder whenever the modal opens for a new event
  useEffect(() => {
    if (!selectedEvent || !user) { setActiveReminder(null); return; }
    supabase
      .from('event_reminders')
      .select('lead_minutes')
      .eq('post_id', selectedEvent.id)
      .eq('user_id', user.id)
      .eq('sent', false)
      .maybeSingle()
      .then(({ data }) => setActiveReminder(data ?? null));
  }, [selectedEvent?.id, user?.id]);

  const saveReminder = async (leadMinutes: number) => {
    if (!selectedEvent) return;
    setReminderLoading(true);
    const { error } = await supabase.functions.invoke('set-event-reminder', {
      body: { postId: selectedEvent.id, leadMinutes },
    });
    if (error) {
      Alert.alert('Error', 'Could not save reminder. Please try again.');
    } else {
      setActiveReminder({ lead_minutes: leadMinutes });
    }
    setReminderLoading(false);
  };

  const removeReminder = async () => {
    if (!selectedEvent || !activeReminder) return;
    setReminderLoading(true);
    await supabase.functions.invoke('set-event-reminder', {
      body: { postId: selectedEvent.id, leadMinutes: activeReminder.lead_minutes, action: 'delete' },
    });
    setActiveReminder(null);
    setReminderLoading(false);
  };

  const promptSetReminder = () => {
    Alert.alert('Set Reminder', 'How far in advance?', [
      { text: '1 hour before',  onPress: () => saveReminder(60) },
      { text: '1 day before',   onPress: () => saveReminder(1440) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Auto-load location from prayer settings on mount
  useEffect(() => {
    (async () => {
      try {
        const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
        const settings   = await loadPrayerSettings(regionCode);
        let lat: number | null = null;
        let lng: number | null = null;
        let label = '';

        if (settings.locationMode === 'manual' && settings.manualCity) {
          lat   = settings.manualCity.latitude;
          lng   = settings.manualCity.longitude;
          label = settings.manualCity.label;
        } else {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            // getLastKnownPositionAsync returns immediately from cache — avoids
            // a 30–90s GPS acquisition wait on first open. Falls back to a fresh
            // fix only if no cached position exists (e.g. fresh install).
            const last = await Location.getLastKnownPositionAsync();
            const pos  = last ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lat   = pos.coords.latitude;
            lng   = pos.coords.longitude;
            label = 'Current location';
          }
        }

        if (lat !== null && lng !== null) {
          setSearchLat(lat);
          setSearchLng(lng);
          setLocationInput(label);
          setLocationQuery(label);
        }
      } catch {
        // leave blank — user can enter manually
      }
    })();
  }, []);

  const fetchEvents = useCallback(async () => {
    if (searchLat === null || searchLng === null) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Step 1: get nearby mosque IDs within ~50 mi bounding box.
      // Using 50 mi as the outer bound so we don't need to re-fetch when the
      // user hasn't changed location — category/date/search filter client-side.
      const latDelta = 50 / 69;
      const lngDelta = 50 / 50;

      const { data: mosqueData, error: mosqueErr } = await supabase
        .from('mosques')
        .select('id, osm_id, name, address, lat, lng')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .gte('lat', searchLat - latDelta)
        .lte('lat', searchLat + latDelta)
        .gte('lng', searchLng - lngDelta)
        .lte('lng', searchLng + lngDelta);

      if (mosqueErr) throw new Error(mosqueErr.message);
      const nearbyMosques = (mosqueData ?? []) as MosqueInfo[];
      if (nearbyMosques.length === 0) { setEvents([]); setLoading(false); return; }

      const mosqueById = new Map(nearbyMosques.map(m => [m.id, m]));

      // Step 2: fetch upcoming events for those mosques
      const { data: eventData, error: eventErr } = await supabase
        .from('mosque_posts')
        .select('id, title, body, event_start, event_end, categories, category, mosque_id')
        .eq('type', 'event')
        .not('event_start', 'is', null)
        .gte('event_start', new Date().toISOString())
        .in('mosque_id', nearbyMosques.map(m => m.id))
        .order('event_start', { ascending: true })
        .limit(200);

      if (eventErr) throw new Error(eventErr.message);

      const rows: EventRow[] = ((eventData ?? []) as any[])
        .filter(e => mosqueById.has(e.mosque_id))
        .map(e => {
          const mosque = mosqueById.get(e.mosque_id)!;
          return {
            ...e,
            mosque,
            distanceMi: mosque.lat != null && mosque.lng != null
              ? haversineMi(searchLat!, searchLng!, mosque.lat, mosque.lng)
              : Infinity,
          };
        });

      setEvents(rows);
    } catch (e: any) {
      setError('Could not load events. Please try again.');
    }
    setLoading(false);
  }, [searchLat, searchLng]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleLocationSearch = async () => {
    const lq = locationInput.trim();
    if (!lq) {
      setLocationQuery('');
      setSearchLat(null);
      setSearchLng(null);
      setGeoError(null);
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    try {
      const results = await Location.geocodeAsync(lq);
      if (results.length === 0) {
        setGeoError('Location not found. Try a different city or zip code.');
        setSearchLat(null);
        setSearchLng(null);
      } else {
        setSearchLat(results[0].latitude);
        setSearchLng(results[0].longitude);
        setLocationQuery(lq);
      }
    } catch {
      setGeoError('Could not search that location. Try again.');
    }
    setGeoLoading(false);
  };

  // Client-side filtering: category, day, search query
  const filtered = useMemo(() => {
    let result = events;

    if (activeCategory !== 'all') {
      result = result.filter(e => {
        // Check multi-category array first (new), fall back to single category (legacy)
        const cats = e.categories?.length > 0 ? e.categories : (e.category ? [e.category] : []);
        return cats.length > 0 ? cats.includes(activeCategory) : activeCategory === 'other';
      });
    }

    if (selectedDay !== null) {
      result = result.filter(e =>
        e.event_start && isSameDay(new Date(e.event_start), selectedDay),
      );
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.body ?? '').toLowerCase().includes(q) ||
        e.mosque.name.toLowerCase().includes(q),
      );
    }

    return result;
  }, [events, activeCategory, selectedDay, searchQuery]);

  return (
    <View style={s.root}>
      {/* ── Hero ── */}
      <ImageBackground
        source={require('../assets/background.png')}
        style={[s.hero, { paddingTop: insets.top + 16 }]}
        imageStyle={s.heroBg}
      >
        <View style={s.heroOverlay} />
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={s.heroTitle}>Events</Text>
        <Text style={s.heroSub}>Discover and connect with upcoming events in your community.</Text>
      </ImageBackground>

      <SafeAreaView style={s.flex} edges={['bottom']}>
        {/* ── Search bar (overlaps hero) ── */}
        <View style={s.searchWrap}>
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={18} color={TEXT_MUTED} />
            <TextInput
              style={s.searchInput}
              placeholder="Search events, topics, or mosques..."
              placeholderTextColor={TEXT_MUTED}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={TEXT_MUTED} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Category chips ── */}
        <View style={s.categoryRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.categoryScroll}
          >
            {CATEGORIES.map(cat => {
              const active = activeCategory === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[s.categoryChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                  onPress={() => setActiveCategory(cat.key)}
                  activeOpacity={0.8}
                >
                  {cat.key !== 'all' && (
                    <Ionicons name={cat.icon} size={14} color={active ? '#fff' : TEXT_DARK} />
                  )}
                  <Text style={[s.categoryChipText, active && s.categoryChipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Location bar ── */}
        <View style={s.locationWrap}>
          <Ionicons name="location-outline" size={15} color={TEXT_MUTED} />
          <TextInput
            style={s.locationInput}
            placeholder="City or zip code..."
            placeholderTextColor={TEXT_MUTED}
            value={locationInput}
            onChangeText={setLocationInput}
            onSubmitEditing={handleLocationSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {geoLoading
            ? <ActivityIndicator size="small" color={GREEN} />
            : locationInput.length > 0
              ? (
                <TouchableOpacity onPress={() => { setLocationInput(''); setLocationQuery(''); setSearchLat(null); setSearchLng(null); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={TEXT_MUTED} />
                </TouchableOpacity>
              )
              : (
                <TouchableOpacity onPress={handleLocationSearch} hitSlop={8}>
                  <Ionicons name="arrow-forward-circle" size={20} color={GREEN} />
                </TouchableOpacity>
              )}
        </View>
        {geoError && <Text style={s.geoError}>{geoError}</Text>}

        {/* ── Day picker ── */}
        <View style={s.dayPickerRow}>
          <TouchableOpacity
            style={[s.dayChip, s.dayChipAll, selectedDay === null && s.dayChipActive]}
            onPress={() => setSelectedDay(null)}
            activeOpacity={0.8}
          >
            <Text style={[s.dayChipLabel, selectedDay === null && s.dayChipLabelActive]}>All</Text>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayScroll}>
            {days.map((day, i) => {
              const active = selectedDay !== null && isSameDay(selectedDay, day);
              const isToday = i === 0;
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.dayChip, active && s.dayChipActive]}
                  onPress={() => setSelectedDay(active ? null : day)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.dayChipWeekday, active && s.dayChipLabelActive]}>
                    {isToday ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </Text>
                  <Text style={[s.dayChipDate, active && s.dayChipLabelActive]}>
                    {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Results ── */}
        {loading ? (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={GREEN} />
          </View>
        ) : error ? (
          <View style={s.centered}>
            <Ionicons name="alert-circle-outline" size={36} color={TEXT_MUTED} />
            <Text style={s.emptyTitle}>Something went wrong</Text>
            <Text style={s.emptyText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={fetchEvents}>
              <Text style={s.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : searchLat === null ? (
          <View style={s.centered}>
            <Ionicons name="location-outline" size={48} color={TEXT_MUTED} />
            <Text style={s.emptyTitle}>Enter your location</Text>
            <Text style={s.emptyText}>Search a city or zip code to find events near you.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.centered}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={TEXT_MUTED} />
            <Text style={s.emptyTitle}>No events found</Text>
            <Text style={s.emptyText}>
              {activeCategory !== 'all' || selectedDay !== null
                ? 'Try clearing filters or selecting a different date.'
                : 'No upcoming events near you yet.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 40 }]}
            ListHeaderComponent={
              <Text style={s.resultCount}>
                {filtered.length} event{filtered.length !== 1 ? 's' : ''}
                {locationQuery ? ` near "${locationQuery}"` : ''}
              </Text>
            }
            renderItem={({ item }) => (
              <EventCard
                event={item}
                onPress={() => setSelectedEvent(item)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          />
        )}
      </SafeAreaView>

      {/* ── Event detail modal ── */}
      <Modal
        visible={selectedEvent !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <View style={d.overlay}>
          <TouchableOpacity style={d.backdrop} activeOpacity={1} onPress={() => setSelectedEvent(null)} />
          {selectedEvent && (() => {
            const primaryCat = selectedEvent.categories?.length > 0 ? selectedEvent.categories[0] : selectedEvent.category;
            const cat = categoryFor(primaryCat);
            return (
              <View style={d.sheet}>
                {/* Drag handle */}
                <View style={d.handle} />

                {/* Category colour bar */}
                <View style={[d.colorBar, { backgroundColor: cat.color }]}>
                  <Ionicons name={cat.icon} size={28} color="rgba(255,255,255,0.8)" />
                  <View style={[d.categoryPill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <Text style={d.categoryPillText}>{cat.label.toUpperCase()}</Text>
                  </View>
                  <TouchableOpacity style={d.closeBtn} onPress={() => setSelectedEvent(null)} hitSlop={10}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={d.scroll} contentContainerStyle={d.scrollContent} showsVerticalScrollIndicator={false}>
                  {/* Title */}
                  <Text style={d.title}>{selectedEvent.title}</Text>

                  {/* Date & time */}
                  {selectedEvent.event_start && (
                    <View style={d.metaBlock}>
                      <View style={d.metaRow}>
                        <View style={[d.metaIcon, { backgroundColor: cat.color + '18' }]}>
                          <Ionicons name="calendar-outline" size={16} color={cat.color} />
                        </View>
                        <View>
                          <Text style={d.metaLabel}>Date</Text>
                          <Text style={d.metaValue}>{fmtDate(selectedEvent.event_start)}</Text>
                        </View>
                      </View>
                      <View style={d.metaRow}>
                        <View style={[d.metaIcon, { backgroundColor: cat.color + '18' }]}>
                          <Ionicons name="time-outline" size={16} color={cat.color} />
                        </View>
                        <View>
                          <Text style={d.metaLabel}>Time</Text>
                          <Text style={d.metaValue}>{fmtTimeRange(selectedEvent.event_start, selectedEvent.event_end)}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Mosque */}
                  <View style={d.metaBlock}>
                    <View style={d.metaRow}>
                      <View style={[d.metaIcon, { backgroundColor: cat.color + '18' }]}>
                        <Ionicons name="location-outline" size={16} color={cat.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={d.metaLabel}>Mosque</Text>
                        <Text style={d.metaValue}>{selectedEvent.mosque.name}</Text>
                        {selectedEvent.mosque.address && (
                          <Text style={d.metaSubValue}>{selectedEvent.mosque.address}</Text>
                        )}
                        {selectedEvent.distanceMi < Infinity && (
                          <Text style={d.metaSubValue}>{selectedEvent.distanceMi.toFixed(1)} mi away</Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Description */}
                  {selectedEvent.body ? (
                    <View style={d.descBlock}>
                      <Text style={d.descLabel}>About this event</Text>
                      <Text style={d.desc}>{selectedEvent.body}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                {/* Reminder — only for future events */}
                {new Date(selectedEvent.event_start) > new Date() && (
                  <View style={d.reminderWrap}>
                    <TouchableOpacity
                      style={[d.reminderBtn, activeReminder && d.reminderBtnActive]}
                      onPress={() => {
                        if (!user) {
                          setSelectedEvent(null);
                          setGuestLoginIntent(true);
                          router.push('/(auth)/login');
                        } else if (activeReminder) {
                          Alert.alert(
                            'Remove Reminder',
                            `Remove your ${activeReminder.lead_minutes === 60 ? '1 hour' : '1 day'} reminder for this event?`,
                            [
                              { text: 'Remove', style: 'destructive', onPress: removeReminder },
                              { text: 'Cancel', style: 'cancel' },
                            ],
                          );
                        } else {
                          promptSetReminder();
                        }
                      }}
                      disabled={reminderLoading}
                      activeOpacity={0.8}
                    >
                      {reminderLoading
                        ? <ActivityIndicator size="small" color={activeReminder ? DEEP_GREEN : TEXT_MUTED} />
                        : <Ionicons
                            name={activeReminder ? 'notifications' : 'notifications-outline'}
                            size={16}
                            color={activeReminder ? DEEP_GREEN : TEXT_MUTED}
                          />
                      }
                      <Text style={[d.reminderBtnText, activeReminder && { color: DEEP_GREEN, fontWeight: '700' }]}>
                        {activeReminder
                          ? `Reminder: ${activeReminder.lead_minutes === 60 ? '1 hour' : '1 day'} before · Remove`
                          : !user ? 'Sign in to set a reminder' : 'Set Reminder'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Footer actions */}
                <View style={[d.footer, { paddingBottom: insets.bottom + 12 }]}>
                  <TouchableOpacity
                    style={[d.footerBtn, d.footerBtnSecondary]}
                    onPress={() => {
                      setSelectedEvent(null);
                      router.push(`/mosque/${selectedEvent.mosque.osm_id.replace('/', ':')}` as any);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="business-outline" size={16} color={DEEP_GREEN} />
                    <Text style={d.footerBtnSecondaryText}>View Mosque</Text>
                  </TouchableOpacity>
                  {selectedEvent.mosque.address && (
                    <TouchableOpacity
                      style={[d.footerBtn, { backgroundColor: cat.color }]}
                      onPress={() => {
                        const query = encodeURIComponent(selectedEvent.mosque.address ?? selectedEvent.mosque.name);
                        Linking.openURL(`https://maps.apple.com/?q=${query}`);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="navigate-outline" size={16} color="#fff" />
                      <Text style={d.footerBtnText}>Get Directions</Text>
                    </TouchableOpacity>
                  )}
                </View>

              </View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
}

// ─── Event card ───────────────────────────────────────────────────────────────

function EventCard({ event, onPress }: { event: EventRow; onPress: () => void }) {
  const primaryCat = event.categories?.length > 0 ? event.categories[0] : event.category;
  const cat = categoryFor(primaryCat);

  return (
    <TouchableOpacity style={c.card} onPress={onPress} activeOpacity={0.85}>
      {/* Left: category colour block */}
      <View style={[c.colorBlock, { backgroundColor: cat.color }]}>
        <Ionicons name={cat.icon} size={28} color="rgba(255,255,255,0.7)" />
      </View>

      {/* Right: content */}
      <View style={c.content}>
        {/* Category pill */}
        <View style={[c.categoryPill, { backgroundColor: cat.color + '18', borderColor: cat.color + '40' }]}>
          <Text style={[c.categoryPillText, { color: cat.color }]}>{cat.label.toUpperCase()}</Text>
        </View>

        <Text style={c.title} numberOfLines={2}>{event.title}</Text>

        {/* Date & time */}
        {event.event_start && (
          <View style={c.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={TEXT_MUTED} />
            <Text style={c.metaText}>{fmtDate(event.event_start)}</Text>
            <Ionicons name="time-outline" size={13} color={TEXT_MUTED} style={{ marginLeft: 8 }} />
            <Text style={c.metaText}>{fmtTimeRange(event.event_start, event.event_end)}</Text>
          </View>
        )}

        {/* Mosque + distance */}
        <View style={c.metaRow}>
          <Ionicons name="location-outline" size={13} color={TEXT_MUTED} />
          <Text style={c.metaText} numberOfLines={1}>
            {event.mosque.name}
            {event.distanceMi < Infinity ? ` · ${event.distanceMi.toFixed(1)} mi` : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: CREAM },
  flex:  { flex: 1 },

  hero: {
    paddingHorizontal: 20, paddingBottom: 32, justifyContent: 'flex-end',
  },
  heroBg:      { resizeMode: 'cover' },
  heroOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14,38,24,0.62)' },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroTitle: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 4 },
  heroSub:   { fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 19 },

  // Search bar overlapping hero
  searchWrap: {
    marginHorizontal: 16, marginTop: -22, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  searchInput: { flex: 1, fontSize: 14, color: TEXT_DARK },

  // Category chips
  categoryRow:   { height: 52 },
  categoryScroll: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  categoryChipText:       { fontSize: 13, fontWeight: '600', color: TEXT_DARK },
  categoryChipTextActive: { color: '#fff' },

  // Location bar
  locationWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 4,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  locationInput: { flex: 1, fontSize: 13, color: TEXT_DARK },
  geoError:      { fontSize: 12, color: RED, marginHorizontal: 20, marginTop: 4 },

  // Day picker
  dayPickerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingLeft: 16 },
  dayScroll:    { gap: 8, paddingRight: 16 },
  dayChip: {
    alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: HAIRLINE, minWidth: 68,
  },
  dayChipAll:         { marginRight: 8 },
  dayChipActive:      { backgroundColor: DEEP_GREEN, borderColor: DEEP_GREEN },
  dayChipWeekday:     { fontSize: 11, fontWeight: '600', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.3 },
  dayChipDate:        { fontSize: 13, fontWeight: '700', color: TEXT_DARK, marginTop: 1 },
  dayChipLabel:       { fontSize: 13, fontWeight: '700', color: TEXT_DARK },
  dayChipLabelActive: { color: '#fff' },

  // Results
  list:        { paddingTop: 12, paddingHorizontal: 16 },
  resultCount: { fontSize: 13, color: TEXT_MUTED, fontWeight: '500', marginBottom: 10 },

  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },
  emptyText:  { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 19 },
  retryBtn:   { marginTop: 8, backgroundColor: DEEP_GREEN, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText:  { color: '#fff', fontSize: 13, fontWeight: '700' },
});

const c = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },

  colorBlock: {
    width: 80, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  content: { flex: 1, padding: 14, gap: 6 },

  categoryPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
    marginBottom: 2,
  },
  categoryPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },

  title: { fontSize: 15, fontWeight: '800', color: TEXT_DARK, lineHeight: 20 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: TEXT_MUTED, flexShrink: 1 },
});

const d = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },

  sheet: {
    backgroundColor: CREAM, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '88%', overflow: 'hidden',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginTop: 10, marginBottom: 2,
  },

  colorBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  categoryPill: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },
  categoryPillText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  closeBtn: {
    marginLeft: 'auto' as any,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },

  scroll:        { flexGrow: 0 },
  scrollContent: { padding: 20, gap: 16 },

  title: { fontSize: 20, fontWeight: '800', color: TEXT_DARK, lineHeight: 26 },

  metaBlock: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  metaRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  metaIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  metaLabel:    { fontSize: 11, fontWeight: '600', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue:    { fontSize: 14, fontWeight: '700', color: TEXT_DARK, marginTop: 1 },
  metaSubValue: { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },

  descBlock: { gap: 6 },
  descLabel: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  desc:      { fontSize: 14, color: TEXT_DARK, lineHeight: 21 },

  footer: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  footerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 14,
  },
  footerBtnSecondary: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  footerBtnSecondaryText: { fontSize: 14, fontWeight: '700', color: DEEP_GREEN },
  footerBtnText:          { fontSize: 14, fontWeight: '700', color: '#fff' },

  reminderWrap: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  reminderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
  },
  reminderBtnActive: {
    backgroundColor: DEEP_GREEN + '10', borderColor: DEEP_GREEN + '40',
  },
  reminderBtnText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
});
