// Supabase client singleton.
//
// Required env vars (set in .env, see .env.example):
//   VITE_SUPABASE_URL       — your project URL (https://<ref>.supabase.co)
//   VITE_SUPABASE_ANON_KEY  — the public anon key from Project Settings > API
//
// In dev: import.meta.env reads from .env (not committed).
// In prod (GitHub Pages): set as repo secrets and pass via Actions workflow,
// OR keep them in the bundle (anon key is safe to expose — it's gated by RLS).

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Dev bypass: visit the app with ?dev=1 (or set localStorage tm_dev=1) to
// force local-only mode regardless of env vars. Lets Claude / contributors
// skip the Supabase login during dev verification — the app boots straight
// into INIT_TASKS-seeded localStorage data, so the Stack/Board/Inbox views
// are reachable and interactive without real credentials. In production
// builds this still requires the user to opt in via URL, so it doesn't
// weaken auth for real users.
export const isDevBypass = () => {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('dev') === '1') return true;
    if (window.localStorage?.getItem('tm_dev') === '1') return true;
  } catch {}
  return false;
};

const bypass = isDevBypass();

if (!bypass && (!url || !anonKey)) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Auth and cloud sync are disabled. Set them in .env to enable.'
  );
}

// `null` if env vars missing OR dev bypass is active — components should
// check `if (supabase)` before using. This lets the app run in
// localStorage-only mode for now.
export const supabase = (!bypass && url && anonKey)
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const isSupabaseEnabled = () => !!supabase;
