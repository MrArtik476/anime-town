// Значения-заглушки из .env.example (`<project-ref>`, `sb_publishable_xxx`) считаются отсутствующими.
const PLACEHOLDER = /<|xxx/;

export type SupabaseEnv = { url: string; publishableKey: string };

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  if (PLACEHOLDER.test(url) || PLACEHOLDER.test(publishableKey)) return null;

  return { url, publishableKey };
}

export type SupabaseAdminEnv = { url: string; serviceRoleKey: string };

/**
 * Серверный доступ на запись (service role, мимо RLS). Только для серверного кода:
 * переменная без префикса NEXT_PUBLIC_ в клиентскую сборку не попадает.
 */
export function getSupabaseAdminEnv(): SupabaseAdminEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;
  if (PLACEHOLDER.test(url) || PLACEHOLDER.test(serviceRoleKey)) return null;

  return { url, serviceRoleKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

export function requireSupabaseEnv(): SupabaseEnv {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase не настроен: задайте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY в .env.local",
    );
  }
  return env;
}
