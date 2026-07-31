import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Null when the project isn't configured. Every sync path checks for that, so the
 * app stays fully usable as a local-only journal with no cloud at all.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const cloudConfigured = supabase !== null;

/**
 * Read before the client strips the OAuth params out of the URL. Signing in with
 * Google reloads the page, so this is the only way to tell a fresh sign-in from
 * an ordinary launch with a stored session.
 */
export const returnedFromOAuth =
  typeof window !== 'undefined' &&
  /[?&]code=|access_token=/.test(window.location.search + window.location.hash);

export const JOURNALS_TABLE = 'journals';
