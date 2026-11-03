"use server";

import { refresh } from "next/cache";

import type { ActionResult } from "@/features/comments/actions";
import { getCurrentProfile } from "@/features/auth/session";
import { commentErrorMessage } from "@/features/comments/errors";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import { type BanDuration, parseBanDuration, parseBanReason } from "./model";

type Command = Database["public"]["Tables"]["moderation_actions"]["Insert"];

const INVALID: ActionResult = { ok: false, message: "Неверные данные" };
const FORBIDDEN: ActionResult = { ok: false, message: "Недостаточно прав" };
const UNAVAILABLE: ActionResult = { ok: false, message: "Модерация временно недоступна" };

const parseId = (raw: unknown): number | null => (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Каждое действие — одна вставка в moderation_actions: эффект применяет и журналирует триггер базы,
 * право проверяет RLS (ADR-025). Роль здесь проверяется только ради понятного ответа без запроса.
 */
async function command(row: Command, refreshPage = true): Promise<ActionResult> {
  if (!getSupabaseEnv()) return UNAVAILABLE;
  const role = (await getCurrentProfile())?.profile?.role;
  if (role !== "moderator" && role !== "admin") return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from("moderation_actions").insert(row);
  if (error) {
    if (error.code !== "PT422") console.error("[moderation] действие не выполнено", row.action, error.code);
    return { ok: false, message: commentErrorMessage(error) };
  }
  if (refreshPage) refresh();
  return { ok: true };
}

/** Скрыть видимый комментарий; открытые жалобы на него закрываются. */
export async function hideComment(rawId: unknown): Promise<ActionResult> {
  const id = parseId(rawId);
  return id ? command({ action: "hide", comment_id: id }) : INVALID;
}

export async function restoreComment(rawId: unknown): Promise<ActionResult> {
  const id = parseId(rawId);
  return id ? command({ action: "restore", comment_id: id }) : INVALID;
}

/** Отклонить открытые жалобы: комментарий остаётся как есть. */
export async function dismissReports(rawCommentId: unknown): Promise<ActionResult> {
  const id = parseId(rawCommentId);
  return id ? command({ action: "dismiss_reports", comment_id: id }) : INVALID;
}

/** Бан автора. Срок (expires_at) считает база от своего времени — клиент передаёт только 1d/7d/30d/forever. */
export async function banUser(rawUserId: unknown, rawDuration: unknown, rawReason?: unknown): Promise<ActionResult> {
  const duration: BanDuration | null = parseBanDuration(rawDuration);
  const reason = parseBanReason(rawReason);
  if (typeof rawUserId !== "string" || !UUID.test(rawUserId) || !duration || reason === undefined) return INVALID;
  // Без refresh(): на странице обсуждения бан ничего не меняет, а перерисовка сбросила бы сообщение «… заблокирован»
  // (список комментариев пересоздаётся по свежей первой странице). /moderation обновляется сам — router.refresh().
  return command({ action: "ban", target_user_id: rawUserId, ban_duration: duration, reason }, false);
}

export async function unbanUser(rawUserId: unknown): Promise<ActionResult> {
  if (typeof rawUserId !== "string" || !UUID.test(rawUserId)) return INVALID;
  return command({ action: "unban", target_user_id: rawUserId });
}
