"use server";

import { refresh, updateTag } from "next/cache";

import type { ActionResult } from "@/features/comments/actions";
import { episodesTag } from "@/features/episodes/queries";
import { HIDDEN_TAG } from "@/lib/anime/hidden";
import type { Database } from "@/types/database";

import { adminClient, INVALID, isResult } from "./admin-client";
import { parseAnimeId } from "./model";
import { parseHideReason, parseTitleText, titleErrorMessage } from "./title-model";
import { getTitleState } from "./title-queries";

type Command = Omit<Database["public"]["Tables"]["title_actions"]["Insert"], "anime_title">;
const NO_TITLE: ActionResult = { ok: false, message: "Такого тайтла нет на AniList — проверьте id" };

/**
 * Каждое действие — одна вставка в title_actions: эффект применяет и журналирует триггер базы,
 * право проверяет RLS (ADR-029). После успеха сбрасываются нужные теги кэша — страницы обновляются сразу.
 */
async function command(row: Command, tags: string[]): Promise<ActionResult> {
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;
  // Название — снимок с сервера (клиент его не передаёт): журнал и список скрытых читаются без AniList.
  // Заодно это проверка id: править и скрывать можно только существующий тайтл.
  const state = await getTitleState(row.anilist_id);
  if (!state.exists) return NO_TITLE;
  const { error } = await supabase.from("title_actions").insert({ ...row, anime_title: state.automaticTitle });
  if (error) {
    if (error.code !== "PT422") console.error("[admin] действие над тайтлом не выполнено", row.action, error.code);
    return { ok: false, message: titleErrorMessage(error) };
  }
  for (const tag of tags) updateTag(tag);
  refresh();
  return { ok: true };
}

/**
 * Сохранить ручные название и описание. Пустое поле — вернуть автоматическое значение.
 * Название видно на карточках, поэтому вместе со страницей тайтла сбрасываются главная и каталог.
 */
export async function saveTitleText(rawAnimeId: unknown, rawInput: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  if (!animeId) return INVALID;
  const parsed = parseTitleText(rawInput);
  if (!parsed.ok) return parsed;
  return command(
    { action: "set_text", anilist_id: animeId, title_ru: parsed.value.titleRu, description_ru: parsed.value.descriptionRu },
    [`localization:${animeId}`, "anilist:home", "anilist:catalog"],
  );
}

/** Скрыть тайтл с сайта. Причина — по желанию, остаётся в журнале. */
export async function hideTitle(rawAnimeId: unknown, rawReason?: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  const reason = parseHideReason(rawReason);
  if (!animeId || reason === undefined) return INVALID;
  return command({ action: "hide", anilist_id: animeId, reason }, [HIDDEN_TAG, episodesTag(animeId)]);
}

export async function showTitle(rawAnimeId: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  if (!animeId) return INVALID;
  return command({ action: "show", anilist_id: animeId }, [HIDDEN_TAG, episodesTag(animeId)]);
}
