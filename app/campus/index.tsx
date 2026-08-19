import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { searchUniversities } from '../../lib/campus';
import type { University } from '../../lib/campus';
import { Brand, Radius, Spacing, Type } from '../../lib/theme';
import CampusCard from '../../components/CampusCard';
import { useMsa } from '../../contexts/MsaContext';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const CREAM      = Brand.cream;

export default function CampusHubScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { activeMembership } = useMsa();

  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<University[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    const data = await searchUniversities(q, 40);
    setResults(data);
    setLoading(false);
  }, []);

  // Load all verified universities on mount
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        {navigation.canGoBack() && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={DEEP_GREEN} />
          </TouchableOpacity>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title}>Campus Hub</Text>
          <Text style={styles.subtitle}>Find your campus MSA</Text>
        </View>
        <TouchableOpacity
          style={styles.followingBtn}
          onPress={() => router.push('/followed-campuses')}
          hitSlop={8}
        >
          <Ionicons name="bookmark-outline" size={20} color={DEEP_GREEN} />
        </TouchableOpacity>
      </View>

      {/* MSA Portal shortcut — shown only to active MSA members */}
      {!!activeMembership && (
        <TouchableOpacity
          style={styles.portalBanner}
          onPress={() => router.push('/(msa)/dashboard' as any)}
          activeOpacity={0.85}
        >
          <View style={styles.portalBannerIcon}>
            <Ionicons name="grid-outline" size={18} color="#fff" />
          </View>
          <View style={styles.portalBannerText}>
            <Text style={styles.portalBannerTitle}>{activeMembership.msaName}</Text>
            <Text style={styles.portalBannerSub}>Open your MSA Portal</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={TEXT_MUTED} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search universities…"
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

      {/* Results */}
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
          <Ionicons name="school-outline" size={42} color={Brand.hairline} />
          <Text style={styles.emptyTitle}>No campuses found</Text>
          <Text style={styles.emptyBody}>
            {query
              ? `No universities match "${query}". Try a different search.`
              : 'No campuses are available yet.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <CampusCard
              university={item}
              onPress={() => onPressUniversity(item.slug)}
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.resultsLabel}>
              {query ? `${results.length} result${results.length !== 1 ? 's' : ''}` : `${results.length} campuses`}
            </Text>
          }
          ListFooterComponent={
            <View style={styles.footerBanners}>
              {!activeMembership && (
                <TouchableOpacity
                  style={styles.msaBanner}
                  onPress={() => router.push('/msa/request-access')}
                  activeOpacity={0.8}
                >
                  <View style={styles.msaBannerIcon}>
                    <Ionicons name="ribbon-outline" size={20} color={DEEP_GREEN} />
                  </View>
                  <View style={styles.msaBannerText}>
                    <Text style={styles.msaBannerTitle}>Are you an MSA admin?</Text>
                    <Text style={styles.msaBannerSub}>Claim your campus page to manage events, prayer times, and more.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={DEEP_GREEN} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.codeBanner}
                onPress={() => router.push('/msa/redeem-code')}
                activeOpacity={0.8}
              >
                <Ionicons name="key-outline" size={16} color={TEXT_MUTED} />
                <Text style={styles.codeBannerText}>Have a claim code? Enter it here</Text>
                <Ionicons name="chevron-forward" size={14} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: CREAM,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Brand.hairline,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.circle,
    backgroundColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  followingBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.circle,
    backgroundColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Type.screenTitle,
    color: DEEP_GREEN,
  },
  subtitle: {
    ...Type.caption,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  searchWrap: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Brand.hairline,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CREAM,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: Brand.hairline,
    paddingHorizontal: Spacing.md,
    height: 46,
    gap: Spacing.sm,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    ...Type.body,
    color: TEXT_DARK,
    padding: 0,
  },
  list: {
    paddingTop: Spacing.sm,
  },
  resultsLabel: {
    ...Type.caption,
    color: TEXT_MUTED,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
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
  retryText: {
    ...Type.label,
    color: '#fff',
  },
  portalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: DEEP_GREEN,
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    borderRadius: Radius.card, padding: Spacing.md,
  },
  portalBannerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  portalBannerText: { flex: 1 },
  portalBannerTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  portalBannerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

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
    marginTop: Spacing.md,
  },
  msaBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.chip,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  msaBannerText: { flex: 1 },
  msaBannerTitle: { ...Type.body, color: DEEP_GREEN, fontWeight: '700' },
  msaBannerSub:   { ...Type.caption, color: TEXT_MUTED, marginTop: 2, lineHeight: 16 },

  footerBanners: { gap: Spacing.sm, paddingBottom: 40 },
  codeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.chip,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: Brand.hairline,
  },
  codeBannerText: { ...Type.caption, color: TEXT_MUTED, flex: 1 },
});
