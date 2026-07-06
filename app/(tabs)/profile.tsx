import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatError } from '../../lib/errors';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const RED   = Brand.red;
const AMBER = Brand.amber;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

interface MenuItem {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, isAdmin } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Profile data loaded from DB
  const [profileName,      setProfileName]      = useState<string>('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileLoading,   setProfileLoading]   = useState(true);

  // Edit modal state
  const [editVisible, setEditVisible] = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newEmail,    setNewEmail]    = useState('');
  const [newAvatar,   setNewAvatar]   = useState<{ uri: string; base64: string } | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  // Load profile from DB
  const loadProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    const { data } = await supabase.from('profiles').select('name, avatar_url').eq('id', user.id).maybeSingle();

    if (data) {
      setProfileName(data.name ?? user.user_metadata?.name ?? '');
      setProfileAvatarUrl(data.avatar_url ?? null);
    } else {
      setProfileName(user.user_metadata?.name ?? '');
    }

    setProfileLoading(false);
  }, [user]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data including reviews, submissions, and saved restaurants.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            // Second confirmation to prevent accidental taps
            Alert.alert(
              'Are you absolutely sure?',
              'Your account, profile, reviews, and all uploaded photos will be permanently deleted.',
              [
                { text: 'Go Back', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: performDeleteAccount,
                },
              ],
            );
          },
        },
      ],
    );
  };

  const performDeleteAccount = async () => {
    setDeleting(true);
    try {
      // Remove avatar from storage if one exists
      if (profileAvatarUrl) {
        const path = profileAvatarUrl.split('/avatars/')[1];
        if (path) {
          await supabase.storage.from('avatars').remove([decodeURIComponent(path)]);
        }
      }

      // RPC deletes all user rows across every table then removes the auth user
      const { error } = await supabase.rpc('delete_user');
      if (error) throw new Error(error.message);

      await signOut();
    } catch (e: any) {
      setDeleting(false);
      const msg: string = e?.message ?? 'Unknown error';
      const isRpcMissing = msg.includes('Could not find the function') || msg.includes('404');
      Alert.alert(
        'Deletion Failed',
        isRpcMissing
          ? 'Account deletion is not yet configured on the server. Please contact infor.halalforme@gmail.com to delete your account.'
          : `Something went wrong: ${msg}\n\nPlease try again or email infor.halalforme@gmail.com.`,
      );
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => { setSigningOut(true); await signOut(); },
      },
    ]);
  };

  const openEdit = () => {
    setNewName(profileName);
    setNewEmail(user?.email ?? '');
    setNewAvatar(null);
    setSaveError(null);
    setEditVisible(true);
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setSaveError('Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setNewAvatar({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  };

  const uploadAvatar = async (base64: string): Promise<string> => {
    // ~5 MB limit: base64 is ~4/3× the binary size, so 6.7M chars ≈ 5 MB
    if (base64.length > 6_700_000) throw new Error('Photo is too large. Please choose an image under 5 MB.');
    const path = `${user!.id}/${Crypto.randomUUID()}.jpg`;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  };

  const saveProfile = async () => {
    const trimmed = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmed) { setSaveError('Name cannot be empty.'); return; }
    if (!trimmedEmail) { setSaveError('Email cannot be empty.'); return; }
    setSaving(true);
    setSaveError(null);

    try {
      let avatarUrl = profileAvatarUrl;
      if (newAvatar) {
        avatarUrl = await uploadAvatar(newAvatar.base64);
      }

      // DB first — most likely to fail (RLS, schema); if it fails, auth is untouched
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ name: trimmed, avatar_url: avatarUrl })
        .eq('id', user!.id);
      if (dbErr) throw new Error(formatError(dbErr));

      // Auth second — update metadata and optionally email
      const emailChanged = trimmedEmail !== user?.email;
      const { error: authErr } = await supabase.auth.updateUser({
        data: { name: trimmed },
        ...(emailChanged ? { email: trimmedEmail } : {}),
      });

      // DB already saved successfully — commit UI state regardless of auth result
      setProfileName(trimmed);
      setProfileAvatarUrl(avatarUrl);
      setEditVisible(false);

      if (authErr) {
        // Name/avatar saved; only the auth metadata/email change failed
        Alert.alert(
          'Partially saved',
          emailChanged
            ? 'Your name and photo were updated, but the email change failed. Please try again from your profile.'
            : 'Your profile was saved.',
        );
      } else if (emailChanged) {
        Alert.alert(
          'Confirm your new email',
          `A confirmation link has been sent to ${trimmedEmail}. Check your inbox to complete the change.`,
        );
      }
    } catch (e: any) {
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  };


  // ── Guest screen ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
        <View style={s.header}>
          <Text style={s.title}>Profile</Text>
        </View>
        <ScrollView contentContainerStyle={s.guestWrap} showsVerticalScrollIndicator={false}>
          <Ionicons name="person-circle-outline" size={80} color={TEXT_MUTED} />
          <Text style={s.guestTitle}>Sign in to your account</Text>
          <Text style={s.guestSub}>
            Save restaurants, submit new spots, write reviews, and track your contributions.
          </Text>
          <TouchableOpacity style={s.guestSignInBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}>
            <Text style={s.guestSignInText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.guestSignUpBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/signup'); }}>
            <Text style={s.guestSignUpText}>Create Account</Text>
          </TouchableOpacity>
          <View style={s.guestLinks}>
            <TouchableOpacity style={s.guestLink} onPress={() => router.push('/certification-guide')}>
              <Ionicons name="shield-checkmark-outline" size={16} color={GREEN} />
              <Text style={s.guestLinkText}>Halal Certification Guide</Text>
              <Ionicons name="chevron-forward" size={14} color={TEXT_MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={s.guestLink} onPress={() => router.push('/privacy-policy')}>
              <Ionicons name="document-text-outline" size={16} color={GREEN} />
              <Text style={s.guestLinkText}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={14} color={TEXT_MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={s.guestLink} onPress={() => router.push('/terms-of-service')}>
              <Ionicons name="reader-outline" size={16} color={GREEN} />
              <Text style={s.guestLinkText}>Terms of Service</Text>
              <Ionicons name="chevron-forward" size={14} color={TEXT_MUTED} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const email      = user?.email ?? '';
  const isVerified = Boolean(user?.email_confirmed_at);
  const initials   = profileName
    ? profileName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : email.slice(0, 2).toUpperCase();

  const menuItems: MenuItem[] = [
    { icon: 'heart-outline',            label: 'Saved Restaurants',         onPress: () => router.push('/saved') },
    { icon: 'storefront-outline',       label: 'My Submissions',            onPress: () => router.push('/my-submissions') },
    { icon: 'star-outline',             label: 'My Reviews',                onPress: () => router.push('/my-reviews') },
    { icon: 'ban-outline',              label: 'Blocked Users',             onPress: () => router.push('/blocked-users') },
    { icon: 'shield-checkmark-outline', label: 'Halal Certification Guide', onPress: () => router.push('/certification-guide') },
    { icon: 'notifications-outline',    label: 'Notifications',             onPress: () => router.push('/notifications') },
    { icon: 'help-circle-outline',      label: 'Help & Support',            onPress: () => router.push('/help') },
    { icon: 'document-text-outline',    label: 'Privacy Policy',            onPress: () => router.push('/privacy-policy') },
    { icon: 'reader-outline',           label: 'Terms of Service',          onPress: () => router.push('/terms-of-service') },
    ...(isAdmin ? [{ icon: 'settings-outline' as const, label: 'Admin Panel', onPress: () => router.push('/(admin)') }] : []),
  ];

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Text style={s.title}>Profile</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── User card ── */}
        <View style={s.profileCard}>
          {/* Avatar */}
          <TouchableOpacity style={s.avatarWrap} onPress={openEdit} activeOpacity={0.85}>
            {profileLoading ? (
              <View style={s.avatar}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : profileAvatarUrl ? (
              <Image
                source={profileAvatarUrl}
                style={s.avatarImage}
                contentFit="cover"
              />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={s.avatarEditBadge}>
              <Ionicons name="camera" size={11} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={s.userInfo}>
            {profileName ? (
              <Text style={s.displayName}>{profileName}</Text>
            ) : null}
            <Text style={s.email} numberOfLines={1}>{email}</Text>
            <View style={s.verifiedRow}>
              <Ionicons
                name={isVerified ? 'checkmark-circle' : 'time-outline'}
                size={13}
                color={isVerified ? GREEN : AMBER}
              />
              <Text style={[s.verifiedText, { color: isVerified ? GREEN : AMBER }]}>
                {isVerified ? 'Verified account' : 'Email not verified'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={s.editBtn} onPress={openEdit}>
            <Ionicons name="pencil-outline" size={17} color={GREEN} />
          </TouchableOpacity>
        </View>

        {/* ── Menu ── */}
        <View style={s.menuCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[s.menuItem, index < menuItems.length - 1 && s.menuItemBorder]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={s.menuIcon}>
                <Ionicons name={item.icon} size={19} color={GREEN} />
              </View>
              <Text style={s.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity
          style={s.signOutCard}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.8}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color={RED} />
          ) : (
            <View style={s.menuIconDanger}>
              <Ionicons name="log-out-outline" size={19} color={RED} />
            </View>
          )}
          <Text style={s.signOutLabel}>
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </Text>
        </TouchableOpacity>

        {/* ── Delete account ── */}
        <TouchableOpacity
          style={s.deleteCard}
          onPress={handleDeleteAccount}
          disabled={deleting}
          activeOpacity={0.8}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={RED} style={{ marginRight: 13 }} />
          ) : (
            <View style={s.menuIconDanger}>
              <Ionicons name="trash-outline" size={19} color={RED} />
            </View>
          )}
          <Text style={s.signOutLabel}>
            {deleting ? 'Deleting account…' : 'Delete Account'}
          </Text>
        </TouchableOpacity>

        <Text style={s.version}>HalalForMe v1.0.0</Text>
      </ScrollView>

      {/* ── Edit Profile Modal ── */}
      <Modal
        visible={editVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={m.overlay}>
            <View style={m.sheet}>
              <View style={m.handle} />
              <TouchableOpacity style={m.closeBtn} onPress={() => setEditVisible(false)}>
                <Ionicons name="close" size={18} color={TEXT_MUTED} />
              </TouchableOpacity>

              <Text style={m.title}>Edit Profile</Text>

              {/* Avatar picker */}
              <TouchableOpacity style={m.avatarPicker} onPress={pickAvatar} activeOpacity={0.85}>
                {newAvatar ? (
                  <Image source={newAvatar.uri} style={m.avatarPickerImage} contentFit="cover" />
                ) : profileAvatarUrl ? (
                  <Image source={profileAvatarUrl} style={m.avatarPickerImage} contentFit="cover" />
                ) : (
                  <View style={m.avatarPickerPlaceholder}>
                    <Text style={m.avatarPickerInitials}>{initials}</Text>
                  </View>
                )}
                <View style={m.avatarPickerOverlay}>
                  <Ionicons name="camera" size={16} color="#fff" />
                  <Text style={m.avatarPickerLabel}>Change Photo</Text>
                </View>
              </TouchableOpacity>

              {/* Name field */}
              <Text style={m.label}>Display Name</Text>
              <TextInput
                style={m.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Your name"
                placeholderTextColor={TEXT_MUTED}
                autoCapitalize="words"
                returnKeyType="next"
              />

              {/* Email field */}
              <Text style={[m.label, { marginTop: 16 }]}>Email</Text>
              <TextInput
                style={m.input}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="your@email.com"
                placeholderTextColor={TEXT_MUTED}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={saveProfile}
              />
              <Text style={m.emailNote}>A confirmation link will be sent if you change your email.</Text>

              {saveError ? (
                <View style={m.errorBox}>
                  <Ionicons name="alert-circle-outline" size={14} color={RED} />
                  <Text style={m.errorText}>{saveError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[m.saveBtn, saving && m.saveBtnDisabled]}
                onPress={saveProfile}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={m.saveText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  header: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  title: { fontSize: 22, fontWeight: '800', color: TEXT_DARK },

  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  avatarWrap: { marginRight: 14, position: 'relative' },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: {
    width: 60, height: 60, borderRadius: 30,
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  userInfo: { flex: 1, gap: 2 },
  displayName: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },
  email: { fontSize: 13, color: TEXT_MUTED },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  verifiedText: { fontSize: 12, fontWeight: '500' },
  editBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
  },

  menuCard: {
    backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  menuIcon: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center', marginRight: 13,
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: TEXT_DARK },

  signOutCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 16,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  menuIconDanger: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#fff5f5', alignItems: 'center', justifyContent: 'center', marginRight: 13,
  },
  signOutLabel: { fontSize: 15, fontWeight: '600', color: RED },
  deleteCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 16,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  version: { textAlign: 'center', fontSize: 12, color: TEXT_MUTED, marginTop: 24, marginBottom: 32 },

  // guest state
  guestWrap: {
    alignItems: 'center', paddingTop: 52, paddingHorizontal: 28, paddingBottom: 40,
  },
  guestTitle: { fontSize: 20, fontWeight: '800', color: TEXT_DARK, marginTop: 20, marginBottom: 8, textAlign: 'center' },
  guestSub:   { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  guestSignInBtn: {
    width: '100%', backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginBottom: 12,
  },
  guestSignInText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  guestSignUpBtn: {
    width: '100%', backgroundColor: '#f0faf6', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginBottom: 32,
    borderWidth: 1.5, borderColor: '#c3e8d8',
  },
  guestSignUpText: { color: GREEN, fontSize: 16, fontWeight: '700' },
  guestLinks: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  guestLink: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  guestLinkText: { flex: 1, fontSize: 15, fontWeight: '500', color: TEXT_DARK },
});

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: HAIRLINE, alignSelf: 'center', marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 20,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: TEXT_DARK, marginBottom: 24 },

  avatarPicker: {
    width: 96, height: 96, borderRadius: 48,
    alignSelf: 'center', marginBottom: 24,
    overflow: 'hidden', backgroundColor: GREEN,
  },
  avatarPickerImage: { width: '100%', height: '100%' },
  avatarPickerPlaceholder: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarPickerInitials: { color: '#fff', fontSize: 32, fontWeight: '700' },
  avatarPickerOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 6,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4,
  },
  avatarPickerLabel: { fontSize: 11, color: '#fff', fontWeight: '600' },

  label: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: HAIRLINE, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: TEXT_DARK, backgroundColor: CREAM,
  },
  emailNote: { fontSize: 11, color: TEXT_MUTED, marginTop: 6, marginBottom: 4 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff5f5', borderRadius: 10, padding: 10,
    marginTop: 10, borderWidth: 1, borderColor: '#fca5a5',
  },
  errorText: { flex: 1, fontSize: 13, color: RED },
  saveBtn: {
    marginTop: 24, backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
