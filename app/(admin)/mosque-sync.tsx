import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, RefreshControl, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { formatError } from '../../lib/errors';
import { Brand } from '../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const CREAM      = Brand.cream;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const AMBER      = Brand.amber;
const RED        = Brand.red;

type Tab = 'review' | 'cost';

interface SyncCacheRow {
  id: string;
  mosque_id: string;
  source_url: string;
  extraction_method: 'deterministic' | 'llm_fallback' | 'cached';
  confidence: 'high' | 'medium' | 'low' | null;
  needs_review: boolean;
  review_status: 'pending' | 'approved' | 'rejected';
  warnings: string[] | null;
  estimated_llm_cost: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model_used: string | null;
  last_checked_at: string;
  last_changed_at: string | null;
  extracted_data_json: any;
  mosques: { name: string } | null;
}

interface CostRow {
  mosque_id: string;
  mosque_name: string;
  llm_calls: number;
  total_cost: number;
  last_method: string;
  last_checked_at: string;
}

interface MonthlySummary {
  totalLlmCalls: number;
  totalCost: number;
  avgCostPerMosque: number;
  deterministicCount: number;
  llmFallbackCount: number;
  cachedCount: number;
  lowConfidenceCount: number;
}

function iqamaTimesEqual(
  a: Record<string, string | null> | null | undefined,
  b: Record<string, string | null> | null | undefined,
): boolean {
  for (const key of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    if ((a?.[key] ?? null) !== (b?.[key] ?? null)) return false;
  }
  return true;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatCost(n: number | null) {
  if (n == null || n === 0) return '$0.00';
  if (n < 0.001) return `$${(n * 100000).toFixed(2)}µ`;
  return `$${n.toFixed(4)}`;
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, { bg: string; fg: string; label: string }> = {
    deterministic: { bg: '#e8f5e9', fg: '#2e7d32', label: 'Deterministic' },
    llm_fallback:  { bg: '#fff8e1', fg: '#f57f17', label: 'LLM Fallback' },
    cached:        { bg: '#e3f2fd', fg: '#1565c0', label: 'Cached' },
  };
  const c = colors[method] ?? { bg: '#f5f5f5', fg: '#666', label: method };
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <Text style={[s.badgeText, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

function ConfidenceBadge({ conf }: { conf: string | null }) {
  if (!conf) return null;
  const colors: Record<string, { bg: string; fg: string }> = {
    high:   { bg: '#e8f5e9', fg: '#2e7d32' },
    medium: { bg: '#fff8e1', fg: '#f57f17' },
    low:    { bg: '#ffebee', fg: '#c62828' },
  };
  const c = colors[conf] ?? { bg: '#f5f5f5', fg: '#666' };
  return (
    <View style={[s.badge, { backgroundColor: c.bg, marginLeft: 6 }]}>
      <Text style={[s.badgeText, { color: c.fg }]}>{conf.charAt(0).toUpperCase() + conf.slice(1)}</Text>
    </View>
  );
}

function IqamaRow({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={s.iqamaRow}>
      <Text style={s.iqamaLabel}>{label}</Text>
      <Text style={[s.iqamaValue, !value && s.iqamaNull]}>{value ?? '—'}</Text>
    </View>
  );
}

export default function MosqueSyncScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('review');

  // Review tab state
  const [pendingRows, setPendingRows] = useState<SyncCacheRow[]>([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewRefreshing, setReviewRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Cost tab state
  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [costLoading, setCostLoading] = useState(true);
  const [batchSyncing, setBatchSyncing] = useState(false);

  const loadReview = useCallback(async () => {
    const { data } = await supabase
      .from('mosque_sync_cache')
      .select(`
        id, mosque_id, source_url, extraction_method, confidence,
        needs_review, review_status, warnings,
        estimated_llm_cost, input_tokens, output_tokens, model_used,
        last_checked_at, last_changed_at, extracted_data_json,
        mosques(name)
      `)
      .eq('needs_review', true)
      .eq('review_status', 'pending')
      .order('last_changed_at', { ascending: false });

    setPendingRows((data as unknown as SyncCacheRow[]) ?? []);
    setReviewLoading(false);
    setReviewRefreshing(false);
  }, []);

  const loadCost = useCallback(async () => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('mosque_sync_cache')
      .select(`
        mosque_id, extraction_method, confidence,
        estimated_llm_cost, last_checked_at,
        mosques(name)
      `)
      .gte('last_checked_at', monthStart.toISOString())
      .order('last_checked_at', { ascending: false });

    if (!data) { setCostLoading(false); return; }

    // Aggregate by mosque
    const byMosque: Record<string, CostRow> = {};
    let totalCost = 0, llmCalls = 0, detCount = 0, cacheCount = 0, lowCount = 0;

    for (const row of data as any[]) {
      const mosqueId = row.mosque_id;
      const mosqueName = row.mosques?.name ?? mosqueId;
      const cost = row.estimated_llm_cost ?? 0;

      if (!byMosque[mosqueId]) {
        byMosque[mosqueId] = {
          mosque_id: mosqueId,
          mosque_name: mosqueName,
          llm_calls: 0,
          total_cost: 0,
          last_method: row.extraction_method,
          last_checked_at: row.last_checked_at,
        };
      }

      if (row.extraction_method === 'llm_fallback') {
        byMosque[mosqueId].llm_calls++;
        byMosque[mosqueId].total_cost += cost;
        totalCost += cost;
        llmCalls++;
      } else if (row.extraction_method === 'deterministic') {
        detCount++;
      } else if (row.extraction_method === 'cached') {
        cacheCount++;
      }
      if (row.confidence === 'low') lowCount++;
    }

    const rows = Object.values(byMosque).sort((a, b) => b.total_cost - a.total_cost);
    const mosqueCount = rows.length;
    setCostRows(rows);
    setSummary({
      totalLlmCalls: llmCalls,
      totalCost,
      avgCostPerMosque: mosqueCount > 0 ? totalCost / mosqueCount : 0,
      deterministicCount: detCount,
      llmFallbackCount: llmCalls,
      cachedCount: cacheCount,
      lowConfidenceCount: lowCount,
    });
    setCostLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    setReviewLoading(true);
    setCostLoading(true);
    loadReview();
    loadCost();
  }, [loadReview, loadCost]));

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleApprove = async (row: SyncCacheRow) => {
    Alert.alert(
      'Approve & Publish',
      `This will overwrite ${row.mosques?.name ?? 'this mosque'}'s prayer times and add any new events. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActing(row.id);
            try {
              const data = row.extracted_data_json;

              // Write iqama times back to the mosque row
              if (data?.iqama_times) {
                const { data: current } = await supabase
                  .from('mosques')
                  .select('iqama_times')
                  .eq('id', row.mosque_id)
                  .maybeSingle();

                await supabase
                  .from('mosques')
                  .update({
                    iqama_times: data.iqama_times,
                    jummah_sessions: data.jummah_sessions?.length ? data.jummah_sessions : undefined,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', row.mosque_id);

                // Admin manually tapped Approve — human-triggered, so notify
                // immediately (no deferral queue, unlike the unattended
                // auto-publish path in parse-mosque-website/index.ts).
                if (!iqamaTimesEqual(current?.iqama_times ?? null, data.iqama_times)) {
                  supabase.functions.invoke('notify-mosque-followers', {
                    body: { mosqueId: row.mosque_id, mosqueName: row.mosques?.name },
                  }).then(() => {}).catch(() => {});
                }
              }

              // Insert events that aren't already present
              if (data?.events?.length) {
                const newPosts = (data.events as any[])
                  .filter(e => e.event_start)
                  .map(e => ({
                    mosque_id:   row.mosque_id,
                    type:        'event',
                    title:       e.title,
                    body:        e.body ?? null,
                    category:    e.category ?? null,
                    event_start: e.event_start,
                    event_end:   e.event_end ?? null,
                    source_url:  e.source_url ?? row.source_url,
                  }));

                if (newPosts.length) {
                  await supabase.from('mosque_posts').upsert(newPosts, {
                    onConflict: 'mosque_id,title,event_start',
                    ignoreDuplicates: true,
                  });
                }
              }

              // Mark as approved
              await supabase
                .from('mosque_sync_cache')
                .update({ review_status: 'approved', reviewed_at: new Date().toISOString() })
                .eq('id', row.id);

              setPendingRows(prev => prev.filter(r => r.id !== row.id));
            } catch (e: any) {
              console.error('[admin/mosque-sync] approve error:', e);
              Alert.alert('Error', formatError(e) || 'Failed to approve sync');
            } finally {
              setActing(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = async (row: SyncCacheRow) => {
    setActing(row.id);
    try {
      await supabase
        .from('mosque_sync_cache')
        .update({ review_status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', row.id);
      setPendingRows(prev => prev.filter(r => r.id !== row.id));
    } catch (e: any) {
      console.error('[admin/mosque-sync] reject error:', e);
      Alert.alert('Error', formatError(e) || 'Failed to reject');
    } finally {
      setActing(null);
    }
  };

  const runBatchSync = async (scope: 'times' | 'events') => {
    setBatchSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const res = await fetch(`${supabaseUrl}/functions/v1/mosque-website-batch-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ scope }),
      });
      const result = await res.json();
      const cleaned = result.cleanedUpEvents > 0 ? `\nPast events removed: ${result.cleanedUpEvents}` : '';
      Alert.alert(
        'Batch Sync Complete',
        `Total: ${result.total}\nCached: ${result.cached}\nParsed: ${result.parsed}\nLLM fallback: ${result.llmFallback}\nFailed: ${result.failed}${cleaned}`,
      );
      setReviewLoading(true);
      setCostLoading(true);
      loadReview();
      loadCost();
    } catch (e: any) {
      console.error('[admin/mosque-sync] batch sync error:', e);
      Alert.alert('Error', formatError(e) || 'Batch sync failed');
    } finally {
      setBatchSyncing(false);
    }
  };

  const handleBatchSync = () => {
    Alert.alert(
      'Run Batch Sync',
      'Choose what to sync across all mosques with a website. Cached pages return at $0 cost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Times & Jummah',
          onPress: () => runBatchSync('times'),
        },
        {
          text: 'Events',
          onPress: () => runBatchSync('events'),
        },
      ],
    );
  };

  // ── Render review card ─────────────────────────────────────────────────────
  const renderReviewCard = ({ item: row }: { item: SyncCacheRow }) => {
    const isExpanded = expanded.has(row.id);
    const isActing = acting === row.id;
    const data = row.extracted_data_json;
    const iqama = data?.iqama_times;
    const events: any[] = data?.events ?? [];

    return (
      <View style={s.card}>
        {/* Header */}
        <TouchableOpacity onPress={() => toggleExpand(row.id)} activeOpacity={0.8}>
          <View style={s.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle} numberOfLines={1}>
                {row.mosques?.name ?? row.mosque_id}
              </Text>
              <View style={s.badgeRow}>
                <MethodBadge method={row.extraction_method} />
                <ConfidenceBadge conf={row.confidence} />
              </View>
              <Text style={s.cardMeta}>
                Last changed: {row.last_changed_at ? formatDate(row.last_changed_at) : '—'}
              </Text>
            </View>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={TEXT_MUTED}
            />
          </View>
        </TouchableOpacity>

        {/* Warnings */}
        {row.warnings?.length ? (
          <View style={s.warningsBox}>
            {row.warnings.map((w, i) => (
              <Text key={i} style={s.warningText}>⚠ {w}</Text>
            ))}
          </View>
        ) : null}

        {/* Expanded detail */}
        {isExpanded && (
          <View style={s.expandedSection}>
            {/* Iqama times */}
            {iqama && (
              <>
                <Text style={s.sectionLabel}>Iqama Times</Text>
                <IqamaRow label="Fajr"    value={iqama.fajr}    />
                <IqamaRow label="Dhuhr"   value={iqama.dhuhr}   />
                <IqamaRow label="Asr"     value={iqama.asr}     />
                <IqamaRow label="Maghrib" value={iqama.maghrib} />
                <IqamaRow label="Isha"    value={iqama.isha}    />
              </>
            )}

            {/* Jummah sessions */}
            {data?.jummah_sessions?.length ? (
              <>
                <Text style={[s.sectionLabel, { marginTop: 10 }]}>Jummah Sessions</Text>
                {data.jummah_sessions.map((j: any, i: number) => (
                  <Text key={i} style={s.jummahRow}>
                    {j.time}{j.khateeb ? ` — ${j.khateeb}` : ''}{j.hall ? ` (${j.hall})` : ''}
                  </Text>
                ))}
              </>
            ) : null}

            {/* Events */}
            {events.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 10 }]}>
                  Events ({events.length})
                </Text>
                {events.slice(0, 5).map((ev: any, i: number) => (
                  <View key={i} style={s.eventRow}>
                    <Text style={s.eventTitle} numberOfLines={1}>{ev.title}</Text>
                    {ev.event_start && (
                      <Text style={s.eventMeta}>{formatDate(ev.event_start)}</Text>
                    )}
                  </View>
                ))}
                {events.length > 5 && (
                  <Text style={s.eventMore}>+{events.length - 5} more events</Text>
                )}
              </>
            )}

            {/* LLM cost info */}
            {row.extraction_method === 'llm_fallback' && row.estimated_llm_cost != null && (
              <Text style={s.costHint}>
                LLM cost: {formatCost(row.estimated_llm_cost)}
                {row.model_used ? ` (${row.model_used})` : ''}
                {row.input_tokens ? ` · ${row.input_tokens}in/${row.output_tokens}out tokens` : ''}
              </Text>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.actionBtn, s.rejectBtn, isActing && s.btnDisabled]}
            onPress={() => handleReject(row)}
            disabled={isActing}
          >
            {isActing
              ? <ActivityIndicator size="small" color={RED} />
              : <Text style={s.rejectBtnText}>Reject</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, s.approveBtn, isActing && s.btnDisabled]}
            onPress={() => handleApprove(row)}
            disabled={isActing}
          >
            {isActing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.approveBtnText}>Approve & Publish</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Render cost row ────────────────────────────────────────────────────────
  const renderCostRow = ({ item }: { item: CostRow }) => (
    <View style={s.costCard}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{item.mosque_name}</Text>
        <Text style={s.cardMeta}>
          {item.llm_calls} LLM call{item.llm_calls !== 1 ? 's' : ''} · Last: {formatDate(item.last_checked_at)}
        </Text>
      </View>
      <Text style={s.costValue}>{formatCost(item.total_cost)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.flex}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Mosque Sync</Text>
        <TouchableOpacity
          style={[s.batchBtn, batchSyncing && s.btnDisabled]}
          onPress={handleBatchSync}
          disabled={batchSyncing}
        >
          {batchSyncing
            ? <ActivityIndicator size="small" color={GREEN} />
            : <Ionicons name="sync-outline" size={20} color={GREEN} />
          }
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabItem, tab === 'review' && s.tabItemActive]}
          onPress={() => setTab('review')}
        >
          <Text style={[s.tabItemText, tab === 'review' && s.tabItemTextActive]}>
            Pending Review
          </Text>
          {pendingRows.length > 0 && (
            <View style={s.tabBadge}>
              <Text style={s.tabBadgeText}>{pendingRows.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabItem, tab === 'cost' && s.tabItemActive]}
          onPress={() => setTab('cost')}
        >
          <Text style={[s.tabItemText, tab === 'cost' && s.tabItemTextActive]}>
            Cost Dashboard
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Review tab ── */}
      {tab === 'review' && (
        reviewLoading
          ? <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
          : <FlatList
              data={pendingRows}
              keyExtractor={item => item.id}
              renderItem={renderReviewCard}
              contentContainerStyle={s.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={reviewRefreshing}
                  onRefresh={() => { setReviewRefreshing(true); loadReview(); }}
                  tintColor={GREEN}
                />
              }
              ListEmptyComponent={
                <View style={s.emptyBox}>
                  <Ionicons name="checkmark-circle-outline" size={48} color="#d0d0d0" />
                  <Text style={s.emptyText}>No pending sync reviews</Text>
                  <Text style={s.emptySubtext}>All extracted data has been reviewed.</Text>
                </View>
              }
            />
      )}

      {/* ── Cost tab ── */}
      {tab === 'cost' && (
        costLoading
          ? <View style={s.centered}><ActivityIndicator size="large" color={GREEN} /></View>
          : <FlatList
              data={costRows}
              keyExtractor={item => item.mosque_id}
              renderItem={renderCostRow}
              contentContainerStyle={s.listContent}
              ListHeaderComponent={
                summary && (
                  <View>
                    {/* Summary stats */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={s.statsRow}
                    >
                      <StatCard icon="cash-outline"           color="#2e7d32" label="LLM Cost (mo)"  value={`$${summary.totalCost.toFixed(4)}`} />
                      <StatCard icon="flash-outline"          color={AMBER}   label="LLM Calls"     value={summary.totalLlmCalls} />
                      <StatCard icon="checkmark-circle-outline" color="#1565c0" label="Cached"       value={summary.cachedCount} />
                      <StatCard icon="code-slash-outline"     color={GREEN}   label="Deterministic" value={summary.deterministicCount} />
                    </ScrollView>

                    {/* Method breakdown */}
                    <View style={s.summaryBox}>
                      <Text style={s.summaryTitle}>This month's breakdown</Text>
                      <BreakdownRow label="Cached (no cost)"    value={summary.cachedCount}         color="#1565c0" />
                      <BreakdownRow label="Deterministic parse" value={summary.deterministicCount}  color={GREEN} />
                      <BreakdownRow label="LLM fallback"        value={summary.llmFallbackCount}    color={AMBER} />
                      <BreakdownRow label="Low-confidence"      value={summary.lowConfidenceCount}  color={RED} />
                    </View>

                    {/* Cost formula */}
                    <View style={s.formulaBox}>
                      <Text style={s.formulaTitle}>Monthly Cost Formula</Text>
                      <Text style={s.formulaText}>
                        {'mosques × syncs/day × 30 × change_rate × llm_rate × cost/call'}
                      </Text>
                      <Text style={s.formulaHint}>
                        Set LLM_INPUT_COST_PER_1M_TOKENS and LLM_OUTPUT_COST_PER_1M_TOKENS
                        in Edge Function secrets to adjust pricing.
                      </Text>
                    </View>

                    {costRows.length > 0 && (
                      <Text style={s.sectionLabel}>By Mosque (highest cost first)</Text>
                    )}
                  </View>
                )
              }
              ListEmptyComponent={
                <View style={s.emptyBox}>
                  <Ionicons name="analytics-outline" size={48} color="#d0d0d0" />
                  <Text style={s.emptyText}>No sync data this month</Text>
                  <Text style={s.emptySubtext}>Tap the sync button above to run a batch sync.</Text>
                </View>
              }
            />
      )}
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({ icon, color, label, value }: { icon: any; color: string; label: string; value: string | number }) {
  return (
    <View style={s.statCard}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[s.statValue, { color }]}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function BreakdownRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.breakdownRow}>
      <View style={[s.breakdownDot, { backgroundColor: color }]} />
      <Text style={s.breakdownLabel}>{label}</Text>
      <Text style={[s.breakdownValue, { color }]}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex:           { flex: 1, backgroundColor: CREAM },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent:    { padding: 16, paddingBottom: 40 },

  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: HAIRLINE },
  backBtn:        { padding: 4, marginRight: 8 },
  headerTitle:    { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK },
  batchBtn:       { padding: 8 },

  tabBar:         { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: HAIRLINE },
  tabItem:        { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, gap: 6 },
  tabItemActive:  { borderBottomWidth: 2, borderBottomColor: DEEP_GREEN },
  tabItemText:    { fontSize: 13, color: TEXT_MUTED, fontWeight: '500' },
  tabItemTextActive: { color: DEEP_GREEN, fontWeight: '700' },
  tabBadge:       { backgroundColor: RED, borderRadius: 8, minWidth: 16, paddingHorizontal: 4, alignItems: 'center' },
  tabBadgeText:   { color: '#fff', fontSize: 10, fontWeight: '700' },

  card:           { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: HAIRLINE },
  cardHeader:     { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  cardTitle:      { fontSize: 15, fontWeight: '700', color: TEXT_DARK, marginBottom: 4 },
  cardMeta:       { fontSize: 12, color: TEXT_MUTED, marginTop: 4 },

  badgeRow:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  badge:          { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:      { fontSize: 11, fontWeight: '600' },

  warningsBox:    { backgroundColor: '#fff8e1', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderColor: '#ffe082' },
  warningText:    { fontSize: 12, color: '#f57f17', marginBottom: 2 },

  expandedSection: { paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1, borderColor: HAIRLINE },
  sectionLabel:   { fontSize: 11, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },

  iqamaRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  iqamaLabel:     { fontSize: 13, color: TEXT_MUTED, width: 70 },
  iqamaValue:     { fontSize: 13, fontWeight: '600', color: TEXT_DARK },
  iqamaNull:      { color: '#ccc', fontStyle: 'italic' },

  jummahRow:      { fontSize: 13, color: TEXT_DARK, paddingVertical: 2 },

  eventRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  eventTitle:     { fontSize: 13, color: TEXT_DARK, flex: 1, marginRight: 8 },
  eventMeta:      { fontSize: 11, color: TEXT_MUTED },
  eventMore:      { fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic', marginTop: 4 },

  costHint:       { fontSize: 11, color: TEXT_MUTED, marginTop: 10, fontStyle: 'italic' },

  actionRow:      { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: HAIRLINE },
  actionBtn:      { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  approveBtn:     { backgroundColor: DEEP_GREEN },
  rejectBtn:      { borderWidth: 1, borderColor: RED, backgroundColor: '#fff' },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rejectBtnText:  { color: RED, fontWeight: '600', fontSize: 14 },
  btnDisabled:    { opacity: 0.5 },

  costCard:       { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: HAIRLINE },
  costValue:      { fontSize: 16, fontWeight: '700', color: DEEP_GREEN },

  statsRow:       { paddingHorizontal: 0, paddingVertical: 12, gap: 10 },
  statCard:       { backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center', minWidth: 90, borderWidth: 1, borderColor: HAIRLINE },
  statValue:      { fontSize: 18, fontWeight: '800', marginTop: 4 },
  statLabel:      { fontSize: 11, color: TEXT_MUTED, marginTop: 2, textAlign: 'center' },

  summaryBox:     { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: HAIRLINE },
  summaryTitle:   { fontSize: 13, fontWeight: '700', color: TEXT_DARK, marginBottom: 10 },
  breakdownRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  breakdownDot:   { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  breakdownLabel: { flex: 1, fontSize: 13, color: TEXT_DARK },
  breakdownValue: { fontSize: 14, fontWeight: '700' },

  formulaBox:     { backgroundColor: '#f8fffe', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#c8e6c9' },
  formulaTitle:   { fontSize: 12, fontWeight: '700', color: DEEP_GREEN, marginBottom: 6 },
  formulaText:    { fontSize: 12, color: TEXT_DARK, fontFamily: 'monospace', marginBottom: 6 },
  formulaHint:    { fontSize: 11, color: TEXT_MUTED },

  emptyBox:       { alignItems: 'center', paddingTop: 60 },
  emptyText:      { fontSize: 16, fontWeight: '600', color: TEXT_MUTED, marginTop: 12 },
  emptySubtext:   { fontSize: 13, color: TEXT_MUTED, marginTop: 4, textAlign: 'center' },
});
