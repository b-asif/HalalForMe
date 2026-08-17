import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

interface RestaurantResult {
  id: string;
  name: string;
  address: string;
}

export default function GuideSuggestScreen() {
  const { guideId, guideTitle } = useLocalSearchParams<{ guideId: string; guideTitle: string }>();
  const router    = useRouter();
  const { user }  = useAuth();

  // ── Nominate existing place
  const [searchQuery,         setSearchQuery]         = useState('');
  const [searchResults,       setSearchResults]       = useState<RestaurantResult[]>([]);
  const [searching,           setSearching]           = useState(false);
  const [selectedPlace,       setSelectedPlace]       = useState<RestaurantResult | null>(null);
  const [existingNote,        setExistingNote]        = useState('');
  const [submittingExisting,  setSubmittingExisting]  = useState(false);
  const [submittedIds,        setSubmittedIds]        = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Submit new place
  const [newName,         setNewName]         = useState('');
  const [newAddress,      setNewAddress]      = useState('');
  const [newNote,         setNewNote]         = useState('');
  const [submittingNew,   setSubmittingNew]   = useState(false);

  // ── Search existing restaurants
  const runSearch = async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('restaurants')
      .select('id, name, address')
      .ilike('name', `%${q.trim()}%`)
      .order('name')
      .limit(20);
    setSearchResults((data as RestaurantResult[]) ?? []);
    setSearching(false);
  };

  const onSearchChange = (q: string) => {
    setSearchQuery(q);
    setSelectedPlace(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(q), 350);
  };

  const selectPlace = (r: RestaurantResult) => {
    setSelectedPlace(r);
    setSearchQuery(r.name);
    setSearchResults([]);
  };

  const clearSelection = () => {
    setSelectedPlace(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  // ── Submit existing nomination
  const submitExisting = async () => {
    if (!selectedPlace || !user) return;
    setSubmittingExisting(true);
    const { error } = await supabase.from('guide_suggestions').insert({
      guide_id:      guideId,
      user_id:       user.id,
      restaurant_id: selectedPlace.id,
      note:          existingNote.trim() || null,
      status:        'pending',
    });
    setSubmittingExisting(false);
    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already suggested', 'You already nominated this place for this guide.');
      } else {
        Alert.alert('Error', error.message);
      }
      return;
    }
    setSubmittedIds(prev => new Set([...prev, selectedPlace.id]));
    clearSelection();
    setExistingNote('');
    Alert.alert('Nomination sent!', "Thanks! The Rihdal team will review your suggestion.");
  };

  // ── Submit new place suggestion
  const submitNew = async () => {
    if (!newName.trim())    { Alert.alert('Name required');    return; }
    if (!newAddress.trim()) { Alert.alert('Address required'); return; }
    if (!user) return;
    setSubmittingNew(true);
    const { error } = await supabase.from('guide_suggestions').insert({
      guide_id: guideId,
      user_id:  user.id,
      name:     newName.trim(),
      address:  newAddress.trim(),
      note:     newNote.trim() || null,
      status:   'pending',
    });
    setSubmittingNew(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setNewName('');
    setNewAddress('');
    setNewNote('');
    Alert.alert('Suggestion sent!', "Thanks! The Rihdal team will review your suggestion. If approved, it'll be added to this guide.");
  };

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>Suggest a Place</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {guideTitle ? (
            <Text style={s.guideName}>for "{decodeURIComponent(guideTitle)}"</Text>
          ) : null}

          {/* ── Nominate an existing place ── */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}>
                <Ionicons name="search-outline" size={18} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Nominate an existing place</Text>
                <Text style={s.cardSub}>Search for a restaurant or café already on Rihdal</Text>
              </View>
            </View>

            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={14} color={TEXT_MUTED} />
              <TextInput
                style={s.searchInput}
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder="Search by restaurant name..."
                placeholderTextColor="#bbb"
                returnKeyType="search"
              />
              {searching && <ActivityIndicator size="small" color={GREEN} />}
            </View>

            {/* Search results dropdown */}
            {searchResults.length > 0 && !selectedPlace && (
              <View style={s.resultsList}>
                {searchResults.map((r, idx) => {
                  const done = submittedIds.has(r.id);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[s.resultRow, idx > 0 && s.resultBorder, done && s.resultDone]}
                      onPress={() => !done && selectPlace(r)}
                      activeOpacity={done ? 1 : 0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.resultName} numberOfLines={1}>{r.name}</Text>
                        <Text style={s.resultAddr} numberOfLines={1}>{r.address}</Text>
                      </View>
                      <Ionicons
                        name={done ? 'checkmark-circle' : 'add-circle-outline'}
                        size={20}
                        color={done ? GREEN : '#ccc'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Selected place + optional note + submit */}
            {selectedPlace && (
              <View style={s.selectedWrap}>
                <View style={s.selectedRow}>
                  <Ionicons name="checkmark-circle" size={18} color={GREEN} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.selectedName}>{selectedPlace.name}</Text>
                    <Text style={s.selectedAddr} numberOfLines={1}>{selectedPlace.address}</Text>
                  </View>
                  <TouchableOpacity onPress={clearSelection} hitSlop={10}>
                    <Ionicons name="close-circle" size={18} color="#ccc" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={s.noteInput}
                  value={existingNote}
                  onChangeText={setExistingNote}
                  placeholder="Note for the admin (optional) — e.g. great late-night option"
                  placeholderTextColor="#bbb"
                  multiline
                  maxLength={200}
                />

                <TouchableOpacity
                  style={[s.submitBtn, submittingExisting && s.submitBtnDisabled]}
                  onPress={submitExisting}
                  disabled={submittingExisting}
                >
                  {submittingExisting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.submitBtnText}>Submit Nomination</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── Submit a new place ── */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}>
                <Ionicons name="add-circle-outline" size={18} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Submit a new place</Text>
                <Text style={s.cardSub}>Know a halal spot not yet on Rihdal? Suggest it for this guide</Text>
              </View>
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>NAME *</Text>
              <TextInput
                style={s.fieldInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Zaytoun Kitchen"
                placeholderTextColor="#bbb"
              />
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>ADDRESS *</Text>
              <TextInput
                style={s.fieldInput}
                value={newAddress}
                onChangeText={setNewAddress}
                placeholder="e.g. 123 Campus Dr, San Jose, CA"
                placeholderTextColor="#bbb"
              />
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>NOTE FOR ADMIN</Text>
              <TextInput
                style={[s.fieldInput, s.fieldInputMulti]}
                value={newNote}
                onChangeText={setNewNote}
                placeholder="Why should this place be in the guide? Any halal certification info?"
                placeholderTextColor="#bbb"
                multiline
                maxLength={300}
              />
            </View>

            <TouchableOpacity
              style={[s.submitBtn, submittingNew && s.submitBtnDisabled]}
              onPress={submitNew}
              disabled={submittingNew}
            >
              {submittingNew
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.submitBtnText}>Submit for Review</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={s.disclaimer}>
            All suggestions are reviewed by the Rihdal team before being added to the guide.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },

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

  content:   { padding: 16, paddingBottom: 48 },
  guideName: { fontSize: 13, color: TEXT_MUTED, marginBottom: 16, textAlign: 'center' },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1.5, borderColor: HAIRLINE,
    padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  cardIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#eef9f3', alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: TEXT_DARK, marginBottom: 2 },
  cardSub:   { fontSize: 12, color: TEXT_MUTED, lineHeight: 16 },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CREAM, borderRadius: 10,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 12, paddingVertical: 9,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: TEXT_DARK },

  // Results
  resultsList: {
    borderRadius: 10, borderWidth: 1.5, borderColor: HAIRLINE,
    overflow: 'hidden', marginBottom: 8, backgroundColor: CREAM,
  },
  resultRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  resultBorder: { borderTopWidth: 1, borderTopColor: HAIRLINE },
  resultDone:   { opacity: 0.45 },
  resultName:   { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  resultAddr:   { fontSize: 12, color: TEXT_MUTED },

  // Selected place
  selectedWrap: {
    backgroundColor: '#f0f9f3', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#c8ead8', gap: 10,
  },
  selectedRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  selectedName: { fontSize: 14, fontWeight: '700', color: TEXT_DARK },
  selectedAddr: { fontSize: 12, color: TEXT_MUTED },

  noteInput: {
    backgroundColor: '#fff', borderRadius: 8,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 13, color: TEXT_DARK, minHeight: 56,
    textAlignVertical: 'top',
  },

  // Field inputs
  fieldWrap: {
    backgroundColor: CREAM, borderRadius: 10,
    borderWidth: 1.5, borderColor: HAIRLINE,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4,
    marginBottom: 10,
  },
  fieldLabel: { fontSize: 10, fontWeight: '600', color: TEXT_MUTED, letterSpacing: 0.5, marginBottom: 2 },
  fieldInput: { fontSize: 14, color: TEXT_DARK, paddingVertical: 5, minHeight: 32 },
  fieldInputMulti: { minHeight: 64, textAlignVertical: 'top' },

  // Submit button
  submitBtn:         { backgroundColor: DEEP_GREEN, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },

  disclaimer: { fontSize: 11, color: TEXT_MUTED, textAlign: 'center', paddingHorizontal: 16, marginTop: 4 },
});
