import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/types/database";

import { getSupabaseEnv } from "./env";

export type SessionResult = {
  /** Ответ с обновлёнными cookies сессии — его (или копию его cookies) нужно вернуть из proxy. */
  response: NextResponse;
  /** id пользователя из проверенного JWT; null — гость или Supabase не настроен. */
  userId: string | null;
};

/**
 * Обновление сессии Supabase на каждом запросе (шаблон @supabase/ssr для Next.js 16 proxy.ts).
 * Server Components не могут писать cookies, поэтому истёкший токен обновляется здесь:
 * новые cookies уходят и в запрос (для Server Components), и в ответ (для браузера).
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request });
  const env = getSupabaseEnv();
  if (!env) return { response, userId: null };

  const supabase = createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Cache-Control/Expires/Pragma: ответ с новым токеном не должен попасть в общий кэш.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Между createServerClient и getClaims ничего не выполнять (требование @supabase/ssr):
  // getClaims проверяет JWT и при необходимости обновляет сессию.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return { response, userId: typeof sub === "string" ? sub : null };
}

/** Перенос cookies и cache-заголовков сессии на другой ответ (redirect, 429). Без этого пользователь выйдет. */
export function withSessionCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(header);
    if (value) target.headers.set(header, value);
  }
  return target;
}
