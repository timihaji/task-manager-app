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

if (!url || !anonKey) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Auth and cloud sync are disabled. Set them in .env to enable.'
  );
}

// `null` if env vars missing — components should check `if (supabase)` before
// using. This lets the app run in localStorage-only mode for now.
export const supabase = (url && anonKey)
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const isSupabaseEnabled = () => !!supabase;
