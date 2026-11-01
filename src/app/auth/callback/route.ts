import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/features/auth/validation";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Возврат из письма Supabase Auth (подтверждение почты, сброс пароля; позже — OAuth).
 * - `?code=` — PKCE (шаблоны писем по умолчанию): обмен кода на сессию;
 * - `?token_hash=&type=` — если шаблон письма ведёт сразу на сайт.
 * `next` — только относительный путь (защита от open redirect).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const fail = new URL("/login", request.url);
  fail.searchParams.set("error", "link");

  if (!getSupabaseEnv()) return NextResponse.redirect(fail);
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type && OTP_TYPES.includes(type)
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };

  if (error) {
    console.error("[auth] ссылка из письма не сработала", "code" in error ? error.code : error.message);
    return NextResponse.redirect(fail);
  }
  return NextResponse.redirect(new URL(next, request.url));
}
