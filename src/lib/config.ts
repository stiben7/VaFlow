/**
 * One place that decides how the app stores data.
 *
 * Both env vars present -> Supabase is available. Each visitor then chooses:
 *   - sign in            -> cloud mode: real account, per-user data, RLS.
 *   - continue as guest  -> local mode: everything in localStorage, no account.
 * Either env var missing -> local mode only, no sign-in offered at all.
 *
 * Keeping the local path alive means `npm run dev` still works on a fresh
 * clone with no setup, and it is the fallback if Supabase is unreachable.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * Accepts either the classic `anon` key (a JWT) or the newer publishable key
 * (`sb_publishable_...`). Both are safe to ship to the browser -- row level
 * security, not key secrecy, is what protects the data.
 */
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

/** True when the deployment has Supabase wired up, so sign-in is possible. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/**
 * Set (to "1") when a visitor picks "continue as guest" on the login gate.
 * The middleware reads it to let them past without a session; the store reads
 * it to stay in local mode. Not httpOnly -- the login page sets it from JS and
 * nothing secret rides on it.
 */
export const GUEST_COOKIE = "vaflow_guest";

/** Routes reachable without a session or a guest choice. */
export const PUBLIC_PATHS = ["/login", "/auth"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}
