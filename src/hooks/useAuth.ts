import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

const GET_SESSION_TIMEOUT_MS = 5000;

function extractHashError(): string | null {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const errorCode = params.get('error_code') ?? params.get('error');
  if (!errorCode) return null;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return errorCode;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const hashError = extractHashError();
    if (hashError) setAuthError(hashError);

    if (!supabase) {
      setLoading(false);
      return;
    }

    const initAuth = async () => {
      try {
        const sessionPromise = supabase!.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout')), GET_SESSION_TIMEOUT_MS)
        );
        const { data } = await Promise.race([sessionPromise, timeoutPromise]);
        if (!mounted) return;
        setUser(data.session?.user ?? null);
      } catch (error) {
        console.error('[auth] getSession failed:', error);
        if (!mounted) return;
        setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (email: string) => {
    if (!supabase) {
      const err = { message: 'Supabase環境変数が設定されていません', status: 0, name: 'ConfigError' };
      console.error('[auth] signInWithEmail: Supabase not configured');
      return { error: err };
    }
    setAuthError(null);
    const emailRedirectTo = window.location.origin;
    console.info('[auth] signInWithEmail:', { email, emailRedirectTo });
    const result = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });
    if (result.error) {
      console.error('[auth] signInWithEmail failed:', {
        message: result.error.message,
        status: result.error.status,
        name: result.error.name,
        cause: (result.error as unknown as { cause?: unknown }).cause,
      });
    }
    return result;
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return { user, loading, authError, signInWithEmail, signOut };
}
