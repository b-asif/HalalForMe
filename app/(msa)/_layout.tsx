/**
 * (msa)/_layout.tsx
 *
 * Auth gate for the MSA Admin Portal.
 *
 * Access rules (checked in order):
 *   1. Not logged in → redirect to /(auth)/login
 *   2. Logged in but no active MSA membership AND not a global Rihdal admin
 *      → redirect to /msa/request-access
 *   3. Otherwise → render the portal screens
 *
 * The MsaProvider wraps all child screens so they can call useMsa()
 * to get the active membership, role, and refresh helpers.
 */

import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';

import { useAuth } from '../../contexts/AuthContext';
import { useMsa } from '../../contexts/MsaContext';
import { Brand } from '../../lib/theme';
import { setLastMsaRoute } from '../../lib/msaNavState';

// ─────────────────────────────────────────────────────────────────────────────
// Inner layout — runs inside MsaProvider so it can read useMsa()
// ─────────────────────────────────────────────────────────────────────────────

function MsaLayoutInner() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { loading: msaLoading, activeMembership } = useMsa();
  const router = useRouter();
  const pathname = usePathname();

  const loading = authLoading || msaLoading;

  // Track the last visited top-level MSA screen so the portal re-opens there
  useEffect(() => {
    // pathname is like '/prayer-times', '/events', '/dashboard', etc. (group stripped)
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 1) {
      setLastMsaRoute(`/(msa)/${parts[0]}`);
    }
  }, [pathname]);

  useEffect(() => {
    if (loading) return;

    // Not logged in → send to login
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }

    // Logged in, global admin → always allowed
    if (isAdmin) return;

    // Logged in but no active MSA membership → request access
    if (!activeMembership) {
      router.replace('/msa/request-access');
    }
  }, [loading, user, isAdmin, activeMembership]);

  if (loading || !user || (!isAdmin && !activeMembership)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator color={Brand.green} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported layout — wraps inner with MsaProvider
// ─────────────────────────────────────────────────────────────────────────────

export default function MsaLayout() {
  return <MsaLayoutInner />;
}
