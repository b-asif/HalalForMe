import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Brand } from '../../../lib/theme';
import { parseTimeOfDay, formatTimeOfDay } from '../../../lib/mosques/manual';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const RED        = Brand.red;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

const IQAMA_FIELDS: { key: string; label: string }[] = [
  { key: 'fajr',    label: 'Fajr'    },
  { key: 'dhuhr',   label: 'Dhuhr'   },
  { key: 'asr',     label: 'Asr'     },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha',    label: 'Isha'    },
];

interface JummahSession {
  time: string;
  khateeb: string | null;
  hall?: string | null;
}

interface JummahSessionDraft {
  time: Date | null;
  khateeb: string;
  hall: string;
}

interface SyncPreview {
  iqama_times: Record<string, string | null> | null;
  jummah_sessions: Array<{ time: string; khateeb: string | null; hall: string | null }>;
  events: any[];
  sources: string[];
  notes: string | null;
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const SOURCE_LABEL: Record<string, string> = {
  mawaqit: 'Mawaqit', masjidal: 'Masjidal', masjidi: 'Masjidi',
  tockify: 'Tockify', vision: 'Vision (AI)', 'event-platform': 'Event Platform',
  'json-ld': 'Structured Data', 'google-calendar': 'Google Calendar',
  ical: 'iCal Feed', website: 'Website',
};

export default function PrayerTimesScreen() {
  const { id: mosqueId, section } = useLocalSearchParams<{ id: string; section?: string }>();
  const showIqama  = !section || section === 'iqama';
  const showJummah = !section || section === 'jummah';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAdmin } = useAuth();

  const [mosqueName, setMosqueName] = useState('');
  const [website,    setWebsite]    = useState('');
  const [iqamaTimes,     setIqamaTimes]     = useState<Record<string, Date | null>>({});
  const [jummahSessions, setJummahSessions] = useState<JummahSessionDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [iqamaUpdatedAt, setIqamaUpdatedAt] = useState<string | null>(null);

  const originalIqamaRef  = useRef<Record<string, string> | null>(null);
  const originalJummahRef = useRef<string | null>(null); // JSON snapshot for change detection

  // Sync
  const [syncing,       setSyncing]       = useState(false);
  const [syncPreview,   setSyncPreview]   = useState<SyncPreview | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [importIqama,   setImportIqama]   = useState(true);
  const [importJummah,  setImportJummah]  = useState(true);

  const loadData = useCallback(async () => {
    if (!mosqueId || !user) return;
    setLoading(true);
    const { data: m } = await supabase
      .from('mosques')
      .select('id, name, owner_id, website, iqama_times, jummah_sessions, iqama_updated_at')
      .eq('id', mosqueId)
      .maybeSingle();

    if (!m || (m.owner_id !== user.id && !isAdmin)) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    setMosqueName(m.name ?? '');
    setWebsite(m.website ?? '');
    setIqamaUpdatedAt((m as any).iqama_updated_at ?? null);
    originalIqamaRef.current  = m.iqama_times ?? null;
    originalJummahRef.current = JSON.stringify(m.jummah_sessions ?? []);
    setIqamaTimes(
      Object.fromEntries(
        IQAMA_FIELDS.map(f => [
          f.key,
          m.iqama_times?.[f.key] ? parseTimeOfDay(m.iqama_times[f.key]) : null,
        ]),
      ),
    );
    setJummahSessions(
      ((m.jummah_sessions ?? []) as JummahSession[]).map(j => ({
        time:    parseTimeOfDay(j.time),
        khateeb: j.khateeb ?? '',
        hall:    j.hall ?? '',
      })),
    );
    setLoading(false);
  }, [mosqueId, user, isAdmin]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleSave = async () => {
    setSaving(true);
    try {
      const iqamaPayload: Record<string, string> = {};
      IQAMA_FIELDS.forEach(f => {
        const v = iqamaTimes[f.key];
        if (v) iqamaPayload[f.key] = formatTimeOfDay(v);
      });
      const jummahPayload: JummahSession[] = jummahSessions
        .filter(j => j.time)
        .map(j => ({
          time:    formatTimeOfDay(j.time!),
          khateeb: j.khateeb.trim() || null,
          hall:    j.hall.trim() || null,
        }));

      const now = new Date().toISOString();
      const { error } = await supabase
        .from('mosques')
        .update({
          iqama_times:      Object.keys(iqamaPayload).length > 0 ? iqamaPayload : null,
          jummah_sessions:  jummahPayload.length > 0 ? jummahPayload : null,
          iqama_updated_at: now,
        })
        .eq('id', mosqueId);
      if (error) throw new Error(error.message);
      setIqamaUpdatedAt(now);

      // Notify followers based on what changed
      const sortKeys = (obj: Record<string, string>) =>
        JSON.stringify(Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]])));
      const prevIqama  = originalIqamaRef.current ?? {};
      const iqamaChanged  = sortKeys(iqamaPayload) !== sortKeys(prevIqama);
      const jummahChanged = JSON.stringify(jummahPayload) !== originalJummahRef.current;

      if (iqamaChanged && user) {
        supabase.functions.invoke('notify-mosque-followers', {
          body: { mosqueId, mosqueName },
        }).then(() => {}).catch(() => {});
        originalIqamaRef.current = iqamaPayload;
      }
      if (jummahChanged && user) {
        supabase.functions.invoke('notify-mosque-followers', {
          body: {
            mosqueId,
            mosqueName,
            notifTitle: `Jummah schedule updated at ${mosqueName}`,
            notifBody:  'Tap to see the updated Jummah times.',
          },
        }).then(() => {}).catch(() => {});
        originalJummahRef.current = JSON.stringify(jummahPayload);
      }
      Alert.alert('Saved', 'Prayer times updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const doSync = async () => {
    if (!website) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-mosque-website', {
        body: { url: website, mosqueId, force: true, scope: 'times' },
      });
      if (error || (data as any)?.error) throw new Error(error?.message ?? (data as any)?.error ?? 'Sync failed');
      const preview = data as SyncPreview;
      setSyncPreview(preview);
      setImportIqama(true);
      setImportJummah(true);
      setShowSyncModal(true);
    } catch (e: any) {
      Alert.alert('Sync Failed', e.message ?? 'Could not read data from this website.');
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmSync = async () => {
    if (!syncPreview) return;
    const mosqueUpdate: Record<string, any> = {};

    if (importIqama && syncPreview.iqama_times) {
      const mergedIqama: Record<string, string> = {};
      IQAMA_FIELDS.forEach(f => {
        const extracted = syncPreview.iqama_times![f.key];
        if (extracted) mergedIqama[f.key] = extracted;
      });
      if (Object.keys(mergedIqama).length > 0) {
        mosqueUpdate.iqama_times = mergedIqama;
        mosqueUpdate.iqama_updated_at = new Date().toISOString();
        setIqamaTimes(
          Object.fromEntries(
            IQAMA_FIELDS.map(f => [
              f.key,
              mergedIqama[f.key] ? parseTimeOfDay(mergedIqama[f.key]) : (iqamaTimes[f.key] ?? null),
            ]),
          ),
        );
      }
    }

    if (importJummah && (syncPreview.jummah_sessions?.length ?? 0) > 0) {
      mosqueUpdate.jummah_sessions = syncPreview.jummah_sessions.map(j => ({
        time: j.time, khateeb: j.khateeb || null, hall: j.hall || null,
      }));
      setJummahSessions(
        syncPreview.jummah_sessions.map(j => ({
          time:    parseTimeOfDay(j.time),
          khateeb: j.khateeb ?? '',
          hall:    j.hall ?? '',
        })),
      );
    }

    if (Object.keys(mosqueUpdate).length > 0) {
      const { error } = await supabase.from('mosques').update(mosqueUpdate).eq('id', mosqueId);
      if (error) { Alert.alert('Save Error', error.message); return; }
      if (mosqueUpdate.iqama_updated_at) setIqamaUpdatedAt(mosqueUpdate.iqama_updated_at);
    }

    supabase.from('mosques')
      .update({ last_website_sync_at: new Date().toISOString() })
      .eq('id', mosqueId).then(() => {}).catch(() => {});

    setShowSyncModal(false);
    setSyncPreview(null);
    Alert.alert('Synced', 'Prayer times and Jummah sessions saved.');
  };

  const addJummahSession = () =>
    setJummahSessions(prev => [...prev, { time: null, khateeb: '', hall: '' }]);
  const updateJummahSession = (i: number, patch: Partial<JummahSessionDraft>) =>
    setJummahSessions(prev => prev.map((j, idx) => idx === i ? { ...j, ...patch } : j));
  const removeJummahSession = (i: number) =>
    setJummahSessions(prev => prev.filter((_, idx) => idx !== i));

  const screenTitle = section === 'jummah' ? 'Jummah Times' : 'Prayer Times';

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} title={screenTitle} onSave={null} saving={false} />
        <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
      </SafeAreaView>
    );
  }

  if (unauthorized) {
    return (
      <SafeAreaView style={s.flex}>
        <Header router={router} title={screenTitle} onSave={null} saving={false} />
        <View style={s.centered}>
          <Ionicons name="lock-closed-outline" size={40} color={TEXT_MUTED} />
          <Text style={s.unauthorizedText}>You don't manage this mosque's page.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <Header router={router} title={screenTitle} onSave={handleSave} saving={saving} />
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Iqama Times */}
        {showIqama && (
          <>
            <View style={s.sectionLabelRow}>
              <Text style={[s.sectionLabel, { marginBottom: 0 }]}>IQAMA TIMES</Text>
              {iqamaUpdatedAt && (
                <Text style={s.sectionUpdated}>Updated {formatUpdatedAt(iqamaUpdatedAt)}</Text>
              )}
            </View>
            <View style={s.card}>
              <View style={s.iqamaGrid}>
                {IQAMA_FIELDS.map(f => (
                  <PickerField
                    key={f.key}
                    label={f.label}
                    mode="time"
                    value={iqamaTimes[f.key] ?? null}
                    onChange={d => setIqamaTimes(prev => ({ ...prev, [f.key]: d }))}
                    style={s.iqamaGridItem}
                  />
                ))}
              </View>
            </View>
          </>
        )}

        {/* Jummah */}
        {showJummah && (
          <>
            <Text style={[s.sectionLabel, { marginTop: showIqama ? 24 : 0 }]}>JUMMAH SESSIONS</Text>
            <Text style={s.sectionHint}>Add a session for each Jummah khutbah time.</Text>
            {jummahSessions.map((j, i) => (
              <View key={i} style={[s.card, { marginTop: 10, gap: 0 }]}>
                <View style={s.jummahCardHeader}>
                  <Text style={s.jummahCardLabel}>Session {i + 1}</Text>
                  <TouchableOpacity onPress={() => removeJummahSession(i)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={16} color={RED} />
                  </TouchableOpacity>
                </View>
                <PickerField
                  label="Time"
                  mode="time"
                  value={j.time}
                  onChange={d => updateJummahSession(i, { time: d })}
                />
                <Text style={s.fieldLabel}>Hall / Room (optional)</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Main Prayer Hall"
                  placeholderTextColor={TEXT_MUTED}
                  value={j.hall}
                  onChangeText={v => updateJummahSession(i, { hall: v })}
                />
                <Text style={s.fieldLabel}>Khateeb (optional)</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Imam Ahmed"
                  placeholderTextColor={TEXT_MUTED}
                  value={j.khateeb}
                  onChangeText={v => updateJummahSession(i, { khateeb: v })}
                />
              </View>
            ))}
            <TouchableOpacity style={s.addBtn} onPress={addJummahSession} activeOpacity={0.85}>
              <Ionicons name="add-circle-outline" size={18} color={GREEN} />
              <Text style={s.addBtnText}>Add Jummah Session</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Sync from website */}
        {website ? (
          <>
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>WEBSITE SYNC</Text>
            <TouchableOpacity
              style={[s.syncBtn, syncing && s.btnDisabled]}
              onPress={doSync}
              disabled={syncing}
              activeOpacity={0.85}
            >
              {syncing ? (
                <ActivityIndicator color={DEEP_GREEN} size="small" />
              ) : (
                <>
                  <Ionicons name="globe-outline" size={16} color={DEEP_GREEN} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.syncBtnText}>Sync from Website</Text>
                    <Text style={s.syncBtnHint}>Automatically import times from {website.replace(/^https?:\/\//, '')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={DEEP_GREEN} />
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={s.syncNudge}
            onPress={() => router.push(`/mosque/${mosqueId}/portal-settings` as any)}
            activeOpacity={0.75}
          >
            <Ionicons name="globe-outline" size={18} color={TEXT_MUTED} />
            <Text style={s.syncNudgeText}>
              Add your mosque website in Page Settings to enable automatic time syncing.{' '}
              <Text style={{ color: DEEP_GREEN, fontWeight: '700' }}>Go to Settings →</Text>
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Sync preview modal */}
      <Modal visible={showSyncModal} transparent animationType="slide" onRequestClose={() => setShowSyncModal(false)}>
        <View style={pm.overlay}>
          <View style={pm.sheet}>
            <View style={pm.header}>
              <Text style={pm.title}>Website Sync</Text>
              {syncPreview?.sources && syncPreview.sources.length > 0 && (
                <View style={pm.badgeRow}>
                  {syncPreview.sources.map(src => (
                    <View key={src} style={pm.badge}>
                      <Text style={pm.badgeText}>{SOURCE_LABEL[src] ?? src}</Text>
                    </View>
                  ))}
                </View>
              )}
              {syncPreview?.notes ? <Text style={pm.notes}>{syncPreview.notes}</Text> : null}
            </View>
            <ScrollView style={pm.scroll} contentContainerStyle={pm.scrollContent}>
              <SyncSection
                label="Iqama Times"
                enabled={importIqama}
                onToggle={setImportIqama}
                hasData={Object.values(syncPreview?.iqama_times ?? {}).some(Boolean)}
              >
                {IQAMA_FIELDS.map(f => {
                  const val = syncPreview?.iqama_times?.[f.key];
                  return val ? (
                    <View key={f.key} style={pm.row}>
                      <Text style={pm.rowLabel}>{f.label}</Text>
                      <Text style={pm.rowValue}>{val}</Text>
                    </View>
                  ) : null;
                })}
              </SyncSection>
              <SyncSection
                label={`Jummah Sessions (${syncPreview?.jummah_sessions?.length ?? 0})`}
                enabled={importJummah}
                onToggle={setImportJummah}
                hasData={(syncPreview?.jummah_sessions?.length ?? 0) > 0}
              >
                {syncPreview?.jummah_sessions?.map((j, i) => (
                  <View key={i} style={pm.row}>
                    <Text style={pm.rowLabel}>{j.time}{j.hall ? ` · ${j.hall}` : ''}</Text>
                    {j.khateeb ? <Text style={pm.rowValue}>{j.khateeb}</Text> : null}
                  </View>
                ))}
              </SyncSection>
            </ScrollView>
            <View style={pm.footer}>
              <TouchableOpacity style={pm.cancelBtn} onPress={() => setShowSyncModal(false)}>
                <Text style={pm.cancelBtnText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[pm.confirmBtn, (!importIqama && !importJummah) && pm.confirmBtnDisabled]}
                onPress={handleConfirmSync}
                disabled={!importIqama && !importJummah}
                activeOpacity={0.85}
              >
                <Text style={pm.confirmBtnText}>Apply Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SyncSection({ label, enabled, onToggle, hasData, children }: {
  label: string; enabled: boolean; onToggle: (v: boolean) => void; hasData: boolean; children: React.ReactNode;
}) {
  return (
    <View style={pm.section}>
      <View style={pm.sectionHeader}>
        <Text style={[pm.sectionLabel, !hasData && pm.dimmed]}>{label}{!hasData ? ' — none found' : ''}</Text>
        {hasData && <Switch value={enabled} onValueChange={onToggle} trackColor={{ false: '#e0e0e0', true: GREEN }} thumbColor="#fff" />}
      </View>
      {enabled && hasData && children}
    </View>
  );
}

function Header({ router, title, onSave, saving }: {
  router: ReturnType<typeof useRouter>; title: string;
  onSave: (() => void) | null; saving: boolean;
}) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
      </TouchableOpacity>
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      {onSave ? (
        <TouchableOpacity onPress={onSave} disabled={saving} style={s.saveTextBtn} hitSlop={8}>
          {saving
            ? <ActivityIndicator size="small" color={DEEP_GREEN} />
            : <Text style={s.saveTextBtnText}>Save</Text>}
        </TouchableOpacity>
      ) : (
        <View style={{ width: 52 }} />
      )}
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

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) setDraft(selected);
  };

  const formatted = value
    ? mode === 'date'
      ? value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : 'Not set';

  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity style={[s.dateBtn, !value && s.dateBtnEmpty]} onPress={open} activeOpacity={0.75}>
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={15} color={value ? GREEN : TEXT_MUTED} />
        <Text style={[s.dateBtnText, !value && s.dateBtnTextEmpty]} numberOfLines={1}>{formatted}</Text>
      </TouchableOpacity>
      {value && (
        <TouchableOpacity onPress={() => onChange(null)} style={s.clearBtn}>
          <Text style={s.clearBtnText}>Clear</Text>
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

const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: HAIRLINE, gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: TEXT_DARK },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { backgroundColor: '#e6f9f2', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', color: DEEP_GREEN },
  notes: { fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 20, gap: 4 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: TEXT_DARK, flex: 1 },
  dimmed: { color: TEXT_MUTED, fontWeight: '500' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  rowLabel: { fontSize: 13, fontWeight: '600', color: TEXT_DARK, flex: 1 },
  rowValue: { fontSize: 13, color: TEXT_MUTED, marginLeft: 8 },
  footer: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1, borderTopColor: HAIRLINE },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: TEXT_MUTED },
  confirmBtn: { flex: 1, backgroundColor: DEEP_GREEN, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  confirmBtnDisabled: { opacity: 0.4 },
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
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: CREAM,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: TEXT_DARK, textAlign: 'center', marginHorizontal: 8 },
  saveTextBtn: { width: 52, alignItems: 'flex-end' },
  saveTextBtnText: { fontSize: 15, fontWeight: '700', color: DEEP_GREEN },

  content: { padding: 20 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: TEXT_MUTED, letterSpacing: 0.8, marginBottom: 10 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionUpdated: { fontSize: 11, color: TEXT_MUTED },
  sectionHint: { fontSize: 13, color: TEXT_MUTED, marginBottom: 12, marginTop: -6 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: TEXT_MUTED, marginBottom: 6 },
  input: {
    backgroundColor: CREAM, borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: TEXT_DARK, marginBottom: 14,
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CREAM, borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12,
  },
  dateBtnEmpty: { borderColor: HAIRLINE },
  dateBtnText: { fontSize: 13, fontWeight: '600', color: TEXT_DARK, flexShrink: 1 },
  dateBtnTextEmpty: { color: TEXT_MUTED, fontWeight: '400' },
  clearBtn: { alignSelf: 'flex-start', marginTop: 4 },
  clearBtnText: { fontSize: 12, color: RED },

  iqamaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  iqamaGridItem: { width: '47%', marginBottom: 0 },

  jummahCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  jummahCardLabel: { fontSize: 13, fontWeight: '700', color: TEXT_DARK },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#c3e8d8', backgroundColor: '#f0faf6',
    borderRadius: 12, paddingVertical: 12, marginTop: 10,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: GREEN },

  syncBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: DEEP_GREEN,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
  },
  syncBtnText: { fontSize: 14, fontWeight: '700', color: DEEP_GREEN },
  syncBtnHint: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  syncNudge: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#f8f8f8', borderRadius: 12, padding: 14, marginTop: 16,
  },
  syncNudgeText: { flex: 1, fontSize: 13, color: TEXT_MUTED, lineHeight: 18 },

  btnDisabled: { opacity: 0.65 },
});
