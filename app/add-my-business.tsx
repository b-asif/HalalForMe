import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isValidImageBytes } from '../lib/validateImageBytes';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;
const GOLD       = Brand.gold;

type BusinessType = 'restaurant' | 'cafe' | 'other';
const BUSINESS_TYPES: { key: BusinessType; label: string }[] = [
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'cafe',       label: 'Cafe'       },
  { key: 'other',      label: 'Other'      },
];

const TOTAL_STEPS = 3;

export default function AddMyBusinessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('restaurant');
  const [phone, setPhone] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');

  // Step 2
  const [address, setAddress]   = useState('');
  const [lat, setLat]           = useState<number | null>(null);
  const [lng, setLng]           = useState<number | null>(null);
  const [website, setWebsite]   = useState('');
  const [description, setDescription] = useState('');

  // Step 3
  const [proofUri,    setProofUri]    = useState<string | null>(null);
  const [proofBase64, setProofBase64] = useState<string | null>(null);

  const canAdvanceStep1 = businessName.trim().length > 0 && contactEmail.trim().length > 0;
  const canAdvanceStep2 = address.trim().length > 0 && lat !== null && lng !== null;
  const canSubmit       = proofUri !== null;

  const goBack = () => {
    if (step > 1) setStep(s => s - 1);
    else router.back();
  };

  const pickProof = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access is needed to upload your document.');
      return;
    }
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

  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to add your business.');
      return;
    }
    if (!proofBase64) {
      Alert.alert('Document required', 'Please upload a business document to verify your ownership.');
      return;
    }

    setSubmitting(true);
    try {
      // Upload proof document
      const path = `${user.id}/biz_${Date.now()}.jpg`;
      const bytes = Uint8Array.from(atob(proofBase64), c => c.charCodeAt(0));
      if (!isValidImageBytes(bytes)) throw new Error('Invalid image file. Please choose a valid photo.');
      const { error: uploadErr } = await supabase.storage
        .from('halal_certificates')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: publicData } = supabase.storage.from('halal_certificates').getPublicUrl(path);
      const proofUrl = publicData.publicUrl;

      // Insert submission with owner flag
      const { data: inserted, error: subErr } = await supabase
        .from('submissions')
        .insert({
          user_id:                 user.id,
          name:                    businessName.trim(),
          address:                 address.trim(),
          cuisine_type:            null,
          phone:                   phone.trim() || null,
          website:                 website.trim() || null,
          notes:                   [
            `Business type: ${businessType}`,
            `Contact email: ${contactEmail.trim()}`,
            description.trim() || null,
          ].filter(Boolean).join('\n\n'),
          certification_photo_url: proofUrl,
          lat,
          lng,
          submitted_as_owner:      true,
        })
        .select('id')
        .single();

      if (subErr) throw new Error(subErr.message);

      // Notify admin
      supabase.functions.invoke('notify-admin', {
        body: { type: 'submission', link_id: inserted?.id ?? null },
      }).catch((err: unknown) => console.warn('notify-admin failed:', err));

      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[s.successScroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Submitted card */}
          <View style={s.successCard}>
            <View style={s.successIconWrap}>
              <Ionicons name="checkmark" size={32} color="#fff" />
            </View>
            <Text style={s.successTitle}>Claim Submitted!</Text>
            <Text style={s.successBody}>
              Thank you! Our team will review your information and verify your business.
            </Text>
            <View style={s.emailRow}>
              <Ionicons name="mail-outline" size={20} color={TEXT_MUTED} />
              <Text style={s.emailNote}>
                You will receive an email at{' '}
                <Text style={{ fontWeight: '700', color: TEXT_DARK }}>{contactEmail}</Text>
                {'\n'}once your listing is verified.
              </Text>
            </View>
          </View>

          {/* Partner card */}
          <View style={s.partnerCard}>
            <View style={s.partnerDivider} />
            <Text style={s.partnerTitle}>Thank You for Partnering{'\n'}with Rihdal!</Text>
            <Text style={s.partnerBody}>
              Once verified, you'll be able to manage your listing, update information, post events, and more.
            </Text>
            <Image
              source={require('../explore/submission.png')}
              style={s.partnerImage}
              contentFit="contain"
            />
            <Text style={s.partnerTagline}>
              We're excited to have you{'\n'}on the Rihdal community.
            </Text>
            <View style={s.partnerDivider} />
          </View>

          <TouchableOpacity
            style={s.doneBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.85}
          >
            <Text style={s.doneBtnText}>Back to Explore</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Step progress dots ────────────────────────────────────────
  const StepDots = () => (
    <View style={s.dots}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <View
          key={i}
          style={[
            s.dot,
            i < step ? s.dotActive : i === step - 1 ? s.dotActive : s.dotInactive,
            i === step - 1 && s.dotCurrent,
          ]}
        />
      ))}
    </View>
  );

  // ── Step 1: Business Basics ───────────────────────────────────
  const renderStep1 = () => (
    <>
      <Text style={s.stepLabel}>Step 1 of {TOTAL_STEPS}</Text>
      <Text style={s.stepTitle}>Let's verify your business</Text>
      <StepDots />

      <Text style={s.label}>Business Name</Text>
      <TextInput
        style={s.input}
        placeholder="e.g. Saffron Cafe"
        placeholderTextColor={TEXT_MUTED}
        value={businessName}
        onChangeText={setBusinessName}
        autoCapitalize="words"
        returnKeyType="next"
      />

      <Text style={s.label}>Business Type</Text>
      <View style={s.typeRow}>
        {BUSINESS_TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.typeChip, businessType === t.key && s.typeChipActive]}
            onPress={() => setBusinessType(t.key)}
            activeOpacity={0.75}
          >
            <Text style={[s.typeChipText, businessType === t.key && s.typeChipTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>Phone Number</Text>
      <TextInput
        style={s.input}
        placeholder="(408) 123-4567"
        placeholderTextColor={TEXT_MUTED}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        returnKeyType="next"
      />

      <Text style={s.label}>Email</Text>
      <TextInput
        style={s.input}
        placeholder="hello@yourbusiness.com"
        placeholderTextColor={TEXT_MUTED}
        value={contactEmail}
        onChangeText={setContactEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="done"
      />
      <Text style={s.hint}>We'll send your verification status to this email.</Text>
    </>
  );

  // ── Step 2: Location & Details ────────────────────────────────
  const renderStep2 = () => (
    <>
      <Text style={s.stepLabel}>Step 2 of {TOTAL_STEPS}</Text>
      <Text style={s.stepTitle}>Where is your business?</Text>
      <StepDots />

      <Text style={s.label}>Business Address</Text>
      <AddressAutocomplete
        value={address}
        onChangeText={v => { setAddress(v); setLat(null); setLng(null); }}
        onSelect={result => {
          setAddress(result.displayName);
          setLat(result.lat);
          setLng(result.lng);
        }}
        placeholder="123 Main St, San Jose, CA 95112"
      />
      {address.length > 0 && lat === null && (
        <Text style={s.hint}>Select an address from the suggestions to confirm the location.</Text>
      )}

      <Text style={[s.label, { marginTop: 16 }]}>Website <Text style={s.optional}>(optional)</Text></Text>
      <TextInput
        style={s.input}
        placeholder="https://yourbusiness.com"
        placeholderTextColor={TEXT_MUTED}
        value={website}
        onChangeText={setWebsite}
        keyboardType="url"
        autoCapitalize="none"
        returnKeyType="next"
      />

      <Text style={s.label}>Tell us more about your business</Text>
      <TextInput
        style={[s.input, s.textarea]}
        placeholder="We are a halal cafe serving Mediterranean and Middle Eastern cuisine."
        placeholderTextColor={TEXT_MUTED}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
    </>
  );

  // ── Step 3: Proof Upload ──────────────────────────────────────
  const renderStep3 = () => (
    <>
      <Text style={s.stepLabel}>Step 2 of {TOTAL_STEPS}</Text>
      <Text style={s.stepTitle}>Upload Business Proof</Text>
      <Text style={s.stepSubtitle}>This helps us verify your business.</Text>
      <StepDots />

      <TouchableOpacity style={s.uploadBox} onPress={pickProof} activeOpacity={0.75}>
        {proofUri ? (
          <Image source={proofUri} style={s.uploadPreview} contentFit="cover" />
        ) : (
          <>
            <View style={s.uploadIconWrap}>
              <Ionicons name="cloud-upload-outline" size={36} color={TEXT_MUTED} />
            </View>
            <Text style={s.uploadLabel}>Upload Document</Text>
            <Text style={s.uploadSub}>Business License, Halal Certificate,{'\n'}or Utility Bill</Text>
          </>
        )}
      </TouchableOpacity>

      {proofUri && (
        <TouchableOpacity
          style={s.changeProof}
          onPress={pickProof}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-horizontal-outline" size={15} color={GREEN} />
          <Text style={s.changeProofText}>Change document</Text>
        </TouchableOpacity>
      )}

      <Text style={s.hint}>
        Upload a clear photo of your business license, food permit, halal certificate, or utility bill showing your name and address.
      </Text>
    </>
  );

  const handleContinue = () => {
    if (step === 1) {
      if (!businessName.trim()) { Alert.alert('Required', 'Please enter your business name.'); return; }
      if (!contactEmail.trim()) { Alert.alert('Required', 'Please enter your email address.'); return; }
      setStep(2);
    } else if (step === 2) {
      if (!address.trim() || lat === null || lng === null) {
        Alert.alert('Required', 'Please select your business address from the suggestions.');
        return;
      }
      setStep(3);
    }
  };

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={goBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Claim Your Listing</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* CTA button — pinned above keyboard */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        {step < 3 ? (
          <TouchableOpacity
            style={[s.ctaBtn, !canAdvanceStep1 && step === 1 && s.ctaBtnDisabled, !canAdvanceStep2 && step === 2 && s.ctaBtnDisabled]}
            onPress={handleContinue}
            activeOpacity={0.85}
            disabled={(step === 1 && !canAdvanceStep1) || (step === 2 && !canAdvanceStep2)}
          >
            <Text style={s.ctaBtnText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.ctaBtn, (!canSubmit || submitting) && s.ctaBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.ctaBtnText}>Submit Claim</Text>}
          </TouchableOpacity>
        )}

        {step === 3 && (
          <Text style={s.disclaimer}>
            By submitting, you confirm this information is accurate and you have authority to manage this listing.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CREAM, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, fontSize: 17, fontWeight: '700', color: TEXT_DARK, textAlign: 'center',
  },

  content: { padding: 24 },

  stepLabel: { fontSize: 12, fontWeight: '600', color: TEXT_MUTED, letterSpacing: 0.3, marginBottom: 4 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: TEXT_DARK, marginBottom: 4 },
  stepSubtitle: { fontSize: 14, color: TEXT_MUTED, marginBottom: 16 },

  dots: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 28 },
  dot: { height: 6, borderRadius: 3, flex: 1 },
  dotActive: { backgroundColor: DEEP_GREEN },
  dotCurrent: { backgroundColor: DEEP_GREEN },
  dotInactive: { backgroundColor: HAIRLINE },

  label: { fontSize: 13, fontWeight: '600', color: TEXT_DARK, marginBottom: 8 },
  optional: { fontSize: 12, fontWeight: '400', color: TEXT_MUTED },
  hint: { fontSize: 12, color: TEXT_MUTED, lineHeight: 17, marginTop: 4, marginBottom: 16 },

  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: TEXT_DARK, marginBottom: 16,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },

  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeChip: {
    flex: 1, borderWidth: 1.5, borderColor: HAIRLINE,
    borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  typeChipActive: { borderColor: DEEP_GREEN, backgroundColor: DEEP_GREEN },
  typeChipText: { fontSize: 14, fontWeight: '600', color: TEXT_DARK },
  typeChipTextActive: { color: '#fff' },

  uploadBox: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: HAIRLINE,
    borderStyle: 'dashed', borderRadius: 16,
    minHeight: 200, alignItems: 'center', justifyContent: 'center',
    padding: 24, gap: 8, overflow: 'hidden',
  },
  uploadIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  uploadLabel: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },
  uploadSub:   { fontSize: 13, color: TEXT_MUTED, textAlign: 'center', lineHeight: 19 },
  uploadPreview: { width: '100%', height: 200, borderRadius: 12 },
  changeProof: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  changeProofText: { fontSize: 13, fontWeight: '600', color: GREEN },

  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: CREAM, paddingHorizontal: 24, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: HAIRLINE,
  },
  ctaBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disclaimer: {
    fontSize: 11, color: TEXT_MUTED, textAlign: 'center',
    lineHeight: 16, marginTop: 10,
  },

  // Success
  successScroll: { padding: 24, paddingTop: 40, alignItems: 'stretch' },
  successCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 28,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
    marginBottom: 20,
  },
  successIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 24, fontWeight: '800', color: TEXT_DARK, marginBottom: 12 },
  successBody: {
    fontSize: 14, color: TEXT_MUTED, textAlign: 'center',
    lineHeight: 21, marginBottom: 20,
  },
  emailRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: CREAM, borderRadius: 14, padding: 16, width: '100%',
  },
  emailNote: { flex: 1, fontSize: 13, color: TEXT_MUTED, lineHeight: 20 },

  partnerCard: {
    backgroundColor: DEEP_GREEN, borderRadius: 20, paddingHorizontal: 28,
    paddingTop: 28, paddingBottom: 20,
    alignItems: 'center', marginBottom: 24,
  },
  partnerDivider: {
    width: 40, height: 1.5, backgroundColor: GOLD,
    borderRadius: 1, marginBottom: 20,
  },
  partnerTitle: {
    fontSize: 22, fontWeight: '800', color: '#fff',
    textAlign: 'center', lineHeight: 30, marginBottom: 14,
  },
  partnerBody: {
    fontSize: 14, color: 'rgba(255,255,255,0.8)',
    textAlign: 'center', lineHeight: 22, marginBottom: 20,
  },
  partnerImage: {
    width: '100%', height: 180, marginBottom: 20,
  },
  partnerTagline: {
    fontSize: 15, fontWeight: '700', color: '#fff',
    textAlign: 'center', lineHeight: 23, marginBottom: 20,
  },

  doneBtn: {
    backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
