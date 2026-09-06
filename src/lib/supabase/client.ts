"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "../config";

let cached: SupabaseClient | null = null;

/**
 * Browser-side Supabase client, or null when the deployment has no Supabase.
 * Cached so every component shares one auth session listener.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!cached) cached = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return cached;
}
