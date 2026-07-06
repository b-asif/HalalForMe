import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, ImageBackground, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import * as Localization from 'expo-localization';

import {
  calculatePrayerTimes, formatPrayerTime,
  CalculationMethodKey, MadhabKey, PrayerName, PrayerTimesResult,
} from '../../lib/prayer/calculate';
import {
  resolveGpsCoordinates, resolveManualCity, resolveCountryCode, ResolvedCoordinates,
} from '../../lib/prayer/coordinates';
import {
  loadPrayerSettings, updatePrayerSettings, PrayerSettings,
} from '../../lib/prayer/settingsStore';
import { recommendedMethodFor } from '../../lib/prayer/methodDefaults';
import { rescheduleAllPrayerNotifications } from '../../lib/prayer/notifications';
import { recordScheduled } from '../../lib/prayer/notificationScheduleState';
import { registerBackgroundPrayerRefresh } from '../../lib/prayer/backgroundRefresh';
import { Brand } from '../../lib/theme';

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
  fajr: 'partly-sunny-outline', sunrise: 'sunny-outline', dhuhr: 'sunny-outline',
  asr: 'sunny-outline', maghrib: 'moon-outline', isha: 'moon-outline',
};
const PRAYER_ORDER: PrayerName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [settings, setSettings] = useState<PrayerSettings | null>(null);
  const [coords, setCoords] = useState<ResolvedCoordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>('Current location');
  const [locationError, setLocationError] = useState<string | null>(null);

  const [manualQuery, setManualQuery] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [times, setTimes] = useState<PrayerTimesResult | null>(null);
  const [now, setNow] = useState(() => new Date());

  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    registerBackgroundPrayerRefresh().catch(err => console.error('[home] background register failed:', err));
  }, []);

  const resolveLocationFromSettings = useCallback(async (s: PrayerSettings) => {
    setLocationError(null);
    let resolved: ResolvedCoordinates | null = null;

    if (s.locationMode === 'manual' && s.manualCity) {
      resolved = s.manualCity;
      setCoords(s.manualCity);
      setLocationLabel(s.manualCity.label);
    } else {
      const gps = await resolveGpsCoordinates();
      if (gps) {
        resolved = gps;
        setCoords(gps);
        setLocationLabel('Current location');
      } else {
        setCoords(null);
        setLocationError('Location permission denied or unavailable — search for your city in Settings.');
      }
    }

    if (!resolved) return;

    // Re-align the calculation method with the country the resolved location
    // is actually in — but only when that country changes, so a method the
    // user picked manually while staying in the same country is never
    // silently overwritten (e.g. reopening the app the next day in the same
    // city shouldn't reset a deliberate override).
    const countryCode = await resolveCountryCode(resolved.latitude, resolved.longitude);
    if (countryCode && countryCode !== s.lastCountryCode) {
      const recommended = recommendedMethodFor(countryCode);
      const next = await updatePrayerSettings({
        method: recommended.method,
        madhab: recommended.madhab,
        lastCountryCode: countryCode,
      });
      setSettings(next);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const regionCode = Localization.getLocales()[0]?.regionCode ?? null;
      const loaded = await loadPrayerSettings(regionCode);
      setSettings(loaded);
      await resolveLocationFromSettings(loaded);
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
      const result = await rescheduleAllPrayerNotifications(coords, settings);
      if (result.permissionGranted) await recordScheduled(coords.timeZone);
    })();
  }, [coords, settings]);

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

  return (
    <View style={s.flex}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* ── illustrated header ── */}
        <ImageBackground
          source={require('../../assets/MainImage.png')}
          style={s.heroBg}
          resizeMode="cover"
        >
          <View style={[s.headerRow, { paddingTop: insets.top + 16 }]}>
            <View>
              <Text style={s.greeting}>Assalamu Alaikum</Text>
              <Text style={s.dateText}>{DateTime.now().toFormat('cccc, LLLL d')}</Text>
            </View>
            <TouchableOpacity style={s.settingsBtn} onPress={() => setSettingsOpen(true)} hitSlop={10}>
              <Ionicons name="settings-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </ImageBackground>

        <View style={s.content}>
          {/* ── hero card — overlaps the bottom edge of the image above ── */}
          <View style={[s.heroCard, s.heroCardOverlap]}>
          {times && currentPrayer ? (
            <>
              <Text style={s.heroLabel}>Now</Text>
              <View style={s.heroRow}>
                <Text style={s.heroPrayer}>{PRAYER_LABELS[currentPrayer]}</Text>
                <Text style={s.heroTime}>{formatPrayerTime(times[currentPrayer], coords!.timeZone)}</Text>
              </View>
              {nextPrayer && (
                <View style={s.heroNextRow}>
                  <Ionicons name="time-outline" size={13} color={TEXT_MUTED} />
                  <Text style={s.heroNextText}>
                    {PRAYER_LABELS[nextPrayer]} in {countdownText} · {formatPrayerTime(nextPrayerTime!, coords!.timeZone)}
                  </Text>
                </View>
              )}
            </>
          ) : times && nextPrayer ? (
            // Between midnight and Fajr: no prayer has passed yet today, but the
            // next one (Fajr) is already resolved — show it instead of a
            // perpetual loading message.
            <>
              <Text style={s.heroLabel}>Next</Text>
              <View style={s.heroRow}>
                <Text style={s.heroPrayer}>{PRAYER_LABELS[nextPrayer]}</Text>
                <Text style={s.heroTime}>{formatPrayerTime(nextPrayerTime!, coords!.timeZone)}</Text>
              </View>
              <View style={s.heroNextRow}>
                <Ionicons name="time-outline" size={13} color={TEXT_MUTED} />
                <Text style={s.heroNextText}>in {countdownText}</Text>
              </View>
            </>
          ) : (
            <Text style={s.heroNextText}>Resolving prayer times…</Text>
          )}
        </View>

        <TouchableOpacity style={s.locationChip} onPress={() => setSettingsOpen(true)} activeOpacity={0.75}>
          <Ionicons name="location-outline" size={13} color={GREEN} />
          <Text style={s.locationChipText} numberOfLines={1}>{locationLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={TEXT_MUTED} />
        </TouchableOpacity>
        {locationError && <Text style={s.errorText}>{locationError}</Text>}

        {/* ── prayer strip ── */}
        <View style={s.stripCard}>
          {PRAYER_ORDER.map(p => {
            const active = p === currentPrayer;
            // Sunrise is never an actual prayer (no notification, can never be
            // "active"), so it's always muted; other prayers mute once they've
            // passed for the day — keeps the strip reading as a timeline
            // instead of six equally-weighted rows.
            const muted = !active && (p === 'sunrise' || (times ? times[p] <= now : false));
            return (
              <View key={p} style={[s.stripRow, active && s.stripRowActive]}>
                <View style={s.stripLeft}>
                  <Ionicons name={PRAYER_ICONS[p]} size={16} color={active ? GREEN : TEXT_MUTED} />
                  <Text style={[s.stripLabel, muted && s.stripLabelMuted, active && s.stripLabelActive]}>{PRAYER_LABELS[p]}</Text>
                </View>
                <Text style={[s.stripTime, muted && s.stripLabelMuted, active && s.stripLabelActive]}>
                  {times ? formatPrayerTime(times[p], coords!.timeZone) : '—'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── qibla quick-access ── */}
        <TouchableOpacity style={s.qiblaCard} onPress={() => router.push('/qibla')} activeOpacity={0.85}>
          <View style={s.qiblaIconWrap}>
            <Ionicons name="compass-outline" size={22} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.qiblaTitle}>Qibla</Text>
            <Text style={s.qiblaSub}>Find the direction to pray</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        </TouchableOpacity>
        </View>
      </ScrollView>

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

  heroBg: { width: '100%', height: 260, justifyContent: 'flex-start' },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20,
  },
  greeting: {
    fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 },
  },
  dateText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  settingsBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },

  locationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  locationChipText: { fontSize: 12, fontWeight: '600', color: TEXT_DARK, maxWidth: 200 },
  errorText: { fontSize: 12, color: RED, marginBottom: 12 },

  heroCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  // pulls the card up so it visually breaks across the image/cream boundary,
  // matching the reference design's overlapping card composition
  heroCardOverlap: { marginTop: -56 },
  heroLabel: { fontSize: 12, fontWeight: '700', color: GOLD, textTransform: 'uppercase', letterSpacing: 1 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6, marginBottom: 14 },
  heroPrayer: { fontSize: 30, fontWeight: '800', color: DEEP_GREEN, letterSpacing: -0.5 },
  heroTime: { fontSize: 22, fontWeight: '700', color: DEEP_GREEN, fontVariant: ['tabular-nums'] },
  heroNextRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: HAIRLINE, paddingTop: 12,
  },
  heroNextText: { fontSize: 13, color: TEXT_MUTED, fontWeight: '500' },

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

  qiblaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  qiblaIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center',
  },
  qiblaTitle: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  qiblaSub: { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CREAM, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '85%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd5c2', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: TEXT_DARK, marginBottom: 16 },

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

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: HAIRLINE },
  stepperBtnText: { fontSize: 18, fontWeight: '700', color: TEXT_DARK },
  stepperValue: { fontSize: 14, fontWeight: '700', color: TEXT_DARK, minWidth: 56, textAlign: 'center' },

  doneBtn: { backgroundColor: DEEP_GREEN, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 26 },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
