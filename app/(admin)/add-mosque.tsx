import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { generateInviteCode, generateManualOsmId } from '../../lib/mosques/manual';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

export default function AddMosqueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name,    setName]    = useState('');
  const [address, setAddress] = useState('');
  const [lat,     setLat]     = useState<number | null>(null);
  const [lng,     setLng]     = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Mosque name is required.');
      return;
    }
    if (lat == null || lng == null) {
      Alert.alert('Missing address', 'Select an address from the suggestions so the mosque has a location.');
      return;
    }

    setSubmitting(true);
    try {
      const osmId = generateManualOsmId();
      const { error } = await supabase.from('mosques').insert({
        osm_id: osmId,
        name: name.trim(),
        address: address.trim() || null,
        lat,
        lng,
        invite_code: generateInviteCode(),
        invite_code_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw new Error(error.message);

      router.replace(`/mosque/${osmId.replace('/', ':')}` as any);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={DEEP_GREEN} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Add a Mosque</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <View style={s.iconWrap}>
            <MaterialCommunityIcons name="mosque" size={28} color={GREEN} />
          </View>
          <Text style={s.subtitle}>
            For a mosque that isn't in OpenStreetMap and doesn't show up in the Nearby Mosques search. It'll appear in results immediately, ready to onboard just like any other mosque.
          </Text>

          <Text style={s.label}>Name *</Text>
          <TextInput
            style={s.input}
            placeholder="Mosque name"
            placeholderTextColor={TEXT_MUTED}
            value={name}
            onChangeText={setName}
            returnKeyType="next"
          />

          <Text style={s.label}>Address *</Text>
          <AddressAutocomplete
            value={address}
            onChangeText={v => { setAddress(v); setLat(null); setLng(null); }}
            onSelect={sel => { setAddress(sel.displayName); setLat(sel.lat); setLng(sel.lng); }}
            placeholder="Full address"
          />

          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.submitBtnText}>Add Mosque</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },

  content: { padding: 20 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#EFF6F1',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14,
  },
  subtitle: { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 19, marginBottom: 24 },

  label: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED, marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: TEXT_DARK, marginBottom: 18,
  },

  submitBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
