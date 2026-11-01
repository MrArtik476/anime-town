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
  // Частая ошибка — вставить publishable-ключ: с ним запись упирается в RLS уже после платного перевода.
  // Считаем, что service role не настроен (перевод не начнётся, stopped: no_store).
  if (isPublishableKey(serviceRoleKey)) {
    console.error(
      "[supabase] SUPABASE_SERVICE_ROLE_KEY содержит publishable-ключ (sb_publishable_…) — нужен secret key (sb_secret_…)",
    );
    return null;
  }

  return { url, serviceRoleKey: serviceRoleKey.trim() };
}

/** Publishable-ключ: новый формат sb_publishable_… или legacy JWT с role = anon. */
export function isPublishableKey(key: string): boolean {
  const value = key.trim();
  if (value.startsWith("sb_publishable_")) return true;
  const payload = value.split(".")[1];
  if (!value.startsWith("eyJ") || !payload) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role === "anon";
  } catch {
    return false;
  }
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
