import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { getSupabaseAdminEnv } from "./env";

/**
 * Серверный клиент с service role: пишет в таблицы мимо RLS. Без сессии и cookies.
 * Только для серверного кода (lib/localization). null — Supabase не настроен.
 */
export function createAdminClient(): SupabaseClient<Database> | null {
  const env = getSupabaseAdminEnv();
  if (!env) return null;
  return createSupabaseClient<Database>(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
