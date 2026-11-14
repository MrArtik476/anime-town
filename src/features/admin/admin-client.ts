import { getCurrentProfile } from "@/features/auth/session";
import type { ActionResult } from "@/features/comments/actions";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Общее для Server Actions админ-панели: клиент от имени администратора и стандартные отказы. */

export const INVALID: ActionResult = { ok: false, message: "Неверные данные" };
export const FORBIDDEN: ActionResult = { ok: false, message: "Недостаточно прав" };
export const UNAVAILABLE: ActionResult = { ok: false, message: "Админ-панель временно недоступна" };

export type AdminSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Право проверяет RLS (private.is_admin(), миграция admin) — роль здесь читается только ради понятного ответа
 * без запроса. Клиент — от имени пользователя, service role в админке не используется.
 */
export async function adminClient(): Promise<AdminSupabase | ActionResult> {
  if (!getSupabaseEnv()) return UNAVAILABLE;
  if ((await getCurrentProfile())?.profile?.role !== "admin") return FORBIDDEN;
  return createClient();
}

export const isResult = (value: AdminSupabase | ActionResult): value is ActionResult => "ok" in value;
