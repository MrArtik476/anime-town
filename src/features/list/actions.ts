"use server";

import { refresh, updateTag } from "next/cache";

import { getCurrentUser } from "@/features/auth/session";
import { getLocalizedAnimeById } from "@/lib/anilist/api";
import { parseAnimeId } from "@/lib/anime/ids";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { isEmptyInput, type ListEntry, parseListInput, rowToEntry } from "./model";
import { ratingTag } from "./rating";

export type SaveListResult = { ok: true; entry: ListEntry | null } | { ok: false; message: string };

const FAILED = "Не получилось сохранить — попробуйте ещё раз";

/**
 * Статус и оценка тайтла в личном списке. Пусто и там и там — тайтл убирается из списка.
 * Название и обложка берутся на сервере из данных AniList (кэш), а не от клиента.
 */
export async function saveListEntry(rawAnimeId: unknown, rawInput: unknown): Promise<SaveListResult> {
  const animeId = parseAnimeId(String(rawAnimeId));
  const input = parseListInput(rawInput);
  if (!animeId || !input) return { ok: false, message: "Неверные данные" };
  if (!getSupabaseEnv()) return { ok: false, message: "Списки временно недоступны" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Войдите, чтобы вести список" };

  const supabase = await createClient();
  if (isEmptyInput(input)) {
    const { error } = await supabase.from("anime_list").delete().eq("user_id", user.id).eq("anilist_id", animeId);
    if (error) {
      console.error("[list] не удалось убрать из списка", error.code);
      return { ok: false, message: FAILED };
    }
    // Средняя оценка сайта пересчитана триггером — показать её сразу.
    updateTag(ratingTag(animeId));
    refresh();
    return { ok: true, entry: null };
  }

  const anime = await getLocalizedAnimeById(animeId);
  if (!anime.ok) return { ok: false, message: anime.error.code === "NOT_FOUND" ? "Тайтл не найден" : FAILED };

  const { data, error } = await supabase
    .from("anime_list")
    .upsert(
      {
        user_id: user.id,
        anilist_id: animeId,
        status: input.status,
        score: input.score,
        title: anime.data.title.slice(0, 300),
        cover_url: anime.data.coverUrl?.startsWith("https://") ? anime.data.coverUrl : null,
      },
      { onConflict: "user_id,anilist_id" },
    )
    .select("anilist_id, status, score, title, cover_url, updated_at")
    .single();
  if (error || !data) {
    console.error("[list] не удалось сохранить", error?.code);
    return { ok: false, message: FAILED };
  }
  updateTag(ratingTag(animeId));
  refresh();
  return { ok: true, entry: rowToEntry(data) };
}
