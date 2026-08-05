import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { isValidImageBytes } from '../../lib/validateImageBytes';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const RED   = Brand.red;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

type Role = 'owner' | 'manager' | 'franchisee';

const ROLES: { key: Role; label: string; desc: string }[] = [
  { key: 'owner',      label: 'Owner',       desc: 'I own this restaurant'          },
  { key: 'manager',    label: 'Manager',      desc: 'I manage day-to-day operations' },
  { key: 'franchisee', label: 'Franchisee',   desc: 'I operate a franchise location' },
];

export default function ClaimRestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();

  const [restaurantName, setRestaurantName] = useState('');
  const [contactName,    setContactName]    = useState('');
  const [contactEmail,   setContactEmail]   = useState(user?.email ?? '');
  const [role,           setRole]           = useState<Role>('owner');
  const [message,        setMessage]        = useState('');
  const [proofUri,       setProofUri]       = useState<string | null>(null);
  const [proofBase64,    setProofBase64]    = useState<string | null>(null);

  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  // ── load restaurant name + pre-fill profile name ──────────
  useEffect(() => {
    const load = async () => {
      const [restRes, profileRes] = await Promise.all([
        supabase.from('restaurants').select('name').eq('id', id).single(),
        user ? supabase.from('profiles').select('name').eq('id', user.id).single() : Promise.resolve({ data: null }),
      ]);
      if (restRes.data) setRestaurantName(restRes.data.name);
      if (profileRes.data?.name) setContactName(profileRes.data.name);
      setLoading(false);
    };
    load();
  }, [id, user]);

  // ── pick proof document / photo ────────────────────────────
  const pickProof = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setProofUri(result.assets[0].uri);
      setProofBase64(result.assets[0].base64 ?? null);
    }
  };

  const uploadProof = async (): Promise<string | null> => {
    if (!proofBase64) return null;
    const path = `claims/${id}_${user!.id}_${Date.now()}.jpg`;
    const bytes = Uint8Array.from(atob(proofBase64), c => c.charCodeAt(0));
    if (!isValidImageBytes(bytes)) throw new Error('Invalid image file.');
    const { error } = await supabase.storage
      .from('halal_certificates')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('halal_certificates').getPublicUrl(path);
    return data.publicUrl;
  };

  // ── submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please log in to claim a restaurant.');
      return;
    }
    if (!contactName.trim()) {
      Alert.alert('Name required', 'Please enter your contact name.');
      return;
    }
    if (!contactEmail.trim()) {
      Alert.alert('Email required', 'Please enter your business email.');
      return;
    }

    setSubmitting(true);
    try {
      const proofUrl = await uploadProof();

      const { data: inserted, error } = await supabase
        .from('restaurant_claims')
        .insert({
          restaurant_id: id,
          user_id:       user.id,
          contact_name:  contactName.trim(),
          contact_email: contactEmail.trim(),
          role,
          message:       message.trim() || null,
          proof_url:     proofUrl,
        })
        .select('id')
        .single();

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Already submitted', 'You have already submitted a claim for this restaurant. Our team will review it.');
        } else {
          Alert.alert('Error', error.message);
        }
        return;
      }

      // notify admin with link so it appears in notifications page
      supabase.functions.invoke('notify-admin', {
        body: {
          type:    'claim',
          link_id: inserted?.id ?? null,
        },
      }).catch((err: unknown) => console.warn('notify-admin failed:', err));

      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── success state ──────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={[s.header, { paddingTop: insets.top > 0 ? 0 : 12 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Claim Submitted</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.successBox}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color={GREEN} />
          </View>
          <Text style={s.successTitle}>Claim received!</Text>
          <Text style={s.successBody}>
            Our team will review your claim for{' '}
            <Text style={{ fontWeight: '700' }}>{restaurantName}</Text> and reach out to you at{' '}
            <Text style={{ fontWeight: '700' }}>{contactEmail}</Text>.{'\n\n'}
            This typically takes 1–3 business days.
          </Text>
          <TouchableOpacity style={s.doneBtn} onPress={() => router.back()}>
            <Text style={s.doneBtnText}>Back to Restaurant</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.flex}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <View style={[s.header, { paddingTop: insets.top > 0 ? 0 : 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Claim Listing</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Restaurant info */}
          <View style={s.restaurantCard}>
            <View style={s.restaurantIcon}>
              <Ionicons name="storefront" size={22} color={GREEN} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.restaurantCardLabel}>Claiming ownership of</Text>
              <Text style={s.restaurantCardName} numberOfLines={2}>{restaurantName}</Text>
            </View>
          </View>

          <Text style={s.infoText}>
            Fill in your details below. Our admin team will verify your claim before granting access.
          </Text>

          {/* Role picker */}
          <Text style={s.label}>Your Role *</Text>
          <View style={s.roleGrid}>
            {ROLES.map(r => (
              <TouchableOpacity
                key={r.key}
                style={[s.roleChip, role === r.key && s.roleChipActive]}
                onPress={() => setRole(r.key)}
                activeOpacity={0.75}
              >
                <Text style={[s.roleChipLabel, role === r.key && s.roleChipLabelActive]}>
                  {r.label}
                </Text>
                <Text style={[s.roleChipDesc, role === r.key && s.roleChipDescActive]}>
                  {r.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Contact name */}
          <Text style={s.label}>Your Full Name *</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Ahmed Hassan"
            placeholderTextColor={TEXT_MUTED}
            value={contactName}
            onChangeText={setContactName}
            autoCapitalize="words"
          />

          {/* Contact email */}
          <Text style={s.label}>Business Email *</Text>
          <TextInput
            style={s.input}
            placeholder="you@yourrestaurant.com"
            placeholderTextColor={TEXT_MUTED}
            value={contactEmail}
            onChangeText={setContactEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={s.hint}>
            Using your restaurant's domain email (e.g. @yourrestaurant.com) speeds up verification.
          </Text>

          {/* Message */}
          <Text style={s.label}>Additional Info (optional)</Text>
          <TextInput
            style={[s.input, s.textarea]}
            placeholder="Tell us anything that helps verify your claim — years in business, social media handles, etc."
            placeholderTextColor={TEXT_MUTED}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {/* Proof upload */}
          <Text style={s.label}>Business Document (optional but recommended)</Text>
          <Text style={s.hint}>Upload a business license, food permit, or utility bill showing your name and restaurant.</Text>
          <TouchableOpacity style={s.proofPicker} onPress={pickProof} activeOpacity={0.75}>
            {proofUri ? (
              <Image source={proofUri} style={s.proofPreview} contentFit="cover" />
            ) : (
              <>
                <Ionicons name="document-attach-outline" size={28} color={TEXT_MUTED} />
                <Text style={s.proofPickerText}>Tap to attach document or photo</Text>
              </>
            )}
          </TouchableOpacity>
          {proofUri && (
            <TouchableOpacity onPress={() => { setProofUri(null); setProofBase64(null); }} style={s.removeProof}>
              <Ionicons name="close-circle-outline" size={16} color={RED} />
              <Text style={s.removeProofText}>Remove</Text>
            </TouchableOpacity>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
                  <Text style={s.submitBtnText}>Submit Claim</Text>
                </>
              )}
          </TouchableOpacity>

          <Text style={s.disclaimer}>
            By submitting, you confirm that the information provided is accurate and that you have the authority to manage this listing.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: CREAM },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CREAM, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center' },

  content: { padding: 20 },

  restaurantCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: '#d4f0e5', marginBottom: 16,
  },
  restaurantIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center',
  },
  restaurantCardLabel: { fontSize: 11, color: TEXT_MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  restaurantCardName:  { fontSize: 16, fontWeight: '700', color: TEXT_DARK, marginTop: 2 },

  infoText: { fontSize: 13, color: TEXT_MUTED, lineHeight: 19, marginBottom: 24 },

  label: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED, marginBottom: 8 },
  hint:  { fontSize: 12, color: TEXT_MUTED, lineHeight: 17, marginBottom: 16, marginTop: -8 },

  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: TEXT_DARK, marginBottom: 16,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },

  roleGrid: { gap: 10, marginBottom: 20 },
  roleChip: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 14, padding: 14,
  },
  roleChipActive:      { backgroundColor: '#e6f9f2', borderColor: GREEN },
  roleChipLabel:       { fontSize: 15, fontWeight: '700', color: TEXT_DARK, marginBottom: 2 },
  roleChipLabelActive: { color: GREEN },
  roleChipDesc:        { fontSize: 13, color: TEXT_MUTED },
  roleChipDescActive:  { color: '#4aad8a' },

  proofPicker: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderStyle: 'dashed', borderRadius: 14,
    height: 110, alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 8,
  },
  proofPickerText: { fontSize: 14, color: TEXT_MUTED },
  proofPreview:    { width: '100%', height: '100%', borderRadius: 12 },
  removeProof: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 },
  removeProofText: { fontSize: 13, color: RED },

  submitBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  disclaimer: {
    fontSize: 12, color: TEXT_MUTED, textAlign: 'center',
    lineHeight: 17, marginTop: 14, paddingHorizontal: 8,
  },

  // success
  successBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: { marginBottom: 20 },
  successTitle: { fontSize: 26, fontWeight: '800', color: TEXT_DARK, marginBottom: 14 },
  successBody:  { fontSize: 15, color: TEXT_MUTED, textAlign: 'center', lineHeight: 22 },
  doneBtn: {
    marginTop: 32, backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 40,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
