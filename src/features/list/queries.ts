import { getCurrentUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";

import { type ListEntry, rowToEntry } from "./model";

const COLUMNS = "anilist_id, status, score, title, cover_url, updated_at";

/** Запись текущего пользователя для тайтла. null — гость (user: null) или тайтла нет в списке. */
export async function getMyListEntry(animeId: number): Promise<{ signedIn: boolean; entry: ListEntry | null }> {
  const user = await getCurrentUser();
  if (!user) return { signedIn: false, entry: null };

  const supabase = await createClient();
  // RLS отдаёт только свои строки; фильтр по user_id — для индекса и явности.
  const { data, error } = await supabase
    .from("anime_list")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .eq("anilist_id", animeId)
    .maybeSingle();
  if (error) console.error("[list] запись не загружена", error.code);
  return { signedIn: true, entry: data ? rowToEntry(data) : null };
}

/** Весь список текущего пользователя, свежие изменения сверху. */
export async function getMyList(): Promise<ListEntry[] | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anime_list")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[list] список не загружен", error.code);
    return [];
  }
  return data.map(rowToEntry);
}
