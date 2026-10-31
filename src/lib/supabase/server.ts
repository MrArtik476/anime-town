import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

import { requireSupabaseEnv } from "./env";

/** Supabase-клиент для Server Components, Server Actions и Route Handlers. */
export async function createClient() {
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
