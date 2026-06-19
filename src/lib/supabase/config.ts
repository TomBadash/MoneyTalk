// Central place for the (public) Supabase env values + a configured-guard,
// so the rest of the app can safely no-op while keys are absent (local demo).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Supabase's current key scheme calls this the "publishable" key
// (sb_publishable_…); older projects expose an "anon" JWT. Accept either —
// both are public and protected by Row Level Security.
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True once both public Supabase env vars are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
