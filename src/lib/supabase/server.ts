import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import type { Database } from "@/types/database";

import { requireSupabaseEnv } from "./env";

/**
 * Supabase-клиент для Server Components, Server Actions и Route Handlers.
 * Не для функций с "use cache": connection() там запрещён (и данные сессии кэшировать нельзя).
 */
export async function createClient() {
  // Первым делом — connection(): supabase-js читает сессию (_loadSession → Date.now()) и в getClaims, и перед
  // каждым запросом к Data API. С Partial Prefetching cookies() доступны уже при пререндере, поэтому одного
  // await cookies() мало — Next.js ловил «Date.now() while prerendering» (UserMenu в шапке, обсуждение тайтла).
  await connection();
  const cookieStore = await cookies();
  const { url, publishableKey } = requireSupabaseEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Вызов из Server Component: cookies там только читаются,
          // сессию обновит proxy (будет добавлен вместе с авторизацией).
        }
      },
    },
  });
}
