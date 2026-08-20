import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, ImageBackground, Linking, Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { DateTime } from 'luxon';
import * as Localization from 'expo-localization';

import { supabase } from '../../lib/supabase';
import { fetchRandomDua, Dua } from '../../lib/ummahApi';
import {
  calculatePrayerTimes, formatPrayerTime,
  CalculationMethodKey, MadhabKey, PrayerName, PrayerTimesResult,
} from '../../lib/prayer/calculate';
import {
  resolveGpsCoordinates, resolveManualCity, resolveCountryCode, ResolvedCoordinates,
  getForegroundPermissionStatus, loadCachedGpsCoordinates, saveGpsCoordinatesCache,
} from '../../lib/prayer/coordinates';
import {
  loadPrayerSettings, updatePrayerSettings, PrayerSettings,
} from '../../lib/prayer/settingsStore';
import { recommendedMethodFor } from '../../lib/prayer/methodDefaults';
import * as Notifications from 'expo-notifications';
import { rescheduleAllPrayerNotifications } from '../../lib/prayer/notifications';
import { recordScheduled } from '../../lib/prayer/notificationScheduleState';
import { registerBackgroundPrayerRefresh } from '../../lib/prayer/backgroundRefresh';
import { formatHijriDate } from '../../lib/prayer/hijri';
import { Mosque } from '../../lib/mosques/overpass';
import { fetchNearestMosquesIncludingManual, parseTimeOfDay } from '../../lib/mosques/manual';
import { Brand } from '../../lib/theme';
import { useAuth } from '../../contexts/AuthContext';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';

// ─── palette ────────────────────────────────────────────────────────────────

const CREAM = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const GOLD = Brand.gold;
const TEXT_DARK = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE = Brand.hairline;
const RED = Brand.red;

const METHOD_OPTIONS: { key: CalculationMethodKey; label: string }[] = [
  { key: 'NorthAmerica', label: 'ISNA' },
  { key: 'MoonsightingCommittee', label: 'Moonsighting Committee' },
  { key: 'MuslimWorldLeague', label: 'Muslim World League' },
  { key: 'Egyptian', label: 'Egyptian' },
  { key: 'Karachi', label: 'Karachi' },
  { key: 'UmmAlQura', label: 'Umm al-Qura' },
  { key: 'Dubai', label: 'Dubai' },
  { key: 'Kuwait', label: 'Kuwait' },
  { key: 'Qatar', label: 'Qatar' },
  { key: 'Singapore', label: 'Singapore' },
  { key: 'Tehran', label: 'Tehran' },
  { key: 'Turkey', label: 'Turkey (Diyanet)' },
];

const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};
const PRAYER_ICONS: Record<PrayerName, keyof typeof Ionicons.glyphMap> = {
  fajr:    'moon-outline',
  sunrise: 'sunny-outline',
  dhuhr:   'sunny-outline',
  asr:     'partly-sunny-outline',
  maghrib: 'sunny',
  isha:    'moon',
};
const PRAYER_ORDER: PrayerName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

type QuickAccessItem =
  | { key: string; label: string; iconType: 'image';   icon: number;   route: string }
  | { key: string; label: string; iconType: 'ionicon'; ionicon: string; route: string };

const QUICK_ACCESS: QuickAccessItem[] = [
  { key: 'qibla',   label: 'Qibla',   iconType: 'image', icon: require('../../assets/clock.png'),   route: '/qibla' },
  { key: 'food',    label: 'Food',    iconType: 'image', icon: require('../../assets/food.png'),    route: '/explore/food' },
  { key: 'mosques', label: 'Mosques', iconType: 'image', icon: require('../../assets/mosques.png'), route: '/mosques' },
  { key: 'quran',   label: 'Quran',   iconType: 'image', icon: require('../../assets/Quran.png'),   route: '/quran' },
  { key: 'duas',    label: 'Duas',    iconType: 'image', icon: require('../../assets/duas.png'),    route: '/duas' },
];


interface UpcomingEvent {
  id: string;
  title: string;
  body: string | null;
  eventStart: string;
  eventEnd: string | null;
  sourceUrl: string | null;
  mosqueName: string;
  mosqueOsmId: string;
}

interface UpcomingJummah {
  mosqueName: string;
  mosqueOsmId: string;
  time: string;
  khateeb: string | null;
  sortMinutes: number;
}

// Jummah is only useful to surface right before it happens — from Thursday
// evening (people planning tomorrow) through mid-afternoon Friday (after
// which any mosque's last session has surely finished). Outside that window
// the card stays hidden rather than showing stale info the rest of the week.
function isJummahWindow(now: Date): boolean {
  const day = now.getDay(); // 0=Sun ... 4=Thu, 5=Fri
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (day === 4) return minutes >= 18 * 60; // Thursday, from 6:00 PM
  if (day === 5) return minutes <= 15 * 60 + 30; // Friday, until 3:30 PM
  return false;
}

function relativeDayLabel(iso: string): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfDay(new Date(iso)).getTime() - startOfDay(new Date()).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short' });
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [settings, setSettings] = useState<PrayerSettings | null>(null);
  const [coords, setCoords] = useState<ResolvedCoordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>('Current location');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationPromptState, setLocationPromptState] = useState<'hidden' | 'undetermined' | 'denied'>('hidden');

  const [manualQuery, setManualQuery] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [times, setTimes] = useState<PrayerTimesResult | null>(null);
  const [now, setNow] = useState(() => new Date());

  const [notifPermStatus, setNotifPermStatus] = useState<'granted' | 'denied' | 'undetermined' | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [allPrayersOpen, setAllPrayersOpen] = useState(false);

  const [nearestMosque, setNearestMosque] = useState<Mosque | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [upcomingJummah, setUpcomingJummah] = useState<UpcomingJummah[]>([]);
  const [followedMosque, setFollowedMosque] = useState<{ id: string; name: string; iqamaTimes: Record<string, string> } | null>(null);

  const mosquesLoadedAt = useRef<number>(0);

  const [selectedEvent,  setSelectedEvent]  = useState<UpcomingEvent | null>(null);
  const [activeReminder,  setActiveReminder]  = useState<{ lead_minutes: number } | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);

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
    if (error) Alert.alert('Error', 'Could not save reminder. Please try again.');
    else setActiveReminder({ lead_minutes: leadMinutes });
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

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    registerBackgroundPrayerRefresh().catch(err => console.error('[home] background register failed:', err));
  }, []);

  const [dailyDua,    setDailyDua]    = useState<Dua | null>(null);
  const [duaModalOpen,setDuaModalOpen]= useState(false);

  useEffect(() => {
    fetchRandomDua()
      .then(d => setDailyDua(d))
      .catch(() => {});
  }, []);

  const resolveLocationFromSettings = useCallback(async (s: PrayerSettings) => {
    setLocationError(null);
    let resolved: ResolvedCoordinates | null = null;

    if (s.locationMode === 'manual' && s.manualCity) {
      resolved = s.manualCity;
      setCoords(s.manualCity);
      setLocationLabel(s.manualCity.label);
    } else {
      // Load cached coords first — renders prayer times instantly on relaunch
      // while the real GPS fix is in flight in the background.
      const cached = await loadCachedGpsCoordinates();
      if (cached) {
        setCoords(cached);
        setLocationLabel('Current location');
      }

      const permStatus = await getForegroundPermissionStatus();
      if (permStatus === 'denied') {
        // Already denied — no native dialog will appear; guide the user to Settings.
        setLocationPromptState('denied');
        setCoords(null);
        return;
      }
      // Permission is granted or undetermined. For undetermined, resolveGpsCoordinates
      // will trigger the native iOS location dialog automatically — the right moment
      // to ask is when the app first needs location for prayer times.
      setLocationPromptState('hidden');
      const gps = await resolveGpsCoordinates();
      if (gps) {
        resolved = gps;
        setCoords(gps);
        setLocationLabel('Current location');
        saveGpsCoordinatesCache(gps);
      } else if (!cached) {
        // GPS failed and no cache to fall back on — prompt the user.
        setLocationPromptState('denied');
        setCoords(null);
      }
      // If GPS failed but cached coords exist, keep showing them rather than
      // blanking the screen — a transient GPS failure shouldn't erase prayer times.
    }

    if (!resolved) return;

    // Re-align the calculation method with the country the resolved location
    // is actually in — but only when that country changes, so a method the
    // user picked manually while staying in the same country is never
    // silently overwritten (e.g. reopening the app the next day in the same
    // city shouldn't reset a deliberate override).
    // NOTE: madhab is intentionally excluded — it's a personal religious
    // choice that should never be overwritten by a location change.
    const countryCode = await resolveCountryCode(resolved.latitude, resolved.longitude);
    if (countryCode && countryCode !== s.lastCountryCode) {
      const recommended = recommendedMethodFor(countryCode);
      const next = await updatePrayerSettings({
        method: recommended.method,
        lastCountryCode: countryCode,
      });
      setSettings(next);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
        const loaded = await loadPrayerSettings(regionCode);
        setSettings(loaded);
        await resolveLocationFromSettings(loaded);
      } catch (err) {
        console.error('[home] loadPrayerSettings failed:', err);
        // Fallback: load with no region so we get safe defaults instead of hanging
        try {
          const fallback = await loadPrayerSettings(null);
          setSettings(fallback);
          await resolveLocationFromSettings(fallback);
        } catch {
          // ignore — spinner will show until user restarts, but at least we logged
        }
      }
    })();
  }, [resolveLocationFromSettings]);

  useEffect(() => {
    if (!coords || !settings) { setTimes(null); return; }
    const result = calculatePrayerTimes({
      latitude: coords.latitude,
      longitude: coords.longitude,
      timeZone: coords.timeZone,
      method: settings.method,
      madhab: settings.madhab,
      manualAdjustmentsMinutes: settings.manualAdjustmentsMinutes,
    });
    setTimes(result);
  }, [coords, settings]);

  useEffect(() => {
    if (!coords || !settings) return;
    (async () => {
      // Check current permission status; if undetermined, ask now via the
      // native iOS dialog — this is the right moment because the user has
      // just seen their prayer times and understands the value of reminders.
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (existing === 'undetermined') {
        const { status: requested } = await Notifications.requestPermissionsAsync();
        status = requested;
      }
      setNotifPermStatus(status as 'granted' | 'denied' | 'undetermined');

      const result = await rescheduleAllPrayerNotifications(coords, settings);
      if (result.permissionGranted) await recordScheduled(coords.timeZone);
    })();
  }, [coords, settings]);



  // When the user changes their city in prayer settings and returns to Home,
  // the mount-time useEffect above won't re-run, so coords stays stale.
  // This lightweight focus effect re-reads the stored manual city and updates
  // coords immediately — no GPS call, no notification reschedule, just a
  // storage read so the events/mosque widgets reflect the new location.
  useFocusEffect(useCallback(() => {
    (async () => {
      const stored = await loadPrayerSettings(null);
      if (stored.locationMode === 'manual' && stored.manualCity) {
        setCoords(prev => {
          const next = stored.manualCity!;
          if (prev?.latitude === next.latitude && prev?.longitude === next.longitude) return prev;
          return next;
        });
        setLocationLabel(stored.manualCity.label);
        setSettings(stored);
      }
    })();
  }, []));

  // useFocusEffect (not useEffect) — this needs to refetch every time Home
  // regains focus, not just when coords changes, so that events/Jummah
  // sessions an admin just added on the manage screen actually show up
  // after navigating back here instead of only on the next coords change.
  useFocusEffect(useCallback(() => {
    if (!coords) { setNearestMosque(null); setUpcomingEvents([]); setUpcomingJummah([]); return; }
    // Skip re-fetch if data was loaded less than 5 minutes ago — switching tabs
    // should not re-hit the network every time when the data is still fresh.
    const FIVE_MIN = 5 * 60 * 1000;
    if (Date.now() - mosquesLoadedAt.current < FIVE_MIN) return;
    let cancelled = false;

    // ── Phase 1: Supabase only (~200 ms) ─────────────────────────────────────
    // Query our own mosque table immediately so we can show the nearest mosque,
    // events, and Jummah times without waiting for the Overpass API.
    (async () => {
      try {
        const radiusKm = 15;
        const latDelta = radiusKm / 111;
        const lngDelta = radiusKm / (111 * Math.cos(coords.latitude * (Math.PI / 180)));

        const { data: mosqueRows, error: mosqueErr } = await supabase
          .from('mosques')
          .select('id, name, osm_id, lat, lng, jummah_sessions')
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .gte('lat', coords.latitude  - latDelta)
          .lte('lat', coords.latitude  + latDelta)
          .gte('lng', coords.longitude - lngDelta)
          .lte('lng', coords.longitude + lngDelta);
        if (mosqueErr) throw mosqueErr;

        if (!cancelled && mosqueRows && mosqueRows.length > 0) {
          // Pick the nearest row by Haversine approximation
          const nearest = mosqueRows.reduce((best, m) => {
            const dLat = m.lat - coords.latitude;
            const dLng = m.lng - coords.longitude;
            const d = dLat * dLat + dLng * dLng;
            const bLat = best.lat - coords.latitude;
            const bLng = best.lng - coords.longitude;
            return d < bLat * bLat + bLng * bLng ? m : best;
          });
          const distMi = Math.sqrt(
            Math.pow((nearest.lat - coords.latitude) * 69, 2) +
            Math.pow((nearest.lng - coords.longitude) * 69 * Math.cos(coords.latitude * Math.PI / 180), 2)
          );
          setNearestMosque({
            id: nearest.osm_id ?? nearest.id,
            name: nearest.name,
            address: null,
            lat: nearest.lat,
            lng: nearest.lng,
            distanceMi: distMi,
          } as any);

          // Events from nearby Supabase mosques
          const mosqueById = new Map(mosqueRows.map(m => [m.id, m]));
          const { data: eventRows } = await supabase
            .from('mosque_posts')
            .select('id, title, body, event_start, event_end, source_url, mosque_id')
            .eq('type', 'event')
            .gte('event_start', new Date().toISOString())
            .in('mosque_id', mosqueRows.map(m => m.id))
            .order('event_start', { ascending: true })
            .limit(5);

          const events: UpcomingEvent[] = (eventRows ?? [])
            .filter(e => e.event_start && mosqueById.has(e.mosque_id) && mosqueById.get(e.mosque_id)!.osm_id)
            .map(e => ({
              id: e.id,
              title: e.title,
              body: e.body ?? null,
              eventStart: e.event_start as string,
              eventEnd: e.event_end ?? null,
              sourceUrl: e.source_url ?? null,
              mosqueName: mosqueById.get(e.mosque_id)!.name,
              mosqueOsmId: mosqueById.get(e.mosque_id)!.osm_id,
            }));
          if (!cancelled) setUpcomingEvents(events);

          const jummah: UpcomingJummah[] = mosqueRows
            .filter(m => m.osm_id)
            .flatMap(m => ((m.jummah_sessions as { time: string; khateeb: string | null }[] | null) ?? [])
              .map(session => {
                const parsed = parseTimeOfDay(session.time);
                return {
                  mosqueName: m.name,
                  mosqueOsmId: m.osm_id,
                  time: session.time,
                  khateeb: session.khateeb,
                  sortMinutes: parsed ? parsed.getHours() * 60 + parsed.getMinutes() : 0,
                };
              }))
            .sort((a, b) => a.sortMinutes - b.sortMinutes);
          if (!cancelled) {
            setUpcomingJummah(jummah);
            mosquesLoadedAt.current = Date.now();
          }
        }
      } catch (err) {
        console.error('[home] phase-1 mosque fetch failed:', err);
      }
    })();

    // ── Phase 2: Overpass (background, 2-6 s) ────────────────────────────────
    // After the fast Supabase data is already shown, run the OSM lookup.
    // Only update nearestMosque if Overpass finds something closer.
    (async () => {
      try {
        const nearby = await fetchNearestMosquesIncludingManual(
          coords.latitude, coords.longitude, 15_000, 20,
        );
        if (!cancelled && nearby.length > 0) {
          // Replace only if Overpass result is closer than what Supabase found
          setNearestMosque(prev => {
            if (!prev) return nearby[0];
            const overpassDist = nearby[0].distanceMi ?? Infinity;
            const currentDist  = (prev as any).distanceMi ?? Infinity;
            return overpassDist < currentDist ? nearby[0] : prev;
          });
        }
      } catch (err) {
        // Non-critical — Supabase result already shown
        console.error('[home] phase-2 Overpass fetch failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [coords]));

  // Supplementary Iqama annotation for a mosque the user has chosen to
  // follow (lib/prayer/settingsStore.ts) — purely additive to the computed
  // Adhan countdown above, never a substitute for it. Deliberately reads
  // followedMosqueId fresh from storage on every focus rather than off the
  // `settings` state above — that state is only ever loaded once on mount
  // (see the location-resolution effect), so a follow/unfollow made on the
  // mosque page — a different screen — would otherwise never reach Home
  // without a full app reload.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadPrayerSettings(null);
      const followedId = stored.followedMosqueId;
      if (!followedId) { if (!cancelled) setFollowedMosque(null); return; }
      try {
        const { data } = await supabase
          .from('mosques')
          .select('id, name, iqama_times')
          .eq('id', followedId)
          .maybeSingle();
        if (cancelled) return;
        setFollowedMosque(data ? { id: data.id, name: data.name, iqamaTimes: data.iqama_times ?? {} } : null);
      } catch {
        if (!cancelled) setFollowedMosque(null);
      }
    })();
    return () => { cancelled = true; };
  }, []));

  const openMosqueDirections = (mosque: Mosque) => {
    const q = encodeURIComponent(mosque.address || mosque.name);
    const url = Platform.OS === 'ios' ? `maps://0,0?q=${q}` : `geo:0,0?q=${q}`;
    Linking.canOpenURL(url).then(supported =>
      Linking.openURL(supported ? url : `https://maps.google.com/?q=${q}`)
    );
  };

  const applySettingsPatch = async (patch: Partial<PrayerSettings>) => {
    if (!settings) return;
    const next = await updatePrayerSettings(patch);
    setSettings(next);
    if (patch.locationMode || patch.manualCity) await resolveLocationFromSettings(next);
  };

  const searchManualCity = async () => {
    if (!manualQuery.trim()) return;
    setGeoLoading(true);
    setGeoError(null);
    const city = await resolveManualCity(manualQuery);
    setGeoLoading(false);
    if (!city) { setGeoError('Could not find that city. Try a different search.'); return; }
    await applySettingsPatch({ locationMode: 'manual', manualCity: city });
  };

  const useGps = async () => applySettingsPatch({ locationMode: 'gps' });

  // Called when the user taps "Turn On Prayer Reminders" after a denial.
  // Triggers the native dialog if iOS will show it; otherwise opens Settings.
  const handleEnableNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifPermStatus(status as 'granted' | 'denied' | 'undetermined');
    if (status === 'granted') {
      // Permission granted — reschedule now that we have access.
      if (coords && settings) {
        const result = await rescheduleAllPrayerNotifications(coords, settings);
        if (result.permissionGranted) await recordScheduled(coords.timeZone);
      }
    } else {
      // iOS will not show the dialog again — guide the user to Settings.
      Linking.openSettings();
    }
  };

  const adjustMaghribBuffer = async (delta: number) => {
    if (!settings) return;
    const current = settings.manualAdjustmentsMinutes.maghrib ?? 0;
    const next = Math.max(0, current + delta);
    await applySettingsPatch({ manualAdjustmentsMinutes: { ...settings.manualAdjustmentsMinutes, maghrib: next } });
  };

  if (!settings) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </SafeAreaView>
    );
  }

  const maghribBuffer = settings.manualAdjustmentsMinutes.maghrib ?? 0;

  // current + next prayer, and a countdown to next
  let currentPrayer: PrayerName | null = null;
  let nextPrayer: PrayerName | null = null;
  let nextPrayerTime: Date | null = null;
  let countdownText = '';
  if (times && coords) {
    const notifiable = PRAYER_ORDER.filter(p => p !== 'sunrise');
    for (let i = notifiable.length - 1; i >= 0; i--) {
      if (times[notifiable[i]] <= now) { currentPrayer = notifiable[i]; break; }
    }
    for (const p of notifiable) {
      if (times[p] > now) { nextPrayer = p; nextPrayerTime = times[p]; break; }
    }
    if (!nextPrayer) {
      // Past Isha — the next prayer is tomorrow's Fajr, which isn't in today's `times`.
      const tomorrow = DateTime.fromJSDate(now).setZone(coords.timeZone).plus({ days: 1 }).toJSDate();
      const tomorrowTimes = calculatePrayerTimes({
        latitude: coords.latitude,
        longitude: coords.longitude,
        timeZone: coords.timeZone,
        date: tomorrow,
        method: settings.method,
        madhab: settings.madhab,
        manualAdjustmentsMinutes: settings.manualAdjustmentsMinutes,
      });
      nextPrayer = 'fajr';
      nextPrayerTime = tomorrowTimes.fajr;
    }
    if (nextPrayerTime) {
      const diff = DateTime.fromJSDate(nextPrayerTime).diff(DateTime.fromJSDate(now), ['hours', 'minutes']);
      const h = Math.floor(diff.hours);
      const m = Math.round(diff.minutes);
      countdownText = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
  }

  // Progress through the current prayer window (previous prayer -> next
  // prayer) — only defined once a previous prayer for today is known; the
  // pre-Fajr window (no previous prayer yet today) just shows an empty bar
  // rather than guessing against yesterday's Isha.
  let progressFraction = 0;
  if (times && currentPrayer && nextPrayerTime) {
    const start = times[currentPrayer].getTime();
    const end = nextPrayerTime.getTime();
    progressFraction = end > start ? Math.min(1, Math.max(0, (now.getTime() - start) / (end - start))) : 0;
  }

  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* ── illustrated header ── */}
        <View style={s.heroBg}>
          <Image
            source={require('../../assets/background.png')}
            style={StyleSheet.absoluteFill}
            // Pixel-measured (not eyeballed): the tallest minaret spire sits
            // at dead-center horizontally (~49.5% across) in this source
            // image, not left or right. "cover" (full-bleed, no letterbox)
            // at the default centered position keeps the spire equidistant
            // from both corner UI elements (greeting text top-left, gear
            // button top-right) — collision needs overlap in both x and y,
            // and centering means it never shares their x-position, however
            // tall it reaches. (An earlier attempt pushed this left instead,
            // which put the spire directly under the gear button — that was
            // the actual bug, not insufficient header height.)
            contentFit="cover"
          />
          <View style={[s.headerRow, { paddingTop: insets.top + 16 }]}>
            <View>
              <Text style={s.greeting}>Assalamu Alaikum</Text>
              <Text style={s.dateText}>{DateTime.now().toFormat('cccc, LLLL d, yyyy')}</Text>
              <Text style={s.dateText}>{formatHijriDate(now)}</Text>
            </View>
            <TouchableOpacity style={s.settingsBtn} onPress={() => setSettingsOpen(true)} hitSlop={10}>
              <Ionicons name="settings-outline" size={20} color={DEEP_GREEN} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.content}>
          {/* ── hero card — overlaps the bottom edge of the image above ── */}
          <ImageBackground
            source={require('../../assets/prayerBlock.png')}
            style={[s.heroCard, s.heroCardOverlap]}
            imageStyle={s.heroCardImage}
            resizeMode="cover"
          >
            <View style={s.heroTopRow}>
              <Text style={s.heroLabel}>NEXT PRAYER</Text>
              <TouchableOpacity style={s.viewAllPill} onPress={() => setAllPrayersOpen(true)} activeOpacity={0.8}>
                <Text style={s.viewAllPillText}>View All Prayers</Text>
                <Ionicons name="chevron-forward" size={13} color="#fff" />
              </TouchableOpacity>
            </View>

            {times && nextPrayer ? (
              <>
                <Text style={s.heroPrayerBig}>{PRAYER_LABELS[nextPrayer]}</Text>
                <Text style={s.heroCountdown}>in {countdownText}</Text>

                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${progressFraction * 100}%` }]} />
                  <View style={[s.progressThumb, { left: `${progressFraction * 100}%` }]} />
                </View>

                <Text style={s.heroFooterText}>
                  {formatPrayerTime(nextPrayerTime!, coords!.timeZone)} · {formatHijriDate(now)}
                </Text>
                {followedMosque?.iqamaTimes[nextPrayer] && (
                  <Text style={s.heroIqamaText}>
                    Iqama {followedMosque.iqamaTimes[nextPrayer]} at {followedMosque.name}
                  </Text>
                )}
              </>
            ) : locationPromptState !== 'hidden' ? (
              <Text style={s.heroFooterText}>Set your location to see prayer times</Text>
            ) : (
              <Text style={s.heroFooterText}>Resolving prayer times…</Text>
            )}
          </ImageBackground>

        <TouchableOpacity style={s.locationChip} onPress={() => setSettingsOpen(true)} activeOpacity={0.75}>
          <Ionicons name="location-outline" size={13} color={GREEN} />
          <Text style={s.locationChipText} numberOfLines={1}>{locationLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={TEXT_MUTED} />
        </TouchableOpacity>
        {locationError && locationPromptState === 'hidden' && <Text style={s.errorText}>{locationError}</Text>}
        {locationPromptState === 'denied' && (
          <View style={s.locationPromptCard}>
            <View style={s.locationPromptRow}>
              <Ionicons name="location-outline" size={18} color={GREEN} />
              <Text style={s.locationPromptText}>
                Location access denied — enable in Settings for accurate prayer times
              </Text>
            </View>
            <TouchableOpacity style={s.locationPromptBtnOutline} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
              <Text style={s.locationPromptBtnOutlineText}>Enable in iOS Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSettingsOpen(true)} hitSlop={8}>
              <Text style={s.locationPromptLink}>Search for a city instead</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── notification permission banner (shown after denial) ── */}
        {notifPermStatus === 'denied' && (
          <View style={s.notifBanner}>
            <Ionicons name="notifications-off-outline" size={16} color={TEXT_MUTED} />
            <Text style={s.notifBannerText}>Prayer reminders are off</Text>
            <TouchableOpacity onPress={handleEnableNotifications} style={s.notifBannerBtn} activeOpacity={0.8}>
              <Text style={s.notifBannerBtnText}>Turn On</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── quick access ── */}
        <View style={s.quickAccessCard}>
          {QUICK_ACCESS.map(item => (
            <TouchableOpacity
              key={item.key}
              style={s.quickAccessItem}
              onPress={() => {
                if (item.key === 'food' && coords) {
                  router.push({
                    pathname: '/explore/food' as any,
                    params: {
                      lat: String(coords.latitude),
                      lng: String(coords.longitude),
                      locationLabel,
                      category: 'restaurant',
                    },
                  });
                } else {
                  router.push(item.route as any);
                }
              }}
              activeOpacity={0.8}
            >
              <View style={s.quickAccessIconWrap}>
                {item.iconType === 'image'
                  ? <Image source={item.icon} style={s.quickAccessIconImg} contentFit="contain" />
                  : <Ionicons name={item.ionicon as any} size={28} color={DEEP_GREEN} />}
              </View>
              <Text style={s.quickAccessLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── daily dua row ── */}
        {dailyDua && (
          <TouchableOpacity style={s.duaRow} onPress={() => setDuaModalOpen(true)} activeOpacity={0.8}>
            <View style={s.duaRowIcon}>
              <Ionicons name="hand-left-outline" size={16} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.duaRowLabel}>DAILY DUA</Text>
              <Text style={s.duaRowTitle} numberOfLines={1}>{dailyDua.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
          </TouchableOpacity>
        )}

        {/* ── nearby mosque ── */}
        {nearestMosque && (
          <View style={s.nearbySection}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Nearest Mosque</Text>
              <TouchableOpacity onPress={() => router.push('/mosques' as any)} hitSlop={8}>
                <Text style={s.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={s.nearbyMosqueRow}
              onPress={() => router.push(`/mosque/${nearestMosque.id.replace('/', ':')}` as any)}
              activeOpacity={0.85}
            >
              <View style={s.nearbyMosqueIcon}>
                <Image source={require('../../assets/micon.png')} style={s.nearbyIconBadgeImg} contentFit="cover" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nearbyName} numberOfLines={1}>{nearestMosque.name}</Text>
                <Text style={s.nearbyMeta}>{nearestMosque.distanceMi.toFixed(1)} mi away</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── upcoming jummah (Thursday evening through Friday 3:30 PM only) ── */}
        {isJummahWindow(now) && upcomingJummah.length > 0 && (
          <View style={s.eventsCard}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Upcoming Jummah</Text>
              <TouchableOpacity onPress={() => router.push('/jummah' as any)} hitSlop={8}>
                <Text style={s.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            {upcomingJummah.map((j, i) => (
              <TouchableOpacity
                key={`${j.mosqueOsmId}-${i}`}
                style={s.eventRow}
                onPress={() => router.push(`/mosque/${j.mosqueOsmId.replace('/', ':')}` as any)}
                activeOpacity={0.75}
              >
                <View style={s.eventDateBadge}>
                  <Ionicons name="time-outline" size={18} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.eventTitle} numberOfLines={1}>{j.time} · {j.mosqueName}</Text>
                  <Text style={s.eventMeta} numberOfLines={1}>
                    {j.khateeb ? `Khateeb: ${j.khateeb}` : 'Khateeb not yet announced'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── upcoming events (nearby, claimed mosque pages only) ── */}
        {upcomingEvents.length > 0 && (
          <View style={s.eventsCard}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Upcoming Events</Text>
              <TouchableOpacity onPress={() => router.push('/events' as any)} hitSlop={8}>
                <Text style={s.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            {upcomingEvents.map(ev => (
              <TouchableOpacity
                key={ev.id}
                style={s.eventRow}
                onPress={() => setSelectedEvent(ev)}
                activeOpacity={0.75}
              >
                <View style={s.eventDateBadge}>
                  <Text style={s.eventDateMonth}>
                    {new Date(ev.eventStart).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                  </Text>
                  <Text style={s.eventDateDay}>{new Date(ev.eventStart).getDate()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.eventTitle} numberOfLines={1}>{ev.title}</Text>
                  <Text style={s.eventMeta} numberOfLines={1}>
                    {relativeDayLabel(ev.eventStart)} · {formatEventTime(ev.eventStart)} · {ev.mosqueName}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        </View>
      </ScrollView>

      {/* ── daily dua sheet ── */}
      {/* ── event detail sheet ── */}
      <Modal visible={!!selectedEvent} animationType="slide" transparent onRequestClose={() => setSelectedEvent(null)}>
        <View style={m.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSelectedEvent(null)} />
          <View style={[m.sheet, { paddingBottom: insets.bottom + 24 }]}>
            {selectedEvent ? (
              <>
                <View style={m.handle} />
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={m.eventModalMosque}>{selectedEvent.mosqueName.toUpperCase()}</Text>
                  <Text style={m.eventModalTitle}>{selectedEvent.title}</Text>
                  <View style={m.eventModalRow}>
                    <Ionicons name="time-outline" size={15} color={GREEN} />
                    <Text style={m.eventModalMeta}>
                      {relativeDayLabel(selectedEvent.eventStart)},{' '}
                      {new Date(selectedEvent.eventStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' · '}
                      {formatEventTime(selectedEvent.eventStart)}
                      {selectedEvent.eventEnd ? ` – ${formatEventTime(selectedEvent.eventEnd)}` : ''}
                    </Text>
                  </View>
                  {selectedEvent.body ? (
                    <Text style={m.eventModalBody}>{selectedEvent.body}</Text>
                  ) : null}
                </ScrollView>
                {selectedEvent.sourceUrl ? (
                  <TouchableOpacity
                    style={m.eventModalLink}
                    onPress={() => Linking.openURL(selectedEvent!.sourceUrl!)}
                  >
                    <Ionicons name="open-outline" size={15} color={GREEN} />
                    <Text style={m.eventModalLinkText}>View on website</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[m.eventModalMosqueBtn, m.eventModalReminderBtn, activeReminder && m.eventModalReminderBtnActive]}
                  onPress={() => {
                    if (!user) {
                      setSelectedEvent(null);
                      setGuestLoginIntent(true);
                      router.push('/(auth)/login');
                    } else if (activeReminder) {
                      Alert.alert(
                        'Remove Reminder',
                        `Remove your ${activeReminder.lead_minutes === 60 ? '1 hour' : '1 day'} reminder?`,
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
                >
                  {reminderLoading
                    ? <ActivityIndicator size="small" color={activeReminder ? GREEN : TEXT_MUTED} />
                    : <Ionicons
                        name={activeReminder ? 'notifications' : 'notifications-outline'}
                        size={15}
                        color={activeReminder ? GREEN : TEXT_MUTED}
                      />
                  }
                  <Text style={[m.eventModalMosqueBtnText, activeReminder ? { color: GREEN } : { color: TEXT_MUTED }]}>
                    {activeReminder
                      ? `Reminder set (${activeReminder.lead_minutes === 60 ? '1 hr' : '1 day'} before) · Remove`
                      : !user ? 'Sign in to set a reminder' : 'Set Reminder'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={m.eventModalMosqueBtn}
                  onPress={() => { setSelectedEvent(null); router.push(`/mosque/${selectedEvent.mosqueOsmId.replace('/', ':')}` as any); }}
                >
                  <Text style={m.eventModalMosqueBtnText}>View Mosque Page</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── dua sheet ── */}
      <Modal visible={duaModalOpen} animationType="slide" transparent onRequestClose={() => setDuaModalOpen(false)}>
        <View style={m.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDuaModalOpen(false)} />
          <View style={[m.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={m.handle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <View style={s.duaRowIcon}>
                <Ionicons name="hand-left-outline" size={16} color={GOLD} />
              </View>
              <Text style={m.sheetTitle}>Daily Dua</Text>
              <TouchableOpacity onPress={() => setDuaModalOpen(false)} hitSlop={12} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close" size={22} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>
            {dailyDua && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={m.duaArabic}>{dailyDua.arabic}</Text>
                {dailyDua.transliteration ? (
                  <Text style={m.duaTranslit}>{dailyDua.transliteration}</Text>
                ) : null}
                <View style={{ height: 1, backgroundColor: HAIRLINE, marginVertical: 16 }} />
                <Text style={m.duaTitle}>{dailyDua.title}</Text>
                <Text style={m.duaTranslation}>{dailyDua.translation}</Text>
                {dailyDua.reference ? (
                  <Text style={m.duaRef}>{dailyDua.reference}</Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── all prayers sheet ── */}
      <Modal visible={allPrayersOpen} animationType="slide" transparent onRequestClose={() => setAllPrayersOpen(false)}>
        <View style={m.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setAllPrayersOpen(false)} />
          <View style={[m.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={m.handle} />
            <Text style={m.sheetTitle}>Today's Prayers</Text>
            <View style={s.stripCard}>
              {PRAYER_ORDER.map(p => {
                const active = p === currentPrayer;
                // Sunrise is never an actual prayer (no notification, can never
                // be "active"), so it's always muted; other prayers mute once
                // they've passed for the day — keeps the strip reading as a
                // timeline instead of six equally-weighted rows.
                const muted = !active && (p === 'sunrise' || (times ? times[p] <= now : false));
                const iqama = followedMosque?.iqamaTimes[p];
                return (
                  <View key={p} style={[s.stripRow, active && s.stripRowActive]}>
                    <View style={s.stripLeft}>
                      <Ionicons name={PRAYER_ICONS[p]} size={16} color={active ? GREEN : TEXT_MUTED} />
                      <Text style={[s.stripLabel, muted && s.stripLabelMuted, active && s.stripLabelActive]}>{PRAYER_LABELS[p]}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.stripTime, muted && s.stripLabelMuted, active && s.stripLabelActive]}>
                        {times ? formatPrayerTime(times[p], coords!.timeZone) : '—'}
                      </Text>
                      {iqama && <Text style={s.stripIqamaText}>Iqama {iqama}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* ── mosque iqama follow ── */}
            <View style={m.mosqueFollowDivider} />
            <TouchableOpacity
              style={m.mosqueFollowRow}
              activeOpacity={0.7}
              onPress={() => { setAllPrayersOpen(false); router.push('/mosques?iqamaOnly=true'); }}
            >
              <View style={m.mosqueFollowIcon}>
                <Ionicons
                  name={followedMosque ? 'checkmark-circle' : 'business-outline'}
                  size={18}
                  color={followedMosque ? GREEN : TEXT_MUTED}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={m.mosqueFollowLabel} numberOfLines={1}>
                  {followedMosque ? followedMosque.name : 'Add iqama times'}
                </Text>
                <Text style={m.mosqueFollowSub}>
                  {followedMosque ? 'Iqama times source' : 'Find a mosque to follow'}
                </Text>
              </View>
              <Text style={m.mosqueFollowChangeText}>
                {followedMosque ? 'Change' : '›'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── settings sheet ── */}
      <Modal visible={settingsOpen} animationType="slide" transparent onRequestClose={() => setSettingsOpen(false)}>
        <View style={m.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSettingsOpen(false)} />
          <View style={[m.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={m.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={m.sheetTitle}>Prayer Settings</Text>

              <Text style={m.sectionLabel}>Location</Text>
              <TouchableOpacity
                style={[m.chip, settings.locationMode === 'gps' && m.chipActive]}
                onPress={useGps}
              >
                <Text style={[m.chipText, settings.locationMode === 'gps' && m.chipTextActive]}>
                  Use current location
                </Text>
              </TouchableOpacity>
              <View style={m.searchRow}>
                <TextInput
                  style={m.input}
                  placeholder="Search city or zip…"
                  placeholderTextColor="#aaa"
                  value={manualQuery}
                  onChangeText={setManualQuery}
                  onSubmitEditing={searchManualCity}
                  returnKeyType="search"
                />
                <TouchableOpacity style={m.searchBtn} onPress={searchManualCity} disabled={geoLoading}>
                  {geoLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={m.searchBtnText}>Go</Text>}
                </TouchableOpacity>
              </View>
              {geoError && <Text style={m.errorText}>{geoError}</Text>}
              {coords && (
                <Text style={m.metaText}>
                  {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)} — {coords.timeZone}
                </Text>
              )}

              <Text style={m.sectionLabel}>Calculation Method</Text>
              <View style={m.chipWrap}>
                {METHOD_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[m.chip, settings.method === opt.key && m.chipActive]}
                    onPress={() => applySettingsPatch({ method: opt.key })}
                  >
                    <Text style={[m.chipText, settings.method === opt.key && m.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={m.sectionLabel}>Madhab (Asr)</Text>
              <View style={m.chipWrap}>
                {(['shafi', 'hanafi'] as MadhabKey[]).map(mk => (
                  <TouchableOpacity
                    key={mk}
                    style={[m.chip, settings.madhab === mk && m.chipActive]}
                    onPress={() => applySettingsPatch({ madhab: mk })}
                  >
                    <Text style={[m.chipText, settings.madhab === mk && m.chipTextActive]}>
                      {mk === 'shafi' ? "Shafi'i / Maliki / Hanbali" : 'Hanafi'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={m.sectionLabel}>Maghrib Precaution Buffer</Text>
              <View style={m.stepperRow}>
                <TouchableOpacity style={m.stepperBtn} onPress={() => adjustMaghribBuffer(-1)}>
                  <Text style={m.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={m.stepperValue}>{maghribBuffer} min</Text>
                <TouchableOpacity style={m.stepperBtn} onPress={() => adjustMaghribBuffer(1)}>
                  <Text style={m.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <Text style={m.sectionLabel}>Followed Mosque</Text>
              {followedMosque ? (
                <View style={m.followedMosqueRow}>
                  <Text style={m.followedMosqueName} numberOfLines={1}>{followedMosque.name}</Text>
                  <TouchableOpacity onPress={() => { applySettingsPatch({ followedMosqueId: null }); setFollowedMosque(null); }}>
                    <Text style={m.followedMosqueClear}>Stop Following</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={m.metaText}>
                  Not following a mosque yet — visit any mosque's page and tap "Follow for Iqama Times" to see its Iqama time alongside your prayer countdown.
                </Text>
              )}

              <TouchableOpacity style={m.doneBtn} onPress={() => setSettingsOpen(false)}>
                <Text style={m.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM },
  content: { paddingHorizontal: 20 },

  // 430 isn't arbitrary — at 32.8% down (where the source image's tallest
  // minaret spire begins, pixel-measured), this clears the gear button's
  // bottom edge (insets.top + 16 + 38) with margin on Dynamic Island devices.
  heroBg: {
    width: '100%', height: 260, justifyContent: 'flex-start', position: 'relative', overflow: 'hidden',
    backgroundColor: CREAM,
  },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20,
  },
  greeting: { fontSize: 24, fontWeight: '800', color: GREEN, letterSpacing: -0.3 },
  dateText: { fontSize: 13, color: TEXT_MUTED, marginTop: 2 },
  settingsBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  locationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  locationChipText: { fontSize: 12, fontWeight: '600', color: TEXT_DARK, maxWidth: 200 },
  errorText: { fontSize: 12, color: RED, marginBottom: 12 },

  locationPromptCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    gap: 10,
  },
  locationPromptRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationPromptText: { fontSize: 13, fontWeight: '500', color: TEXT_DARK, flex: 1 },
  locationPromptBtnOutline: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: GREEN, borderRadius: 10, paddingVertical: 10,
  },
  locationPromptBtnOutlineText: { color: GREEN, fontWeight: '700', fontSize: 13 },
  locationPromptLink: { fontSize: 12, color: TEXT_MUTED, textAlign: 'center' },

  notifBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  notifBannerText: { flex: 1, fontSize: 13, color: TEXT_MUTED },
  notifBannerBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: GREEN, borderRadius: 8,
  },
  notifBannerBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  heroCard: {
    backgroundColor: DEEP_GREEN, borderRadius: 24, padding: 22, marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  heroCardImage: { borderRadius: 24 },
  // pulls the card up so it visually breaks across the image/cream boundary,
  // matching the reference design's overlapping card composition
  heroCardOverlap: { marginTop: -56 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heroLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 },
  viewAllPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  viewAllPillText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  heroPrayerBig: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 4 },
  heroCountdown: { fontSize: 16, fontWeight: '700', color: '#A8E6BB', marginBottom: 18 },
  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 14,
  },
  progressFill: {
    position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2, backgroundColor: '#A8E6BB',
  },
  progressThumb: {
    position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#fff', marginLeft: -6,
  },
  heroFooterText: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500', fontVariant: ['tabular-nums'] },
  heroIqamaText: { fontSize: 12, color: '#A8E6BB', fontWeight: '600', marginTop: 4 },

  stripCard: {
    backgroundColor: '#fff', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  stripRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  stripRowActive: {
    borderTopColor: 'transparent',
    backgroundColor: '#EFF6F1', borderRadius: 14,
    marginHorizontal: -10, paddingHorizontal: 10,
  },
  stripLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stripLabel: { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  stripLabelActive: { color: GREEN, fontWeight: '800' },
  stripLabelMuted: { color: TEXT_MUTED, fontWeight: '500' },
  stripTime: { fontSize: 14, color: TEXT_DARK, fontVariant: ['tabular-nums'] },
  stripIqamaText: { fontSize: 11, color: GREEN, fontWeight: '600', marginTop: 1 },

  quickAccessCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  quickAccessItem: { flex: 1, alignItems: 'center' },

  // compact dua row
  duaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  duaRowIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(176,141,87,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  duaRowLabel: { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  duaRowTitle: { fontSize: 14, fontWeight: '600', color: TEXT_DARK },

  quickAccessIconWrap: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: CREAM, borderWidth: 1, borderColor: HAIRLINE,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6, overflow: 'hidden',
  },
  quickAccessIconImg: { width: 52, height: 52 },
  quickAccessLabel: { fontSize: 11, fontWeight: '600', color: TEXT_DARK },

  nearbySection: { marginBottom: 16 },
  nearbyMosqueRow: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  nearbyMosqueIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: TEXT_DARK },
  seeAllText: { fontSize: 13, fontWeight: '600', color: GREEN },

  nearbyCard: {
    width: 140, marginRight: 12, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  nearbyImageWrap: { width: '100%', height: 84, backgroundColor: '#EFF6F1', position: 'relative' },
  nearbyImageFill: { width: '100%', height: 84 },
  nearbyIconBadge: {
    position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 14,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  nearbyIconBadgeImg: { width: 26, height: 26 },
  nearbyBody: { padding: 10 },
  nearbyName: { fontSize: 13, fontWeight: '700', color: TEXT_DARK },
  nearbyMeta: { fontSize: 11, color: TEXT_MUTED, marginTop: 2 },

  eventsCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: HAIRLINE, marginTop: 10,
  },
  eventDateBadge: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center',
  },
  eventDateMonth: { fontSize: 10, fontWeight: '700', color: GREEN, letterSpacing: 0.5 },
  eventDateDay: { fontSize: 16, fontWeight: '800', color: TEXT_DARK, marginTop: -1 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  eventMeta: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CREAM, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '85%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd5c2', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: TEXT_DARK },

  // dua modal
  duaArabic:      { fontSize: 26, color: TEXT_DARK, textAlign: 'right', lineHeight: 44, marginBottom: 12 },
  duaTranslit:    { fontSize: 13, fontStyle: 'italic', color: TEXT_MUTED, marginBottom: 4 },
  duaTitle:       { fontSize: 15, fontWeight: '700', color: TEXT_DARK, marginBottom: 8 },
  duaTranslation: { fontSize: 14, color: TEXT_DARK, lineHeight: 22, marginBottom: 10 },
  duaRef:         { fontSize: 12, color: GOLD, fontStyle: 'italic' },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: GOLD, textTransform: 'uppercase',
    letterSpacing: 0.6, marginTop: 18, marginBottom: 10,
  },

  chip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE, alignSelf: 'flex-start',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipActive: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { fontSize: 13, fontWeight: '600', color: TEXT_DARK },
  chipTextActive: { color: '#fff' },

  searchRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: {
    flex: 1, borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: TEXT_DARK, backgroundColor: '#fff',
  },
  searchBtn: { backgroundColor: GREEN, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  errorText: { fontSize: 12, color: RED, marginTop: 6 },
  metaText: { fontSize: 11, color: TEXT_MUTED, marginTop: 8 },

  followedMosqueRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: HAIRLINE,
  },
  followedMosqueName: { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT_DARK, marginRight: 10 },
  followedMosqueClear: { fontSize: 12, fontWeight: '700', color: RED },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: HAIRLINE },
  stepperBtnText: { fontSize: 18, fontWeight: '700', color: TEXT_DARK },
  stepperValue: { fontSize: 14, fontWeight: '700', color: TEXT_DARK, minWidth: 56, textAlign: 'center' },

  doneBtn: { backgroundColor: DEEP_GREEN, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 26 },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  mosqueFollowDivider: { height: 1, backgroundColor: HAIRLINE, marginTop: 12, marginBottom: 12 },
  mosqueFollowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  mosqueFollowIcon: { width: 28, alignItems: 'center' },
  mosqueFollowLabel: { fontSize: 13, fontWeight: '600', color: TEXT_DARK },
  mosqueFollowSub: { fontSize: 11, color: TEXT_MUTED, marginTop: 1 },
  mosqueFollowChangeText: { fontSize: 13, fontWeight: '600', color: DEEP_GREEN },

  eventModalMosque:    { fontSize: 11, fontWeight: '700', color: GOLD, letterSpacing: 0.8, marginBottom: 6 },
  eventModalTitle:     { fontSize: 18, fontWeight: '800', color: TEXT_DARK, marginBottom: 12 },
  eventModalRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  eventModalMeta:      { fontSize: 13, color: TEXT_MUTED, flex: 1 },
  eventModalBody:      { fontSize: 14, color: TEXT_DARK, lineHeight: 22, marginTop: 4, marginBottom: 12 },
  eventModalLink:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  eventModalLinkText:  { fontSize: 14, color: GREEN, fontWeight: '600' },
  eventModalMosqueBtn: { marginTop: 8, backgroundColor: DEEP_GREEN, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  eventModalMosqueBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  eventModalReminderBtn: {
    flexDirection: 'row', gap: 6, justifyContent: 'center',
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  eventModalReminderBtnActive: { backgroundColor: GREEN + '12', borderColor: GREEN + '40' },

});
