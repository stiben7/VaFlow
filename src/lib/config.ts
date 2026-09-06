/**
 * One place that decides whether the app runs against Supabase or against the
 * browser.
 *
 * Both env vars present -> cloud mode: real accounts, per-user data, RLS.
 * Either missing        -> local mode: no sign-in, everything in localStorage.
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

export const isCloud = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Routes reachable without a session. */
export const PUBLIC_PATHS = ["/login", "/auth"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}
