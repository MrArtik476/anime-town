import { getCurrentUser } from "@/features/auth/session";
import { getEpisodes } from "@/features/episodes/queries";
import { getHiddenIds } from "@/lib/anime/hidden";
import { createClient } from "@/lib/supabase/server";

import { type ContinueItem, type ProgressRow, selectContinueItems } from "./model";

/** Прогресс текущего пользователя по серии. null — гость или серия не начата. */
export async function getMyEpisodeProgress(
  episodeId: number,
): Promise<{ signedIn: boolean; progress: { position: number; duration: number; completed: boolean } | null }> {
  const user = await getCurrentUser();
  if (!user) return { signedIn: false, progress: null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watch_progress")
    .select("position_sec, duration_sec, completed")
    .eq("user_id", user.id)
    .eq("episode_id", episodeId)
    .maybeSingle();
  if (error) console.error("[progress] не загружен", error.code);
  return {
    signedIn: true,
    progress: data ? { position: data.position_sec, duration: data.duration_sec, completed: !!data.completed } : null,
  };
}

/** «Продолжить просмотр» для текущего пользователя. null — гость. */
export async function getContinueWatching(limit = 8): Promise<ContinueItem[] | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watch_progress")
    .select("anilist_id, episode_number, position_sec, duration_sec, completed, title, cover_url, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(60);
  if (error) {
    console.error("[progress] список не загружен", error.code);
    return [];
  }
  // Скрытые администратором тайтлы смотреть нельзя — в «Продолжить просмотр» они не предлагаются.
  const hidden = new Set(await getHiddenIds());
  const rows: ProgressRow[] = data.filter((row) => !hidden.has(row.anilist_id)).map((row) => ({
    anilistId: row.anilist_id,
    episodeNumber: row.episode_number,
    position: row.position_sec,
    duration: row.duration_sec,
    completed: !!row.completed,
    title: row.title,
    coverUrl: row.cover_url,
    updatedAt: row.updated_at,
  }));
  // Следующие серии — только для досмотренных тайтлов (списки серий кэшируются, без лишних запросов).
  const completedIds = [...new Set(rows.filter((row) => row.completed).map((row) => row.anilistId))];
  const lists = new Map(await Promise.all(completedIds.map(async (id) => [id, await getEpisodes(id)] as const)));
  return selectContinueItems(
    rows,
    (anilistId, number) => lists.get(anilistId)?.find((episode) => episode.number > number)?.number ?? null,
    limit,
  );
}
