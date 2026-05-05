import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const supabaseDisabled = !supabase;
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!supabaseDisabled);

  useEffect(() => {
    if (supabaseDisabled) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [supabaseDisabled]);

  const signIn = useCallback(async (email, password) => {
    if (supabaseDisabled) return { error: { message: 'Supabase not configured.' } };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, [supabaseDisabled]);

  const signUp = useCallback(async (email, password) => {
    if (supabaseDisabled) return { error: { message: 'Supabase not configured.' } };
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  }, [supabaseDisabled]);

  const signOut = useCallback(async () => {
    if (supabaseDisabled) return { error: null };
    const { error } = await supabase.auth.signOut();
    return { error };
  }, [supabaseDisabled]);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loading,
    supabaseDisabled,
    signIn,
    signUp,
    signOut,
  }), [session, loading, supabaseDisabled, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
