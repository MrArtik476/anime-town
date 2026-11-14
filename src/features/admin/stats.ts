import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { type SiteStats, weekAgo } from "./stats-model";

const EMPTY: SiteStats = { users: null, newUsers: null, published: null, drafts: null, hidden: null, openReports: null, activeBans: null, newComments: null };
const HEAD = { count: "exact", head: true } as const;

/**
 * Числа для сводки: count-запросы (head, без строк) от имени администратора — RLS отдаёт ему все серии,
 * жалобы и баны; служебный ключ и отдельная функция в базе не нужны. Ошибка одного запроса — null в своём поле.
 * Вызывать после requireAdmin(); время читается после createClient() (там connection()) — пререндер не ломается.
 */
export async function getSiteStats(): Promise<SiteStats> {
  if (!getSupabaseEnv()) return EMPTY;
  const supabase = await createClient();
  const nowMs = Date.now();
  const since = weekAgo(nowMs);
  const now = new Date(nowMs).toISOString();
  const value = async (query: PromiseLike<{ count: number | null; error: { code?: string } | null }>, what: string) => {
    const { count, error } = await query;
    if (error) console.error(`[admin] сводка: ${what} не посчитаны`, error.code);
    return error ? null : (count ?? 0);
  };

  const [users, newUsers, published, drafts, hidden, openReports, activeBans, newComments] = await Promise.all([
    value(supabase.from("profiles").select("id", HEAD), "пользователи"),
    value(supabase.from("profiles").select("id", HEAD).gte("created_at", since), "новые пользователи"),
    value(supabase.from("episodes").select("id", HEAD).neq("license_status", "none"), "опубликованные серии"),
    value(supabase.from("episodes").select("id", HEAD).eq("license_status", "none"), "черновики"),
    value(supabase.from("anime_hidden").select("anilist_id", HEAD), "скрытые тайтлы"),
    value(supabase.from("comment_reports").select("id", HEAD).eq("status", "open"), "открытые жалобы"),
    value(supabase.from("user_bans").select("id", HEAD).is("revoked_at", null).or(`expires_at.is.null,expires_at.gt.${now}`), "активные баны"),
    value(supabase.from("comments").select("id", HEAD).gte("created_at", since), "новые комментарии"),
  ]);
  return { users, newUsers, published, drafts, hidden, openReports, activeBans, newComments };
}
