"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, isCloud } from "../config";

let cached: SupabaseClient | null = null;

/**
 * Browser-side Supabase client, or null when the app is running in local mode.
 * Cached so every component shares one auth session listener.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isCloud) return null;
  if (!cached) cached = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return cached;
}
