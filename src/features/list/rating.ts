import { cacheLife, cacheTag } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";

export type RatingSummary = { average: number; count: number };

export const ratingTag = (animeId: number) => `rating:${animeId}`;

/** Средняя оценка зрителей (сумма и число 1–10, anime_rating_stats). Одна цифра после запятой. */
export function toRatingSummary(row: { score_sum: number; score_count: number } | null): RatingSummary | null {
  if (!row || row.score_count <= 0) return null;
  return { average: Math.round((row.score_sum / row.score_count) * 10) / 10, count: row.score_count };
}

/**
 * Средняя оценка тайтла на сайте. Публичные данные — кэшируются для всех; своя новая оценка видна сразу
 * (saveListEntry вызывает updateTag), чужие — в пределах 5 минут.
 */
export async function getRatingSummary(animeId: number): Promise<RatingSummary | null> {
  "use cache";
  cacheTag(ratingTag(animeId));

  const supabase = createPublicClient();
  const { data, error } = supabase
    ? await supabase.from("anime_rating_stats").select("score_sum, score_count").eq("anilist_id", animeId).maybeSingle()
    : { data: null, error: null };
  if (error) {
    console.error("[rating] не загружена", error.code);
    cacheLife("seconds");
    return null;
  }
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  return toRatingSummary(data);
}
