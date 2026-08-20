import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useMsa } from '../../contexts/MsaContext';
import { isValidImageBytes } from '../../lib/validateImageBytes';
import { formatError } from '../../lib/errors';
import { APP_VERSION } from '../../lib/appVersion';
import { setGuestLoginIntent } from '../../lib/guestLoginIntent';
import { getLastMsaRoute } from '../../lib/msaNavState';
import { Brand } from '../../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN      = Brand.green;
const RED        = Brand.red;
const AMBER      = Brand.amber;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

// ─── Types ───────────────────────────────────────────────────────────────────

interface OwnedOrg {
  id: string;
  name: string;
  type: 'restaurant' | 'mosque' | 'msa';
  role: string;
  route: string;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <Text style={s.sectionHeader}>{label}</Text>
  );
}

function MenuRow({
  icon,
  label,
  subtitle,
  onPress,
  isLast = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle?: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.menuItem, !isLast && s.menuItemBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.menuIcon}>
        <Ionicons name={icon} size={19} color={GREEN} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.menuLabel}>{label}</Text>
        {subtitle ? <Text style={s.menuSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
    </TouchableOpacity>
  );
}

function OrgRow({ org, isLast }: { org: OwnedOrg; isLast: boolean }) {
  const router = useRouter();
  const iconMap: Record<OwnedOrg['type'], React.ComponentProps<typeof Ionicons>['name']> = {
    restaurant: 'storefront-outline',
    mosque:     'business-outline',
    msa:        'school-outline',
  };
  return (
    <TouchableOpacity
      style={[s.menuItem, !isLast && s.menuItemBorder]}
      onPress={() => router.push(org.route as any)}
      activeOpacity={0.7}
    >
      <View style={s.menuIcon}>
        <Ionicons name={iconMap[org.type]} size={19} color={GREEN} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.menuLabel}>{org.name}</Text>
        <Text style={s.menuSub}>{org.role}</Text>
      </View>
      <Text style={s.manageChip}>Manage</Text>
      <Ionicons name="chevron-forward" size={16} color={TEXT_MUTED} />
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, isAdmin } = useAuth();
  const { memberships } = useMsa();
  const [signingOut, setSigningOut] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  // Profile data loaded from DB
  const [profileName,      setProfileName]      = useState<string>('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileLoading,   setProfileLoading]   = useState(true);
  const [submissionCount,  setSubmissionCount]  = useState<number | null>(null);

  // Organizations the user manages
  const [ownedOrgs, setOwnedOrgs] = useState<OwnedOrg[]>([]);

  // Edit modal state
  const [editVisible, setEditVisible] = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newEmail,    setNewEmail]    = useState('');
  const [newAvatar,   setNewAvatar]   = useState<{ uri: string; base64: string } | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  // Email change OTP modal state
  const [otpVisible,     setOtpVisible]     = useState(false);
  const [otpTargetEmail, setOtpTargetEmail] = useState('');
  const [otpDigits,      setOtpDigits]      = useState(['', '', '', '', '', '']);
  const [otpLoading,     setOtpLoading]     = useState(false);
  const [otpError,       setOtpError]       = useState<string | null>(null);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // Load profile from DB
  const loadProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setProfileName(data.name ?? user.user_metadata?.name ?? '');
      setProfileAvatarUrl(data.avatar_url ?? null);
    } else {
      setProfileName(user.user_metadata?.name ?? '');
    }

    setProfileLoading(false);

    // Fetch submission count in parallel (non-blocking)
    supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('submitted_by', user.id)
      .then(({ count }) => { if (count !== null) setSubmissionCount(count); });
  }, [user]);

  // Load organizations the user manages
  const loadOrgs = useCallback(async () => {
    if (!user) { setOwnedOrgs([]); return; }

    const [{ data: rData }, { data: mData }] = await Promise.all([
      supabase.from('restaurants').select('id, name').eq('owner_id', user.id),
      supabase.from('mosques').select('id, name').eq('owner_id', user.id),
    ]);

    const restaurants: OwnedOrg[] = (rData ?? []).map((r: any) => ({
      id: r.id, name: r.name, type: 'restaurant', role: 'Owner',
      route: `/restaurant/${r.id}`,
    }));
    const mosques: OwnedOrg[] = (mData ?? []).map((m: any) => ({
      id: m.id, name: m.name, type: 'mosque', role: 'Owner',
      route: `/mosque/${m.id}/manage`,
    }));
    const msaOrgs: OwnedOrg[] = memberships
      .filter(m => m.status === 'active')
      .map(m => ({
        id: m.msaId, name: m.msaName, type: 'msa' as const,
        role: m.role === 'admin' ? 'Administrator' : 'Editor',
        route: getLastMsaRoute(),
      }));

    setOwnedOrgs([...restaurants, ...mosques, ...msaOrgs]);
  }, [user, memberships]);

  useEffect(() => {
    loadProfile();
    loadOrgs();
  }, [loadProfile, loadOrgs]);

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
            Alert.alert(
              'Are you absolutely sure?',
              'Your account, profile, reviews, and all uploaded photos will be permanently deleted.',
              [
                { text: 'Go Back', style: 'cancel' },
                { text: 'Yes, Delete Everything', style: 'destructive', onPress: performDeleteAccount },
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
      if (profileAvatarUrl) {
        const path = profileAvatarUrl.split('/avatars/')[1];
        if (path) {
          await supabase.storage.from('avatars').remove([decodeURIComponent(path)]);
        }
      }
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
          ? 'Account deletion is not yet configured on the server. Please contact support@rihdal.com to delete your account.'
          : `Something went wrong: ${msg}\n\nPlease try again or email support@rihdal.com.`,
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
    if (base64.length > 6_700_000) throw new Error('Photo is too large. Please choose an image under 5 MB.');
    const path = `${user!.id}/${Crypto.randomUUID()}.jpg`;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (!isValidImageBytes(bytes)) throw new Error('Invalid image file.');
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

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ name: trimmed, avatar_url: avatarUrl })
        .eq('id', user!.id);
      if (dbErr) throw new Error(formatError(dbErr));

      const emailChanged = trimmedEmail !== user?.email;
      const { error: authErr } = await supabase.auth.updateUser({
        data: { name: trimmed },
        ...(emailChanged ? {
          email: trimmedEmail,
          options: { emailRedirectTo: 'halalforme://email-change-confirmed' },
        } : {}),
      });

      setProfileName(trimmed);
      setProfileAvatarUrl(avatarUrl);
      setEditVisible(false);

      if (authErr) {
        Alert.alert(
          'Partially saved',
          emailChanged
            ? 'Your name and photo were updated, but the email change failed. Please try again from your profile.'
            : 'Your profile was saved.',
        );
      } else if (emailChanged) {
        setOtpTargetEmail(trimmedEmail);
        setOtpDigits(['', '', '', '', '', '']);
        setOtpError(null);
        setOtpVisible(true);
      }
    } catch (e: any) {
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleOtpDigit = (value: string, index: number) => {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, 6);
      if (!pasted.length) return;
      const next = Array(6).fill('').map((_, i) => pasted[i] ?? '');
      setOtpDigits(next);
      const focusIdx = Math.min(pasted.length - 1, 5);
      otpRefs.current[focusIdx]?.focus();
      if (pasted.length === 6) handleVerifyEmailOtp(pasted);
      return;
    }
    const digit = value.replace(/\D/g, '');
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setOtpError(null);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (digit && index === 5) {
      const full = [...next.slice(0, 5), digit].join('');
      if (full.length === 6) handleVerifyEmailOtp(full);
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otpDigits[index] && index > 0) {
      const next = [...otpDigits];
      next[index - 1] = '';
      setOtpDigits(next);
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyEmailOtp = async (codeOverride?: string) => {
    const code = codeOverride ?? otpDigits.join('');
    if (code.length < 6) { setOtpError('Enter the full 6-digit code.'); return; }
    setOtpLoading(true);
    setOtpError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: otpTargetEmail,
      token: code,
      type: 'email_change',
    });
    setOtpLoading(false);
    if (error) {
      setOtpError('Invalid or expired code. Request a new one and try again.');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } else {
      setOtpVisible(false);
      Alert.alert('Email updated', `Your email has been changed to ${otpTargetEmail}.`);
    }
  };

  // ── Guest screen ─────────────────────────────────────────────────────────
  if (!user) {
    const LOCKED_FEATURES = [
      { icon: 'heart' as const,       label: 'Saved Restaurants', sub: 'Bookmark spots to revisit later' },
      { icon: 'storefront' as const,  label: 'My Submissions',    sub: 'Track restaurants you\'ve added' },
      { icon: 'star' as const,        label: 'Write Reviews',     sub: 'Share your dining experiences' },
      { icon: 'business' as const,    label: 'Claim a Mosque',    sub: 'Manage your mosque\'s page' },
    ] as const;
    return (
      <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
        <View style={s.header}>
          <Text style={s.title}>Profile</Text>
        </View>
        <ScrollView contentContainerStyle={s.guestWrap} showsVerticalScrollIndicator={false}>
          <View style={s.guestHero}>
            <View style={s.guestHeroIcon}>
              <Ionicons name="person" size={32} color={CREAM} />
            </View>
            <Text style={s.guestTitle}>You're browsing as a guest</Text>
            <Text style={s.guestSub}>
              Create a free account to unlock everything below.
            </Text>
          </View>

          <View style={s.lockedCard}>
            {LOCKED_FEATURES.map((f, idx) => (
              <View key={f.label} style={[s.lockedRow, idx < LOCKED_FEATURES.length - 1 && s.lockedRowBorder]}>
                <View style={s.lockedIconWrap}>
                  <Ionicons name={f.icon} size={18} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.lockedLabel}>{f.label}</Text>
                  <Text style={s.lockedSub}>{f.sub}</Text>
                </View>
                <View style={s.lockBadge}>
                  <Ionicons name="lock-closed" size={11} color={TEXT_MUTED} />
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.guestSignInBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/signup'); }}>
            <Text style={s.guestSignInText}>Create Free Account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.guestSignUpBtn} onPress={() => { setGuestLoginIntent(true); router.push('/(auth)/login'); }}>
            <Text style={s.guestSignUpText}>Sign In</Text>
          </TouchableOpacity>

          <View style={s.guestLinks}>
            <TouchableOpacity style={s.guestLink} onPress={() => router.push('/onboarding')}>
              <Ionicons name="play-circle-outline" size={16} color={GREEN} />
              <Text style={s.guestLinkText}>View App Tour</Text>
              <Ionicons name="chevron-forward" size={14} color={TEXT_MUTED} />
            </TouchableOpacity>
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
            <TouchableOpacity style={[s.guestLink, { borderBottomWidth: 0 }]} onPress={() => router.push('/terms-of-service')}>
              <Ionicons name="reader-outline" size={16} color={GREEN} />
              <Text style={s.guestLinkText}>Terms of Service</Text>
              <Ionicons name="chevron-forward" size={14} color={TEXT_MUTED} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  const email      = user?.email ?? '';
  const isVerified = Boolean(user?.email_confirmed_at);
  const initials   = profileName
    ? profileName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : email.slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Text style={s.title}>Profile</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Profile header ── */}
        <View style={s.profileCard}>
          <TouchableOpacity style={s.avatarWrap} onPress={openEdit} activeOpacity={0.85}>
            {profileLoading ? (
              <View style={s.avatar}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : profileAvatarUrl ? (
              <Image source={profileAvatarUrl} style={s.avatarImage} contentFit="cover" />
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
            {profileName ? <Text style={s.displayName}>{profileName}</Text> : null}
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
            <View style={s.statsRow}>
              {user.created_at ? (
                <Text style={s.statChip}>
                  Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </Text>
              ) : null}
              {submissionCount !== null && submissionCount > 0 ? (
                <Text style={s.statChip}>
                  {submissionCount} submission{submissionCount !== 1 ? 's' : ''}
                </Text>
              ) : null}
            </View>
          </View>

          <TouchableOpacity style={s.editBtn} onPress={openEdit}>
            <Ionicons name="pencil-outline" size={17} color={GREEN} />
          </TouchableOpacity>
        </View>

        {/* ── YOUR STUFF ── */}
        <SectionHeader label="Your Stuff" />
        <View style={s.menuCard}>
          <MenuRow
            icon="heart-outline"
            label="Saved"
            onPress={() => router.push('/saved-hub')}
          />
          <MenuRow
            icon="storefront-outline"
            label="My Submissions"
            onPress={() => router.push('/my-submissions')}
            isLast
          />
        </View>

        {/* ── YOUR ORGANIZATIONS (conditional) ── */}
        {ownedOrgs.length > 0 && (
          <>
            <SectionHeader label="Your Organizations" />
            <View style={s.menuCard}>
              {ownedOrgs.map((org, i) => (
                <OrgRow key={org.id} org={org} isLast={i === ownedOrgs.length - 1} />
              ))}
            </View>
          </>
        )}

        {/* ── PREFERENCES ── */}
        <SectionHeader label="Preferences" />
        <View style={s.menuCard}>
          <MenuRow
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push('/settings')}
            isLast
          />
        </View>

        {/* ── RIHDAL ── */}
        <SectionHeader label="Rihdal" />
        <View style={s.menuCard}>
          <MenuRow
            icon="shield-checkmark-outline"
            label="Halal Certification Guide"
            onPress={() => router.push('/certification-guide')}
          />
          <MenuRow
            icon="play-circle-outline"
            label="App Tour"
            onPress={() => router.push('/onboarding')}
            isLast
          />
        </View>

        {/* ── Contribute CTA ── */}
        <TouchableOpacity
          style={s.ctaBlock}
          onPress={() => router.push('/manage-organization')}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.ctaTitle}>Want to contribute to Rihdal?</Text>
            <Text style={s.ctaSub}>Add or manage an organization →</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={GREEN} />
        </TouchableOpacity>

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

        <Text style={s.version}>Rihdal v{APP_VERSION}</Text>

        {/* ── Danger zone (de-emphasised) ── */}
        <TouchableOpacity
          style={s.dangerZoneBtn}
          onPress={handleDeleteAccount}
          disabled={deleting}
          activeOpacity={0.7}
        >
          {deleting
            ? <ActivityIndicator size="small" color={TEXT_MUTED} style={{ marginRight: 6 }} />
            : <Ionicons name="trash-outline" size={14} color={TEXT_MUTED} style={{ marginRight: 6 }} />
          }
          <Text style={s.dangerZoneText}>
            {deleting ? 'Deleting account…' : 'Delete Account'}
          </Text>
        </TouchableOpacity>
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Email Change OTP Modal ── */}
      <Modal
        visible={otpVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setOtpVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={m.overlay}>
            <View style={m.sheet}>
              <View style={m.handle} />
              <TouchableOpacity style={m.closeBtn} onPress={() => setOtpVisible(false)}>
                <Ionicons name="close" size={18} color={TEXT_MUTED} />
              </TouchableOpacity>

              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#e6f9f2', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Ionicons name="mail-open-outline" size={30} color={GREEN} />
                </View>
                <Text style={m.title}>Confirm new email</Text>
                <Text style={[m.emailNote, { textAlign: 'center', marginTop: 6 }]}>
                  Enter the 6-digit code sent to{'\n'}
                  <Text style={{ fontWeight: '700', color: TEXT_DARK }}>{otpTargetEmail}</Text>
                </Text>
              </View>

              {otpError ? (
                <View style={m.errorBox}>
                  <Ionicons name="alert-circle-outline" size={14} color={RED} />
                  <Text style={m.errorText}>{otpError}</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
                {otpDigits.map((d, i) => (
                  <TextInput
                    key={i}
                    ref={ref => { otpRefs.current[i] = ref; }}
                    style={[m.otpBox, d && m.otpBoxFilled, otpError && m.otpBoxError]}
                    value={d}
                    onChangeText={v => handleOtpDigit(v, i)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
                    keyboardType="number-pad"
                    maxLength={6}
                    selectTextOnFocus
                    textAlign="center"
                    caretHidden
                  />
                ))}
              </View>

              <TouchableOpacity
                style={[m.saveBtn, (otpLoading || otpDigits.join('').length < 6) && m.saveBtnDisabled]}
                onPress={() => handleVerifyEmailOtp()}
                disabled={otpLoading || otpDigits.join('').length < 6}
              >
                {otpLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={m.saveText}>Confirm Email</Text>}
              </TouchableOpacity>

              <Text style={[m.emailNote, { textAlign: 'center', marginTop: 12 }]}>
                Didn't get it? Check your spam folder or cancel and try again.
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
              <Text style={m.emailNote}>A 6-digit confirmation code will be sent to your new email address.</Text>

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

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },
  header: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  title: { fontSize: 22, fontWeight: '800', color: TEXT_DARK },

  // Profile header card
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
  avatarImage: { width: 60, height: 60, borderRadius: 30 },
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
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  statChip: {
    fontSize: 11, fontWeight: '500', color: TEXT_MUTED,
    backgroundColor: CREAM, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  editBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
  },

  // Section headers
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: TEXT_MUTED,
    letterSpacing: 0.5, textTransform: 'uppercase',
    marginHorizontal: 20, marginTop: 24, marginBottom: 8,
  },

  // Section cards
  menuCard: {
    backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  menuIcon: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center', marginRight: 13,
  },
  menuLabel: { fontSize: 15, fontWeight: '500', color: TEXT_DARK },
  menuSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
  manageChip: { fontSize: 13, fontWeight: '600', color: GREEN, marginRight: 6 },

  // Contribute CTA
  ctaBlock: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f0faf6', marginHorizontal: 16, marginTop: 20,
    borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: '#c3e8d8',
  },
  ctaTitle: { fontSize: 14, fontWeight: '700', color: TEXT_DARK, marginBottom: 2 },
  ctaSub:   { fontSize: 13, color: GREEN, fontWeight: '500' },

  // Sign out
  signOutCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 20, borderRadius: 16,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  menuIconDanger: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#fff5f5', alignItems: 'center', justifyContent: 'center', marginRight: 13,
  },
  signOutLabel: { fontSize: 15, fontWeight: '600', color: RED },

  // Footer
  version: { textAlign: 'center', fontSize: 12, color: TEXT_MUTED, marginTop: 24, marginBottom: 8 },
  dangerZoneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, marginBottom: 4,
  },
  dangerZoneText: { fontSize: 12, color: TEXT_MUTED },

  // Guest state
  guestWrap: {
    alignItems: 'center', paddingTop: 32, paddingHorizontal: 20, paddingBottom: 40,
  },
  guestHero: { alignItems: 'center', marginBottom: 24, width: '100%' },
  guestHeroIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: DEEP_GREEN, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  guestTitle: { fontSize: 19, fontWeight: '800', color: TEXT_DARK, marginBottom: 6, textAlign: 'center' },
  guestSub:   { fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 21 },
  lockedCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3,
    shadowOffset: { width: 0, height: 3 },
  },
  lockedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  lockedRowBorder: { borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  lockedIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#f0faf6', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  lockedLabel: { fontSize: 15, fontWeight: '600', color: TEXT_DARK },
  lockedSub:   { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
  lockBadge: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: CREAM, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  guestSignInBtn: {
    width: '100%', backgroundColor: DEEP_GREEN, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginBottom: 12,
  },
  guestSignInText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  guestSignUpBtn: {
    width: '100%', backgroundColor: '#f0faf6', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginBottom: 24,
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
  otpBox: {
    width: 44, height: 54, borderRadius: 12,
    borderWidth: 2, borderColor: HAIRLINE,
    backgroundColor: '#fff', fontSize: 22, fontWeight: '700', color: TEXT_DARK,
  },
  otpBoxFilled: { borderColor: GREEN, backgroundColor: '#f0faf6' },
  otpBoxError:  { borderColor: RED,   backgroundColor: '#fff5f5' },
});
