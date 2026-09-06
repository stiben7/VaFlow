import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, isCloud } from "../config";

/**
 * Server-side client for Server Components and Route Handlers.
 *
 * A fresh client per request, never shared -- a shared one would leak one
 * user's session into another request.
 */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!isCloud) return null;
  const store = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session instead, so this is safe to skip.
        }
      },
    },
  });
}
