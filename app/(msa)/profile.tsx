/**
 * (msa)/profile.tsx
 *
 * MSA admin — edit MSA profile: logo image, Instagram handle, description, etc.
 * The logo_url is what shows on the Campus Hub landing card for this university.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useMsa } from '../../contexts/MsaContext';
import { Brand, Radius, Spacing } from '../../lib/theme';

interface MsaProfile {
  name: string;
  description: string;
  instagram_handle: string;
  email: string;
  website: string;
  logo_url: string | null;
}

export default function MsaProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeMembership } = useMsa();
  const msaId = activeMembership?.msaId ?? '';

  const [profile, setProfile]       = useState<MsaProfile>({
    name: '', description: '', instagram_handle: '', email: '', website: '', logo_url: null,
  });
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [uploadingImg,  setUploadingImg]  = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    if (!msaId) return;
    setLoading(true);
    supabase.from('msas').select('name, description, instagram_handle, email, website, logo_url')
      .eq('id', msaId).maybeSingle()
      .then(({ data, error }) => {
        if (error) Alert.alert('Error', error.message);
        else if (data) {
          setProfile({
            name:             data.name             ?? '',
            description:      data.description      ?? '',
            instagram_handle: data.instagram_handle ?? '',
            email:            data.email            ?? '',
            website:          data.website          ?? '',
            logo_url:         data.logo_url         ?? null,
          });
        }
        setLoading(false);
      });
  }, [msaId]));

  // ── Image upload ──────────────────────────────────────────────────────────

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload a campus image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    const asset  = result.assets[0];
    const path   = `${msaId}/logo.jpg`;

    setUploadingImg(true);
    try {
      const bytes = Uint8Array.from(atob(asset.base64!), c => c.charCodeAt(0));

      const { error: upErr } = await supabase.storage
        .from('msa-logos')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('msa-logos').getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: dbErr } = await supabase.from('msas').update({ logo_url: url }).eq('id', msaId);
      if (dbErr) throw dbErr;

      setProfile(p => ({ ...p, logo_url: url }));
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image.');
    } finally {
      setUploadingImg(false);
    }
  };

  const handleRemoveImage = () => {
    Alert.alert('Remove image', 'Remove the campus image?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('msas').update({ logo_url: null }).eq('id', msaId);
          if (error) Alert.alert('Error', error.message);
          else setProfile(p => ({ ...p, logo_url: null }));
        },
      },
    ]);
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('msas').update({
      description:      profile.description.trim()      || null,
      instagram_handle: profile.instagram_handle.trim().replace(/^@/, '') || null,
      email:            profile.email.trim()            || null,
      website:          profile.website.trim()          || null,
    }).eq('id', msaId);
    setSaving(false);

    if (error) Alert.alert('Save failed', error.message);
    else Alert.alert('Saved', 'MSA profile updated.');
  };

  const set = (field: keyof MsaProfile, value: string) =>
    setProfile(p => ({ ...p, [field]: value }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Brand.textDark} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>MSA Profile</Text>
          <Text style={s.headerSub}>{activeMembership?.msaName ?? ''}</Text>
        </View>
        <TouchableOpacity
          style={[s.saveBtn, saving && s.disabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={Brand.green} />
        </View>
      ) : (
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Campus image */}
            <Text style={s.sectionLabel}>CAMPUS IMAGE</Text>
            <View style={s.card}>
              {profile.logo_url ? (
                <View>
                  <Image
                    source={{ uri: profile.logo_url }}
                    style={s.previewImage}
                    contentFit="cover"
                  />
                  <View style={s.imageActions}>
                    <TouchableOpacity
                      style={s.imageActionBtn}
                      onPress={handlePickImage}
                      disabled={uploadingImg}
                      activeOpacity={0.8}
                    >
                      {uploadingImg
                        ? <ActivityIndicator size="small" color={Brand.deepGreen} />
                        : <>
                            <Ionicons name="image-outline" size={15} color={Brand.deepGreen} />
                            <Text style={s.imageActionText}>Change</Text>
                          </>}
                    </TouchableOpacity>
                    <View style={s.imageActionDivider} />
                    <TouchableOpacity
                      style={s.imageActionBtn}
                      onPress={handleRemoveImage}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={15} color={Brand.red} />
                      <Text style={[s.imageActionText, { color: Brand.red }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={s.imagePlaceholder}
                  onPress={handlePickImage}
                  disabled={uploadingImg}
                  activeOpacity={0.8}
                >
                  {uploadingImg ? (
                    <ActivityIndicator size="large" color={Brand.green} />
                  ) : (
                    <>
                      <View style={s.imagePlaceholderIcon}>
                        <Ionicons name="image-outline" size={28} color={Brand.textMuted} />
                      </View>
                      <Text style={s.imagePlaceholderTitle}>Add campus image</Text>
                      <Text style={s.imagePlaceholderSub}>
                        This image shows on the Campus Hub card for your university.{'\n'}Recommended: 16:9, at least 800×450px.
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Instagram */}
            <Text style={s.sectionLabel}>SOCIAL</Text>
            <View style={s.card}>
              <View style={s.fieldRow}>
                <View style={s.fieldIcon}>
                  <Ionicons name="logo-instagram" size={18} color="#E1306C" />
                </View>
                <View style={s.fieldBody}>
                  <Text style={s.fieldLabel}>Instagram</Text>
                  <TextInput
                    style={s.fieldInput}
                    placeholder="@your_msa"
                    placeholderTextColor={Brand.textMuted}
                    value={profile.instagram_handle ? `@${profile.instagram_handle.replace(/^@/, '')}` : ''}
                    onChangeText={v => set('instagram_handle', v.replace(/^@/, ''))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="twitter"
                  />
                </View>
              </View>
            </View>

            {/* Contact & info */}
            <Text style={s.sectionLabel}>INFO</Text>
            <View style={s.card}>
              <View style={s.fieldRow}>
                <View style={s.fieldIcon}>
                  <Ionicons name="text-outline" size={18} color={Brand.textMuted} />
                </View>
                <View style={s.fieldBody}>
                  <Text style={s.fieldLabel}>Description</Text>
                  <TextInput
                    style={[s.fieldInput, s.fieldInputMulti]}
                    placeholder="A short description of your MSA"
                    placeholderTextColor={Brand.textMuted}
                    value={profile.description}
                    onChangeText={v => set('description', v)}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
              <View style={s.divider} />
              <View style={s.fieldRow}>
                <View style={s.fieldIcon}>
                  <Ionicons name="mail-outline" size={18} color={Brand.textMuted} />
                </View>
                <View style={s.fieldBody}>
                  <Text style={s.fieldLabel}>Email</Text>
                  <TextInput
                    style={s.fieldInput}
                    placeholder="msa@university.edu"
                    placeholderTextColor={Brand.textMuted}
                    value={profile.email}
                    onChangeText={v => set('email', v)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <View style={s.divider} />
              <View style={s.fieldRow}>
                <View style={s.fieldIcon}>
                  <Ionicons name="globe-outline" size={18} color={Brand.textMuted} />
                </View>
                <View style={s.fieldBody}>
                  <Text style={s.fieldLabel}>Website</Text>
                  <TextInput
                    style={s.fieldInput}
                    placeholder="https://yourmsa.org"
                    placeholderTextColor={Brand.textMuted}
                    value={profile.website}
                    onChangeText={v => set('website', v)}
                    keyboardType="url"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Brand.cream },
  flex:    { flex: 1 },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Brand.hairline,
  },
  backBtn:      { padding: 4, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: Brand.textDark },
  headerSub:    { fontSize: 12, color: Brand.textMuted, marginTop: 1 },
  saveBtn: {
    backgroundColor: Brand.deepGreen, borderRadius: Radius.chip,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabled:    { opacity: 0.6 },

  scroll:       { padding: Spacing.md, gap: Spacing.md },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Brand.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },

  card: {
    backgroundColor: '#fff', borderRadius: Radius.card,
    borderWidth: 1, borderColor: Brand.hairline, overflow: 'hidden',
  },

  // Image
  previewImage: { width: '100%', height: 200 },
  imageActions: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: Brand.hairline,
  },
  imageActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  imageActionDivider: { width: 1, backgroundColor: Brand.hairline },
  imageActionText:    { fontSize: 14, fontWeight: '600', color: Brand.deepGreen },

  imagePlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 36, paddingHorizontal: Spacing.xl, gap: 8,
  },
  imagePlaceholderIcon: {
    width: 56, height: 56, borderRadius: Radius.card,
    backgroundColor: Brand.cream, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  imagePlaceholderTitle: { fontSize: 15, fontWeight: '700', color: Brand.textDark },
  imagePlaceholderSub:   { fontSize: 13, color: Brand.textMuted, textAlign: 'center', lineHeight: 18 },

  // Fields
  fieldRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: Spacing.md, paddingVertical: 14, gap: 12,
  },
  fieldIcon: { paddingTop: 2 },
  fieldBody: { flex: 1, gap: 4 },
  fieldLabel:{ fontSize: 11, fontWeight: '700', color: Brand.textMuted, letterSpacing: 0.5 },
  fieldInput: { fontSize: 15, color: Brand.textDark, paddingVertical: 0 },
  fieldInputMulti: { minHeight: 60, textAlignVertical: 'top' },
  divider: { height: 1, backgroundColor: Brand.hairline, marginLeft: Spacing.md + 30 },
});
