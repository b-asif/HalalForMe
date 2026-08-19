/**
 * MsaContext
 *
 * Provides the current user's active MSA memberships.
 * Used by the (msa) layout to gate access and by portal screens to
 * know which MSA they are managing and what role the user holds.
 */

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MsaMembership {
  /** msa_members row id */
  membershipId: string;
  msaId: string;
  msaName: string;
  universityId: string;
  universityName: string;
  universitySlug: string;
  role: 'admin' | 'editor';
  status: 'active' | 'pending' | 'rejected';
}

interface MsaContextValue {
  /** True while membership data is being fetched */
  loading: boolean;
  /** All active memberships for the current user */
  memberships: MsaMembership[];
  /** The MSA currently being managed (first active, or manually selected) */
  activeMembership: MsaMembership | null;
  /** Switch which MSA is being managed (for users with multiple MSAs) */
  setActiveMsaId: (msaId: string) => void;
  /** Re-fetch memberships (call after approval or role change) */
  refresh: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const MsaContext = createContext<MsaContextValue>({
  loading: true,
  memberships: [],
  activeMembership: null,
  setActiveMsaId: () => {},
  refresh: () => {},
});

export function MsaProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();

  const [loading, setLoading]           = useState(true);
  const [memberships, setMemberships]   = useState<MsaMembership[]>([]);
  const [activeMsaId, setActiveMsaId]   = useState<string | null>(null);

  const fetchMemberships = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('msa_members')
      .select(`
        id,
        msa_id,
        role,
        status,
        msas (
          id,
          name,
          university_id,
          universities (
            id,
            name,
            slug
          )
        )
      `)
      .eq('user_id', user.id)
      .order('requested_at', { ascending: true });

    if (error || !data) {
      setMemberships([]);
      setLoading(false);
      return;
    }

    const parsed: MsaMembership[] = (data as any[])
      .filter(row => row.msas)
      .map(row => ({
        membershipId:   row.id,
        msaId:          row.msa_id,
        msaName:        row.msas.name,
        universityId:   row.msas.universities?.id   ?? row.msas.university_id,
        universityName: row.msas.universities?.name ?? '',
        universitySlug: row.msas.universities?.slug ?? '',
        role:           row.role   as 'admin' | 'editor',
        status:         row.status as 'active' | 'pending' | 'rejected',
      }));

    setMemberships(parsed);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchMemberships(); }, [fetchMemberships]);

  // Derive the active membership:
  // 1. Use the manually selected activeMsaId if it exists and is active
  // 2. Otherwise fall back to the first active membership
  const activeMembership: MsaMembership | null = (() => {
    const active = memberships.filter(m => m.status === 'active');
    if (activeMsaId) {
      const found = active.find(m => m.msaId === activeMsaId);
      if (found) return found;
    }
    return active[0] ?? null;
  })();

  return (
    <MsaContext.Provider
      value={{
        loading,
        memberships,
        activeMembership,
        setActiveMsaId,
        refresh: fetchMemberships,
      }}
    >
      {children}
    </MsaContext.Provider>
  );
}

export function useMsa() {
  return useContext(MsaContext);
}
