import { cacheLife, cacheTag } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";

/**
 * Скрытые тайтлы (этап 6c, ADR-029): администратор убирает тайтл с сайта, не удаляя данных.
 * Список читается без сессии (таблица anime_hidden открыта на чтение) и кэшируется: его используют главная,
 * каталог, поиск и страница тайтла. Все они помечены тегом HIDDEN_TAG — после скрытия или возврата
 * Server Action сбрасывает один тег, и каждая страница собирается заново.
 */
export const HIDDEN_TAG = "titles:hidden";

/** Скрытых тайтлов мало; предел — защита от случайно разросшейся таблицы. */
const MAX_HIDDEN = 5000;

export async function getHiddenIds(): Promise<number[]> {
  "use cache";
  cacheTag(HIDDEN_TAG);

  const supabase = createPublicClient();
  if (!supabase) {
    cacheLife("minutes");
    return [];
  }
  const { data, error } = await supabase.from("anime_hidden").select("anilist_id").limit(MAX_HIDDEN);
  if (error) {
    // Сбой чтения не должен прятать весь каталог или, наоборот, надолго показывать скрытое — скоро повторим.
    console.error("[titles] список скрытых не загружен", error.code);
    cacheLife("seconds");
    return [];
  }
  cacheLife("hours");
  return data.map((row) => row.anilist_id);
}

export async function isTitleHidden(animeId: number): Promise<boolean> {
  return (await getHiddenIds()).includes(animeId);
}
