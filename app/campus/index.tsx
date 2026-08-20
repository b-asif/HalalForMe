import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { searchUniversities } from '../../lib/campus';
import type { University } from '../../lib/campus';
import { Brand, Radius, Shadow, Spacing, Type } from '../../lib/theme';
import CampusCard from '../../components/CampusCard';
import { useMsa } from '../../contexts/MsaContext';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const CREAM      = Brand.cream;
const HAIRLINE   = Brand.hairline;

export default function CampusHubScreen() {
  const router     = useRouter();
  const navigation = useNavigation();
  const insets     = useSafeAreaInsets();
  const { activeMembership } = useMsa();

  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    const data = await searchUniversities(q, 40);
    setResults(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(''); }, [load]);

  const onChangeText = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(text), 250);
  }, [load]);

  const onClear = useCallback(() => {
    setQuery('');
    load('');
  }, [load]);

  const onPressUniversity = useCallback((slug: string) => {
    router.push(`/campus/${slug}`);
  }, [router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Hero banner ── */}
      <View style={styles.hero}>
        <Image
          source={require('../../assets/school.png')}
          style={styles.heroImage}
          resizeMode="contain"
        />
        <View style={[StyleSheet.absoluteFill, styles.heroOverlay]} />
        <View style={styles.heroTop}>
          {navigation.canGoBack() ? (
            <TouchableOpacity style={styles.heroCircleBtn} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={20} color={DEEP_GREEN} />
            </TouchableOpacity>
          ) : (
            <View style={styles.heroCircleBtn} />
          )}
          <View style={styles.heroTitleBlock}>
            <Text style={styles.heroTitle}>Campus Hub</Text>
            <Text style={styles.heroSubtitle}>Find your campus MSA</Text>
          </View>
          <TouchableOpacity
            style={styles.heroCircleBtn}
            onPress={() => router.push('/followed-campuses')}
            hitSlop={8}
          >
            <Ionicons name="bookmark-outline" size={20} color={DEEP_GREEN} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search bar (overlaps hero bottom via negative marginTop) ── */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={TEXT_MUTED} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search universities, colleges…"
            placeholderTextColor={TEXT_MUTED}
            value={query}
            onChangeText={onChangeText}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={onClear} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={TEXT_MUTED} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── MSA Portal shortcut ── */}
      {!!activeMembership && (
        <TouchableOpacity
          style={styles.portalBanner}
          onPress={() => router.push('/(msa)/dashboard' as any)}
          activeOpacity={0.85}
        >
          <View style={styles.portalIcon}>
            <Ionicons name="grid-outline" size={17} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.portalTitle}>{activeMembership.msaName}</Text>
            <Text style={styles.portalSub}>Open your MSA Portal</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}

      {/* ── List ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={GREEN} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={36} color={TEXT_MUTED} />
          <Text style={styles.emptyTitle}>Something went wrong</Text>
          <Text style={styles.emptyBody}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load(query)}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="school-outline" size={42} color={HAIRLINE} />
          <Text style={styles.emptyTitle}>No campuses found</Text>
          <Text style={styles.emptyBody}>
            {query
              ? `No universities match "${query}".`
              : 'No campuses are available yet.'}
          </Text>
          {!!query && !activeMembership && (
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md, alignSelf: 'stretch' }}>
              <TouchableOpacity
                style={[styles.msaBanner, { marginHorizontal: 0 }]}
                onPress={() => router.push('/msa/request-access')}
                activeOpacity={0.8}
              >
                <View style={styles.msaBannerIcon}>
                  <Ionicons name="ribbon-outline" size={19} color={DEEP_GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.msaBannerTitle}>Are you an MSA admin?</Text>
                  <Text style={styles.msaBannerSub}>
                    Claim your campus page to manage events, prayer times, and more.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={DEEP_GREEN} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.codeBanner}
                onPress={() => router.push('/msa/redeem-code')}
                activeOpacity={0.8}
              >
                <Ionicons name="key-outline" size={15} color={TEXT_MUTED} />
                <Text style={styles.codeBannerText}>Have a claim code? Enter it here</Text>
                <Ionicons name="chevron-forward" size={13} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <CampusCard university={item} onPress={() => onPressUniversity(item.slug)} />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.resultsLabel}>
              {query
                ? `${results.length} result${results.length !== 1 ? 's' : ''}`
                : `${results.length} campuses`}
            </Text>
          }
          ListFooterComponent={
            <View style={styles.footer}>
              {!activeMembership && (
                <TouchableOpacity
                  style={styles.msaBanner}
                  onPress={() => router.push('/msa/request-access')}
                  activeOpacity={0.8}
                >
                  <View style={styles.msaBannerIcon}>
                    <Ionicons name="ribbon-outline" size={19} color={DEEP_GREEN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.msaBannerTitle}>Are you an MSA admin?</Text>
                    <Text style={styles.msaBannerSub}>
                      Claim your campus page to manage events, prayer times, and more.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={DEEP_GREEN} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.codeBanner}
                onPress={() => router.push('/msa/redeem-code')}
                activeOpacity={0.8}
              >
                <Ionicons name="key-outline" size={15} color={TEXT_MUTED} />
                <Text style={styles.codeBannerText}>Have a claim code? Enter it here</Text>
                <Ionicons name="chevron-forward" size={13} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CREAM,
  },

  // ── Hero ──
  hero: {
    height: 260,
    overflow: 'hidden',
    backgroundColor: CREAM,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.4 }, { translateX: -40 }],
  },
  heroOverlay: {
    backgroundColor: 'rgba(247,242,231,0.12)',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  heroCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.circle,
    backgroundColor: 'rgba(255,255,255,0.90)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.light,
  },
  heroTitleBlock: {
    flex: 1,
    paddingTop: 4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: DEEP_GREEN,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    ...Type.caption,
    color: DEEP_GREEN,
    opacity: 0.65,
    marginTop: 3,
  },

  // ── Search ──
  searchWrap: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    marginTop: -54,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingHorizontal: Spacing.md,
    height: 50,
    gap: Spacing.sm,
    ...Shadow.medium,
  },
  searchInput: {
    flex: 1,
    ...Type.body,
    color: TEXT_DARK,
    padding: 0,
  },

  // ── MSA portal banner ──
  portalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: DEEP_GREEN,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.card,
    padding: Spacing.md,
  },
  portalIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  portalSub:   { fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 1 },

  // ── List ──
  list: {
    paddingTop: Spacing.xs,
  },
  resultsLabel: {
    ...Type.caption,
    color: TEXT_MUTED,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },

  // ── Empty / error ──
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    ...Type.cardTitle,
    color: TEXT_DARK,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  emptyBody: {
    ...Type.bodySmall,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: GREEN,
    borderRadius: Radius.chip,
  },
  retryText: { ...Type.label, color: '#fff' },

  // ── Footer banners ──
  footer: {
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    paddingBottom: 40,
  },
  msaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#f0faf6',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: '#c3e8d8',
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
  },
  msaBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.chip,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  msaBannerTitle: { ...Type.body, color: DEEP_GREEN, fontWeight: '700' },
  msaBannerSub:   { ...Type.caption, color: TEXT_MUTED, marginTop: 2, lineHeight: 16 },

  codeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.chip,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: HAIRLINE,
  },
  codeBannerText: { ...Type.caption, color: TEXT_MUTED, flex: 1 },
});
