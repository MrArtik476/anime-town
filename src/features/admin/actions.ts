"use server";

import { refresh, updateTag } from "next/cache";

import type { ActionResult } from "@/features/comments/actions";
import { episodesTag } from "@/features/episodes/queries";

import { adminClient, INVALID, isResult } from "./admin-client";
import { adminErrorMessage, type AdminTable, parseAnimeId, parseEpisodeInput, parseRole, parseSubtitleInput } from "./model";

const parseId = (raw: unknown): number | null => (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DbError = { code?: string; message?: string } | null;

function failure(error: DbError, table: AdminTable, what: string): ActionResult {
  if (error?.code !== "23505" && error?.code !== "PT422") console.error(`[admin] ${what}`, error?.code);
  return { ok: false, message: adminErrorMessage(error, table) };
}

/** Публичные списки серий кэшируются по тайтлу — после записи кэш сбрасывается сразу. */
function episodesChanged(animeId: number) {
  updateTag(episodesTag(animeId));
  refresh();
}

/** Создать серию (id = null) или изменить существующую. */
export async function saveEpisode(rawAnimeId: unknown, rawId: unknown, rawInput: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  const id = rawId === null ? null : parseId(rawId);
  if (!animeId || (rawId !== null && !id)) return INVALID;
  const parsed = parseEpisodeInput(rawInput);
  if (!parsed.ok) return parsed;
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;

  const input = parsed.value;
  const row = {
    number: input.number,
    title: input.title,
    duration_sec: input.durationSec,
    license_status: input.licenseStatus,
    hls_url: input.hlsUrl,
    attribution: input.attribution,
    attribution_url: input.attributionUrl,
  };
  if (id === null) {
    const { error } = await supabase.from("episodes").insert({ ...row, anilist_id: animeId });
    if (error) return failure(error, "episodes", "серия не создана");
  } else {
    // anilist_id в условии: серию нельзя изменить через страницу чужого тайтла.
    const { data, error } = await supabase.from("episodes").update(row).eq("id", id).eq("anilist_id", animeId).select("id");
    if (error) return failure(error, "episodes", "серия не изменена");
    if (data.length === 0) return { ok: false, message: "Серия не найдена — обновите страницу" };
  }
  episodesChanged(animeId);
  return { ok: true };
}

/** Удалить серию. Вместе с ней база удаляет её субтитры, прогресс просмотра и комментарии (on delete cascade). */
export async function deleteEpisode(rawAnimeId: unknown, rawId: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  const id = parseId(rawId);
  if (!animeId || !id) return INVALID;
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;
  const { data, error } = await supabase.from("episodes").delete().eq("id", id).eq("anilist_id", animeId).select("id");
  if (error) return failure(error, "episodes", "серия не удалена");
  if (data.length === 0) return { ok: false, message: "Серия не найдена — обновите страницу" };
  episodesChanged(animeId);
  return { ok: true };
}

/** Добавить субтитры к серии (id = null) или изменить. «По умолчанию» у серии одни — остальные сбрасываются. */
export async function saveSubtitle(rawAnimeId: unknown, rawEpisodeId: unknown, rawId: unknown, rawInput: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  const episodeId = parseId(rawEpisodeId);
  const id = rawId === null ? null : parseId(rawId);
  if (!animeId || !episodeId || (rawId !== null && !id)) return INVALID;
  const parsed = parseSubtitleInput(rawInput);
  if (!parsed.ok) return parsed;
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;

  const { data: episode } = await supabase.from("episodes").select("id").eq("id", episodeId).eq("anilist_id", animeId).maybeSingle();
  if (!episode) return { ok: false, message: "Серия не найдена — обновите страницу" };

  const input = parsed.value;
  const row = { lang: input.lang, label: input.label, url: input.url, is_default: input.isDefault };
  let savedId = id;
  if (id === null) {
    const { data, error } = await supabase.from("subtitles").insert({ ...row, episode_id: episodeId }).select("id").single();
    if (error) return failure(error, "subtitles", "субтитры не добавлены");
    savedId = data.id;
  } else {
    const { data, error } = await supabase.from("subtitles").update(row).eq("id", id).eq("episode_id", episodeId).select("id");
    if (error) return failure(error, "subtitles", "субтитры не изменены");
    if (data.length === 0) return { ok: false, message: "Субтитры не найдены — обновите страницу" };
  }
  if (input.isDefault && savedId !== null) {
    const { error } = await supabase.from("subtitles").update({ is_default: false }).eq("episode_id", episodeId).neq("id", savedId).eq("is_default", true);
    if (error) console.error("[admin] прежние субтитры по умолчанию не сброшены", error.code);
  }
  episodesChanged(animeId);
  return { ok: true };
}

export async function deleteSubtitle(rawAnimeId: unknown, rawEpisodeId: unknown, rawId: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  const episodeId = parseId(rawEpisodeId);
  const id = parseId(rawId);
  if (!animeId || !episodeId || !id) return INVALID;
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;
  const { data, error } = await supabase.from("subtitles").delete().eq("id", id).eq("episode_id", episodeId).select("id");
  if (error) return failure(error, "subtitles", "субтитры не удалены");
  if (data.length === 0) return { ok: false, message: "Субтитры не найдены — обновите страницу" };
  episodesChanged(animeId);
  return { ok: true };
}

/**
 * Сменить роль: одна вставка в admin_actions — триггер базы меняет profiles.role и пишет журнал.
 * Свою роль менять нельзя (PT422 own_role).
 */
export async function setUserRole(rawUserId: unknown, rawRole: unknown): Promise<ActionResult> {
  const role = parseRole(rawRole);
  if (typeof rawUserId !== "string" || !UUID.test(rawUserId) || !role) return INVALID;
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;
  const { error } = await supabase.from("admin_actions").insert({ action: "set_role", target_user_id: rawUserId, new_role: role });
  if (error) return failure(error, "admin_actions", "роль не изменена");
  refresh();
  return { ok: true };
}
