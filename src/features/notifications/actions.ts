"use server";

import { refresh } from "next/cache";

import { getCurrentUser } from "@/features/auth/session";
import type { ActionResult } from "@/features/comments/actions";
import { commentErrorMessage } from "@/features/comments/errors";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const INVALID: ActionResult = { ok: false, message: "Неверные данные" };
const UNAVAILABLE: ActionResult = { ok: false, message: "Уведомления временно недоступны" };
const SIGN_IN: ActionResult = { ok: false, message: "Войдите, чтобы продолжить" };

const parseId = (raw: unknown): number | null => (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null);

/** Отметить одно уведомление прочитанным. Уже прочитанное не трогаем (read_at остаётся прежним). */
export async function markRead(rawId: unknown): Promise<ActionResult> {
  const id = parseId(rawId);
  if (!id) return INVALID;
  if (!getSupabaseEnv()) return UNAVAILABLE;
  if (!(await getCurrentUser())) return SIGN_IN;
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  if (error) return { ok: false, message: commentErrorMessage(error) };
  refresh();
  return { ok: true };
}

export async function markAllRead(): Promise<ActionResult> {
  if (!getSupabaseEnv()) return UNAVAILABLE;
  const user = await getCurrentUser();
  if (!user) return SIGN_IN;
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (error) return { ok: false, message: commentErrorMessage(error) };
  refresh();
  return { ok: true };
}

/** Переключатели в профиле: upsert своей строки (нет строки — всё включено). */
export async function saveNotificationPrefs(rawInput: unknown): Promise<ActionResult> {
  const input = typeof rawInput === "object" && rawInput !== null ? (rawInput as Record<string, unknown>) : null;
  if (!input || typeof input.reply !== "boolean" || typeof input.newEpisode !== "boolean") return INVALID;
  if (!getSupabaseEnv()) return UNAVAILABLE;
  const user = await getCurrentUser();
  if (!user) return SIGN_IN;
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ user_id: user.id, reply: input.reply, new_episode: input.newEpisode, updated_at: new Date().toISOString() });
  if (error) return { ok: false, message: commentErrorMessage(error) };
  refresh();
  return { ok: true };
}
