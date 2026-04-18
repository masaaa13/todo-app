import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

function extractHashError(): string | null {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const errorCode = params.get('error_code') ?? params.get('error');
  if (!errorCode) return null;
  // Clear the error from the URL without adding history entry
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return errorCode;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const hashError = extractHashError();
    if (hashError) setAuthError(hashError);

    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user && !hashError) {
        // No session and no URL error — user is simply not logged in
      }
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithEmail = async (email: string) => {
    if (!supabase) return { error: null };
    setAuthError(null);
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return { user, loading, authError, signInWithEmail, signOut };
}
