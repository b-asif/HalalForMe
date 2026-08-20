/**
 * /msa/request-access
 *
 * 2-step flow for MSA admins to claim or propose their campus MSA.
 *
 * Step 1 — Search university, then select or propose an MSA (inline, same screen)
 * Step 2 — Optional message + submit
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { InstagramIcon } from '../../components/InstagramIcon';

import { supabase } from '../../lib/supabase';
import { searchUniversities } from '../../lib/campus';
import type { University, Msa } from '../../lib/campus';
import { useLocalSearchParams } from 'expo-router';
import { Brand, Radius, Spacing, Type } from '../../lib/theme';

const GREEN      = Brand.green;
const DEEP_GREEN = Brand.deepGreen;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const CREAM      = Brand.cream;
const RED        = Brand.red;

type Step = 1 | 2;

export default function RequestAccessScreen() {
  const router = useRouter();
  const {
    prefillUniversityId,
    prefillUniversityName,
    prefillMsaId,
    prefillMsaName,
  } = useLocalSearchParams<{
    prefillUniversityId?: string;
    prefillUniversityName?: string;
    prefillMsaId?: string;
    prefillMsaName?: string;
  }>();

  // If arriving from a campus page, start pre-filled on step 1 with university selected
  const hasPrefill = !!prefillUniversityId;

  const [step, setStep]               = useState<Step>(1);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted]     = useState(false);

  // University search
  const [query, setQuery]               = useState('');
  const [universities, setUniversities] = useState<University[]>([]);
  const [uniLoading, setUniLoading]     = useState(false);
  const [selectedUni, setSelectedUni]   = useState<University | null>(
    hasPrefill ? { id: prefillUniversityId!, name: prefillUniversityName!, slug: '', city: null, state: null, country: 'US', lat: null, lng: null, website: null, logo_url: null, is_verified: true } : null
  );
  const debounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // MSA selection (loads after university is picked)
  const [msas, setMsas]                 = useState<Msa[]>([]);
  const [msaLoading, setMsaLoading]     = useState(false);
  const [selectedMsa, setSelectedMsa]   = useState<Msa | null>(
    hasPrefill && prefillMsaId ? { id: prefillMsaId, university_id: prefillUniversityId!, name: prefillMsaName ?? '', description: null, logo_url: null, email: null, website: null, instagram_handle: null, is_verified: false } : null
  );
  const [proposingNew, setProposingNew]         = useState(false);
  const [proposedName, setProposedName]         = useState('');
  const [proposingNewUni, setProposingNewUni]   = useState(false);
  const [proposedUniName, setProposedUniName]   = useState('');

  // Step 2
  const [message, setMessage]               = useState('');
  const [contactEmail, setContactEmail]     = useState('');
  const [contactInstagram, setContactInstagram] = useState('');

  // ── University search ────────────────────────────────────────────────────────

  const loadUniversities = useCallback(async (q: string) => {
    setUniLoading(true);
    const data = await searchUniversities(q, 30);
    setUniversities(data);
    setUniLoading(false);
  }, []);

  useEffect(() => {
    // Pre-fill email from auth
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setContactEmail(data.user.email);
    });

    if (hasPrefill) {
      // Pre-filled: load MSAs for the pre-selected university
      setMsaLoading(true);
      supabase
        .from('msas')
        .select('id, university_id, name, description, logo_url, email, website, instagram_handle, is_verified')
        .eq('university_id', prefillUniversityId!)
        .order('name')
        .then(({ data }) => {
          const fetched = (data as Msa[]) ?? [];
          setMsas(fetched);
          if (prefillMsaId) {
            // Replace the constructed stub with the real DB record
            const match = fetched.find(m => m.id === prefillMsaId);
            if (match) setSelectedMsa(match);
          } else if (fetched.length === 1) {
            // Only one MSA for this university — select it automatically
            setSelectedMsa(fetched[0]);
          } else if (fetched.length === 0) {
            // No MSAs exist yet — drop straight into "propose new" so the user
            // can type a name and hit Continue without a redundant extra tap
            setProposingNew(true);
            if (prefillMsaName) setProposedName(prefillMsaName);
          }
          setMsaLoading(false);
        });
    } else {
      loadUniversities('');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onChangeQuery = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadUniversities(text), 250);
  }, [loadUniversities]);

  const selectUniversity = useCallback(async (uni: University) => {
    setSelectedUni(uni);
    setQuery('');
    setSelectedMsa(null);
    setProposingNew(false);
    setProposedName('');
    setMsaLoading(true);

    const { data } = await supabase
      .from('msas')
      .select('id, university_id, name, description, logo_url, email, website, instagram_handle, is_verified')
      .eq('university_id', uni.id)
      .order('name');

    setMsas((data as Msa[]) ?? []);
    setMsaLoading(false);
  }, []);

  const clearUniversity = useCallback(() => {
    setSelectedUni(null);
    setProposingNewUni(false);
    setProposedUniName('');
    setMsas([]);
    setSelectedMsa(null);
    setProposingNew(false);
    setProposedName('');
    loadUniversities('');
  }, [loadUniversities]);

  const startProposingNewUni = useCallback(() => {
    setSelectedUni(null);
    setProposingNewUni(true);
    setMsas([]);
    setSelectedMsa(null);
    setProposingNew(true); // new university always means new MSA
    setProposedName('');
  }, []);

  // ── MSA selection ────────────────────────────────────────────────────────────

  const selectMsa = useCallback((msa: Msa) => {
    setSelectedMsa(msa);
    setProposingNew(false);
    setProposedName('');
  }, []);

  const startProposingNew = useCallback(() => {
    setSelectedMsa(null);
    setProposingNew(true);
  }, []);

  const uniReady = selectedUni !== null || (proposingNewUni && proposedUniName.trim().length > 0);
  const msaReady = selectedMsa !== null || proposingNew;
  const canAdvanceStep1 = uniReady && msaReady;

  // ── Submit ───────────────────────────────────────────────────────────────────

  const canSubmit = contactEmail.trim().length > 0;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitError('You must be signed in.');
      setSubmitting(false);
      return;
    }

    // Build insert row — only include optional columns when they have values
    // so schema-cache errors don't surface if a migration is pending.
    const row: Record<string, any> = {
      user_id:       user.id,
      university_id: selectedUni?.id ?? null,
      msa_id:        selectedMsa?.id ?? null,
    };
    if (proposingNewUni && proposedUniName.trim())
      row.proposed_university_name = proposedUniName.trim();
    if (proposingNew && proposedName.trim())
      row.proposed_msa_name = proposedName.trim();
    if (message.trim())
      row.message = message.trim();
    if (contactEmail.trim())
      row.contact_email = contactEmail.trim();
    if (contactInstagram.trim())
      row.contact_instagram = contactInstagram.trim().replace(/^@/, '');

    const { error } = await supabase.from('msa_onboarding_requests').insert(row);

    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
    } else {
      setSubmitted(true);
    }
  }, [selectedUni, proposingNewUni, proposedUniName, selectedMsa, proposingNew, proposedName, message, contactEmail, contactInstagram, canSubmit]);

  // ── Success ──────────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={DEEP_GREEN} />
          </TouchableOpacity>
        </View>
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color={GREEN} />
          </View>
          <Text style={s.successTitle}>Request submitted!</Text>
          <Text style={s.successBody}>
            The Rihdal team will review your request and send you a claim code. This usually takes 1–3 business days.
          </Text>
          <TouchableOpacity style={s.doneBtn} onPress={() => router.back()}>
            <Text style={s.primaryBtnText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.codeLink}
            onPress={() => router.replace('/msa/redeem-code' as any)}
          >
            <Ionicons name="key-outline" size={14} color={GREEN} />
            <Text style={s.codeLinkText}>Already have a code? Enter it here</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => (step === 1 ? router.back() : setStep(1))}
            style={s.backBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={22} color={DEEP_GREEN} />
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={s.title}>Claim Your MSA</Text>
            <Text style={s.subtitle}>Step {step} of 2</Text>
          </View>
        </View>

        {/* ── Step dots ── */}
        <View style={s.stepRow}>
          {([1, 2] as Step[]).map(n => (
            <View key={n} style={[s.stepDot, step >= n && s.stepDotActive]} />
          ))}
        </View>

        {/* ═══════════════════════════════════════════════════════════════════
            STEP 1 — University + MSA (combined)
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <>
            {/* University search / selected chip */}
            <View style={s.searchWrap}>
              <Text style={s.sectionTitle}>Find your university</Text>
              {selectedUni ? (
                <TouchableOpacity style={s.selectedChip} onPress={clearUniversity} activeOpacity={0.7}>
                  <Ionicons name="school" size={16} color={GREEN} />
                  <Text style={s.selectedChipText} numberOfLines={1}>{selectedUni.name}</Text>
                  <Ionicons name="close-circle" size={16} color={TEXT_MUTED} />
                </TouchableOpacity>
              ) : (
                <View style={s.searchBar}>
                  <Ionicons name="search" size={18} color={TEXT_MUTED} />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search universities…"
                    placeholderTextColor={TEXT_MUTED}
                    value={query}
                    onChangeText={onChangeQuery}
                    autoCorrect={false}
                    autoCapitalize="words"
                    returnKeyType="search"
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={() => { setQuery(''); loadUniversities(''); }} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={TEXT_MUTED} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* University list (hidden once one is selected or proposing new) */}
            {!selectedUni && !proposingNewUni && (
              uniLoading ? (
                <View style={s.centered}>
                  <ActivityIndicator color={GREEN} />
                </View>
              ) : (
                <FlatList
                  data={universities}
                  keyExtractor={u => u.id}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={s.listContent}
                  ListEmptyComponent={
                    <View style={s.centered}>
                      <Ionicons name="school-outline" size={40} color={HAIRLINE} />
                      <Text style={s.emptyText}>No universities found</Text>
                    </View>
                  }
                  ListFooterComponent={
                    <TouchableOpacity
                      style={[s.rowCard, { borderStyle: 'dashed' }]}
                      onPress={startProposingNewUni}
                      activeOpacity={0.7}
                    >
                      <View style={[s.rowIcon, { backgroundColor: '#f0faf6' }]}>
                        <Ionicons name="add-circle-outline" size={20} color={DEEP_GREEN} />
                      </View>
                      <View style={s.rowBody}>
                        <Text style={s.rowTitle}>My university isn't listed</Text>
                        <Text style={s.rowSub}>Submit a request to add your campus</Text>
                      </View>
                    </TouchableOpacity>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity style={s.rowCard} onPress={() => selectUniversity(item)} activeOpacity={0.7}>
                      <View style={s.rowIcon}>
                        <Ionicons name="school-outline" size={20} color={GREEN} />
                      </View>
                      <View style={s.rowBody}>
                        <Text style={s.rowTitle}>{item.name}</Text>
                        {(item.city || item.state) ? (
                          <Text style={s.rowSub}>{[item.city, item.state].filter(Boolean).join(', ')}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={HAIRLINE} />
                    </TouchableOpacity>
                  )}
                />
              )
            )}

            {/* Proposing a new university — inline form */}
            {!selectedUni && proposingNewUni && (
              <ScrollView contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={s.selectedChip} onPress={clearUniversity} activeOpacity={0.7}>
                  <Ionicons name="add-circle-outline" size={16} color={GREEN} />
                  <Text style={s.selectedChipText}>My university isn't listed</Text>
                  <Ionicons name="close-circle" size={16} color={TEXT_MUTED} />
                </TouchableOpacity>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>University Name</Text>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. Michigan State University"
                    placeholderTextColor={TEXT_MUTED}
                    value={proposedUniName}
                    onChangeText={setProposedUniName}
                    autoCapitalize="words"
                    autoFocus
                    returnKeyType="next"
                  />
                </View>

                <Text style={[s.sectionTitle, { marginTop: 4 }]}>MSA Name</Text>
                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>What is your MSA called?</Text>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. MSA at Michigan State"
                    placeholderTextColor={TEXT_MUTED}
                    value={proposedName}
                    onChangeText={setProposedName}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>

                <TouchableOpacity
                  style={[s.primaryBtn, !canAdvanceStep1 && s.primaryBtnDisabled]}
                  onPress={() => setStep(2)}
                  disabled={!canAdvanceStep1}
                >
                  <Text style={s.primaryBtnText}>Continue</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* MSA selection — appears inline once a university is chosen */}
            {selectedUni && (
              <ScrollView contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
                <Text style={s.sectionTitle}>Select your MSA</Text>

                {msaLoading ? (
                  <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} />
                ) : (
                  <>
                    {msas.map(msa => (
                      <TouchableOpacity
                        key={msa.id}
                        style={[s.rowCard, selectedMsa?.id === msa.id && s.rowCardSelected]}
                        onPress={() => selectMsa(msa)}
                        activeOpacity={0.7}
                      >
                        <View style={s.rowIcon}>
                          <Ionicons name="people-outline" size={20} color={GREEN} />
                        </View>
                        <View style={s.rowBody}>
                          <Text style={s.rowTitle}>{msa.name}</Text>
                          {msa.is_verified ? (
                            <Text style={s.verifiedBadge}>Verified</Text>
                          ) : null}
                        </View>
                        {selectedMsa?.id === msa.id && (
                          <Ionicons name="checkmark-circle" size={20} color={GREEN} />
                        )}
                      </TouchableOpacity>
                    ))}

                    {/* Always-visible "propose new" option */}
                    <TouchableOpacity
                      style={[s.rowCard, proposingNew && s.rowCardSelected]}
                      onPress={startProposingNew}
                      activeOpacity={0.7}
                    >
                      <View style={[s.rowIcon, { backgroundColor: '#f0faf6' }]}>
                        <Ionicons name="add-circle-outline" size={20} color={DEEP_GREEN} />
                      </View>
                      <View style={s.rowBody}>
                        <Text style={s.rowTitle}>My MSA isn't listed</Text>
                        <Text style={s.rowSub}>Propose a new MSA for this university</Text>
                      </View>
                      {proposingNew && (
                        <Ionicons name="checkmark-circle" size={20} color={GREEN} />
                      )}
                    </TouchableOpacity>

                    {/* Name input expands inline when proposing new */}
                    {proposingNew && (
                      <View style={s.inputGroup}>
                        <Text style={s.inputLabel}>MSA Name</Text>
                        <TextInput
                          style={s.input}
                          placeholder="e.g. Michigan State MSA"
                          placeholderTextColor={TEXT_MUTED}
                          value={proposedName}
                          onChangeText={setProposedName}
                          autoCapitalize="words"
                          autoFocus
                          returnKeyType="done"
                        />
                      </View>
                    )}
                  </>
                )}

                <TouchableOpacity
                  style={[s.primaryBtn, !canAdvanceStep1 && s.primaryBtnDisabled]}
                  onPress={() => setStep(2)}
                  disabled={!canAdvanceStep1}
                >
                  <Text style={s.primaryBtnText}>Continue</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            STEP 2 — Message + submit
        ═══════════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <ScrollView contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
            <View style={s.contextChip}>
              <Ionicons name="school" size={15} color={GREEN} />
              <Text style={s.contextChipText} numberOfLines={1}>
                {selectedUni?.name ?? proposedUniName}{proposingNewUni ? '  (new)' : ''}
              </Text>
            </View>
            <View style={[s.contextChip, { marginTop: 8, marginBottom: Spacing.lg }]}>
              <Ionicons name="people" size={15} color={GREEN} />
              <Text style={s.contextChipText} numberOfLines={1}>
                {selectedMsa?.name ?? proposedName}{proposingNew ? '  (new)' : ''}
              </Text>
            </View>

            <Text style={s.sectionTitle}>Where should we send your code?</Text>
            <Text style={s.sectionSub}>
              Once we verify your MSA, we'll send a claim code to the contact below.
            </Text>

            <View style={s.contactCard}>
              <View style={s.contactRow}>
                <Ionicons name="mail-outline" size={18} color={TEXT_MUTED} />
                <TextInput
                  style={s.contactInput}
                  placeholder="Email address"
                  placeholderTextColor={TEXT_MUTED}
                  value={contactEmail}
                  onChangeText={setContactEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
              <View style={s.contactDivider} />
              <View style={s.contactRow}>
                <InstagramIcon size={18} color={TEXT_MUTED} />
                <TextInput
                  style={s.contactInput}
                  placeholder="Instagram handle (optional)"
                  placeholderTextColor={TEXT_MUTED}
                  value={contactInstagram}
                  onChangeText={setContactInstagram}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
            </View>

            <Text style={[s.sectionTitle, { marginTop: 20 }]}>Anything else?</Text>
            <Text style={s.sectionSub}>Optional — helps us verify your request faster.</Text>

            <TextInput
              style={s.textarea}
              placeholder="e.g. I'm the president of the MSA and would like to manage our campus page…"
              placeholderTextColor={TEXT_MUTED}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            {submitError ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={RED} />
                <Text style={s.errorText}>{submitError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.primaryBtn, (submitting || !canSubmit) && s.primaryBtnDisabled]}
              onPress={submit}
              disabled={submitting || !canSubmit}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.primaryBtnText}>Submit Request</Text>
              }
            </TouchableOpacity>

            <Text style={s.disclaimer}>
              Requests are reviewed by the Rihdal team. You'll hear back within 1–3 business days.
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    paddingBottom: Spacing.md, gap: Spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: Radius.circle,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  headerText: { flex: 1 },
  title:    { ...Type.screenTitle, color: DEEP_GREEN },
  subtitle: { ...Type.caption, color: TEXT_MUTED, marginTop: 2 },

  stepRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
  },
  stepDot:       { flex: 1, height: 4, borderRadius: 2, backgroundColor: HAIRLINE },
  stepDotActive: { backgroundColor: GREEN },

  searchWrap: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  selectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#f0faf6', borderRadius: Radius.chip,
    borderWidth: 1.5, borderColor: GREEN,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
  },
  selectedChipText: { ...Type.body, color: DEEP_GREEN, fontWeight: '600', flex: 1 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#fff', borderRadius: Radius.input,
    borderWidth: 1, borderColor: HAIRLINE,
    paddingHorizontal: Spacing.md, height: 46,
  },
  searchInput: { flex: 1, ...Type.body, color: TEXT_DARK, padding: 0 },

  sectionTitle: { ...Type.cardTitle, color: TEXT_DARK, marginBottom: Spacing.sm },
  sectionSub:   { ...Type.caption, color: TEXT_MUTED, marginBottom: Spacing.md, lineHeight: 18 },

  listContent: { padding: Spacing.md, paddingTop: Spacing.xs, paddingBottom: 48 },

  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.sm,
  },
  emptyText: { ...Type.body, color: TEXT_MUTED },

  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: HAIRLINE,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  rowCardSelected: { borderColor: GREEN, borderWidth: 2 },
  rowIcon: {
    width: 36, height: 36, borderRadius: Radius.chip,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody:       { flex: 1 },
  rowTitle:      { ...Type.body, color: TEXT_DARK, fontWeight: '600' },
  rowSub:        { ...Type.caption, color: TEXT_MUTED, marginTop: 2 },
  verifiedBadge: { ...Type.tiny, color: GREEN, fontWeight: '700', marginTop: 2 },

  contextChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#f0faf6', borderRadius: Radius.chip,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  contextChipText: { ...Type.body, color: DEEP_GREEN, fontWeight: '600', flex: 1 },

  contactCard: {
    backgroundColor: '#fff', borderRadius: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: 'hidden', marginBottom: Spacing.sm,
  },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  contactInput:   { flex: 1, fontSize: 14, color: TEXT_DARK },
  contactDivider: { height: 1, backgroundColor: HAIRLINE, marginLeft: 46 },

  inputGroup: { marginBottom: Spacing.md },
  inputLabel: { ...Type.caption, color: TEXT_MUTED, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: Radius.input,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: Spacing.md, paddingVertical: 13,
    ...Type.body, color: TEXT_DARK,
  },
  textarea: {
    backgroundColor: '#fff', borderRadius: Radius.input,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: Spacing.md, paddingVertical: 13,
    ...Type.body, color: TEXT_DARK,
    minHeight: 120, marginBottom: Spacing.md,
  },

  primaryBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: Radius.card,
    paddingVertical: 15, alignItems: 'center', marginTop: Spacing.sm,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff5f5', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#fca5a5', marginBottom: Spacing.sm,
  },
  errorText: { flex: 1, fontSize: 13, color: RED },

  disclaimer: {
    ...Type.caption, color: TEXT_MUTED, textAlign: 'center',
    marginTop: Spacing.md, lineHeight: 18,
  },

  successWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.md,
  },
  successIcon: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  successTitle: { ...Type.screenTitle, color: DEEP_GREEN, textAlign: 'center' },
  successBody:  { ...Type.body, color: TEXT_MUTED, textAlign: 'center', lineHeight: 22 },
  doneBtn: {
    marginTop: Spacing.sm,
    backgroundColor: DEEP_GREEN, borderRadius: Radius.card,
    paddingVertical: 15, paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
  },
  codeLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm,
  },
  codeLinkText: { fontSize: 14, color: GREEN, fontWeight: '600' },
});
