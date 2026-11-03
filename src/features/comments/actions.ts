"use server";

import { refresh } from "next/cache";

import { getCurrentProfile, getCurrentUser } from "@/features/auth/session";
import { getLocalizedAnimeById } from "@/lib/anilist/api";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { commentErrorMessage } from "./errors";
import {
  buildReplies,
  type CommentView,
  MAX_BODY,
  parseCommentBody,
  parseCommentTarget,
  parseReportInput,
  replyPlacement,
  snapshotCover,
} from "./model";
import { COLUMNS, resolveEpisodeId } from "./queries";

type ActionError = { ok: false; message: string };
export type ActionResult = { ok: true } | ActionError;
/** Созданный комментарий — чтобы показать его сразу, в том числе в ветке, догруженной «Показать ещё». */
export type CreateResult = { ok: true; comment: CommentView | null } | { ok: false; message: string };
export type EditResult = { ok: true; editedAt: string | null } | { ok: false; message: string };

const INVALID: ActionError = { ok: false, message: "Неверные данные" };
const UNAVAILABLE: ActionError = { ok: false, message: "Комментарии временно недоступны" };
const NOT_ALLOWED: ActionError = { ok: false, message: "Это действие недоступно" };

const parseId = (raw: unknown): number | null => (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null);

/**
 * Новый комментарий или ответ. Права, ветку, флуд-лимит и бан проверяет база (ADR-025);
 * здесь — только форма ввода и снимок тайтла для уведомлений (с сервера, не от клиента).
 */
export async function createComment(rawTarget: unknown, rawInput: unknown): Promise<CreateResult> {
  const target = parseCommentTarget(rawTarget);
  const input = typeof rawInput === "object" && rawInput !== null ? (rawInput as Record<string, unknown>) : null;
  const body = parseCommentBody(input?.body);
  if (!target || !input || typeof input.isSpoiler !== "boolean") return INVALID;
  if (!body) {
    return { ok: false, message: `Напишите от 1 до ${MAX_BODY} символов` };
  }
  const replyToId = input.replyToCommentId === undefined ? undefined : parseId(input.replyToCommentId);
  if (replyToId === null) return INVALID;
  if (!getSupabaseEnv()) return UNAVAILABLE;

  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Войдите, чтобы написать" };

  const episodeId = await resolveEpisodeId(target);
  if (episodeId === null) return { ok: false, message: "Серия не найдена" };

  const supabase = await createClient();
  let placement: ReturnType<typeof replyPlacement> | null = null;
  if (replyToId !== undefined) {
    const { data: replied } = await supabase
      .from("comments")
      .select("id, parent_id, user_id, anilist_id, episode_id, status")
      .eq("id", replyToId)
      .maybeSingle();
    if (!replied || replied.status !== "visible" || replied.anilist_id !== target.animeId || replied.episode_id !== (episodeId ?? null)) {
      return NOT_ALLOWED;
    }
    placement = replyPlacement(replied);
  }

  const anime = await getLocalizedAnimeById(target.animeId);
  const title = anime.ok ? anime.data.title.slice(0, 300) : null;
  const cover = anime.ok ? snapshotCover(anime.data.coverUrl) : null;

  const { data: created, error } = await supabase
    .from("comments")
    .insert({
    anilist_id: target.animeId,
    episode_id: episodeId ?? null,
    parent_id: placement?.parent_id ?? null,
    reply_to_user_id: placement?.reply_to_user_id ?? null,
    body,
    is_spoiler: input.isSpoiler,
    anime_title: title,
    anime_cover_url: cover,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (!["PT429", "PT403", "PT422"].includes(error.code)) console.error("[comments] не сохранён", error.code);
    return { ok: false, message: commentErrorMessage(error) };
  }
  const profile = (await getCurrentProfile())?.profile;
  const [comment] = buildReplies(
    [created],
    profile ? [{ id: profile.id, username: profile.username, display_name: profile.displayName, avatar_url: profile.avatarUrl }] : [],
  );
  refresh();
  return { ok: true, comment: comment ?? null };
}

/** Правка своего видимого комментария: меняется только текст (флажок «Спойлер» — нет). */
export async function editComment(rawId: unknown, rawInput: unknown): Promise<EditResult> {
  const id = parseId(rawId);
  const body = parseCommentBody(typeof rawInput === "object" && rawInput !== null ? (rawInput as { body?: unknown }).body : null);
  if (!id) return INVALID;
  if (!body) return { ok: false, message: `Напишите от 1 до ${MAX_BODY} символов` };
  if (!getSupabaseEnv()) return UNAVAILABLE;
  if (!(await getCurrentUser())) return { ok: false, message: "Войдите, чтобы написать" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("comments").update({ body }).eq("id", id).select("edited_at");
  if (error) return { ok: false, message: commentErrorMessage(error) };
  if (data.length === 0) return NOT_ALLOWED;
  refresh();
  return { ok: true, editedAt: data[0].edited_at };
}

/** Удаление своего комментария — мягкое: база оставляет «Комментарий удалён», если есть ответы. */
export async function deleteComment(rawId: unknown): Promise<ActionResult> {
  const id = parseId(rawId);
  if (!id) return INVALID;
  if (!getSupabaseEnv()) return UNAVAILABLE;
  const user = await getCurrentUser();
  if (!user) return NOT_ALLOWED;

  const supabase = await createClient();
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) return { ok: false, message: commentErrorMessage(error) };
  // DELETE через RLS молча пропускает чужие строки — проверяем, что комментарий действительно удалён.
  const { data } = await supabase.from("comments").select("status").eq("id", id).maybeSingle();
  if (data && data.status !== "deleted") return NOT_ALLOWED;
  refresh();
  return { ok: true };
}

export async function reportComment(rawId: unknown, rawInput: unknown): Promise<ActionResult> {
  const id = parseId(rawId);
  const input = parseReportInput(rawInput);
  if (!id || !input) return INVALID;
  if (!getSupabaseEnv()) return UNAVAILABLE;
  if (!(await getCurrentUser())) return { ok: false, message: "Войдите, чтобы пожаловаться" };

  const supabase = await createClient();
  const { error } = await supabase.from("comment_reports").insert({ comment_id: id, reason: input.reason, details: input.details });
  if (error) return { ok: false, message: commentErrorMessage(error) };
  return { ok: true };
}
