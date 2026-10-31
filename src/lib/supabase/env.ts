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
