import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { getOrCreateWorkspace } from './db.js';

const WorkspaceContext = createContext(null);

// Bootstraps the user's workspace on sign-in. Mounted between the auth
// Gate and the App so that App can assume `workspace` is non-null.
//
// PR A scope: only the workspace itself is fetched here. PR B will load
// tasks alongside; PR C will load settings/taxonomy/people. The provider
// stays the single fetch-on-sign-in seam.
export function WorkspaceProvider({ children }) {
  const { session, supabaseDisabled } = useAuth();
  const userId = session?.user?.id ?? null;

  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (supabaseDisabled || !userId) {
      setWorkspace(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const ws = await getOrCreateWorkspace(userId);
        if (cancelled) return;
        setWorkspace(ws);
      } catch (err) {
        if (cancelled) return;
        console.error('[workspace] bootstrap failed', err);
        setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, supabaseDisabled]);

  const value = useMemo(
    () => ({ workspace, loading, error, supabaseDisabled }),
    [workspace, loading, error, supabaseDisabled]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
