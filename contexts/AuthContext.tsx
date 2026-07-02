import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** true while the initial getSession() call is in flight */
  loading: boolean;
  isAdmin: boolean;
  isPasswordRecovery: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  isAdmin: false,
  isPasswordRecovery: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // Hydrate from AsyncStorage on boot
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      })
      .catch(() => {
        // If getSession rejects (bad config, AsyncStorage failure, etc.) we
        // must still clear the loading flag or the splash screen hangs forever.
        setLoading(false);
      });

    // Keep in sync with Supabase auth events (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setLoading(false);
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        } else if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
          setIsPasswordRecovery(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  // Fetch is_admin from profiles whenever the logged-in user changes.
  // Also sync tos_accepted_at from auth metadata → profiles on first sign-in.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    const tosAcceptedAt = session?.user?.user_metadata?.tos_accepted_at as string | undefined;
    supabase
      .from('profiles')
      .select('is_admin, tos_accepted_at')
      .eq('id', userId)
      .maybeSingle()
      .then(
        ({ data }) => {
          setIsAdmin(data?.is_admin === true);
          // Backfill acceptance timestamp the first time the user signs in
          if (tosAcceptedAt && !data?.tos_accepted_at) {
            supabase
              .from('profiles')
              .update({ tos_accepted_at: tosAcceptedAt })
              .eq('id', userId)
              .then(() => {});
          }
        },
        () => setIsAdmin(false),
      );
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, isAdmin, isPasswordRecovery, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
