import { getCurrentUser } from "@/features/auth/session";
import { decodeCursor, encodeCursor } from "@/features/comments/model";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import {
  type Availability,
  commentAvailable,
  type NotificationItem,
  type NotificationPrefs,
  type NotificationRow,
  notificationHref,
  notificationText,
  notificationTitle,
  PAGE_SIZE,
} from "./model";

export type NotificationsPage = { items: NotificationItem[]; nextCursor: string | null; failed: boolean };

const COLUMNS = "id, user_id, type, anilist_id, episode_number, comment_id, actor_id, title, cover_url, created_at, read_at";

/** Число непрочитанных. null — нет сессии или ошибка (колокольчик без бейджа). */
export async function getUnreadCount(): Promise<number | null> {
  if (!getSupabaseEnv()) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) {
    console.error("[notifications] счётчик не загружен", error.code);
    return null;
  }
  return count ?? 0;
}

/**
 * Список от новых к старым (keyset по 20). Доступность целей ссылок — два пакетных запроса на страницу:
 * серии (RLS отдаёт только license_status <> none — условие getEpisode) и комментарии вместе с корнем.
 * Если проверка не удалась, ссылка ведёт на безопасную цель — /anime/{id} без плеера и якоря: ссылка не должна вести на ошибку.
 */
export async function getNotifications(rawCursor: string | null): Promise<NotificationsPage> {
  const empty: NotificationsPage = { items: [], nextCursor: null, failed: false };
  if (!getSupabaseEnv()) return { ...empty, failed: true };
  const user = await getCurrentUser();
  if (!user) return { ...empty, failed: true };

  const supabase = await createClient();
  let query = supabase.from("notifications").select(COLUMNS).eq("user_id", user.id);
  const cursor = decodeCursor(rawCursor);
  if (cursor) {
    query = query.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`);
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error) {
    console.error("[notifications] список не загружен", error.code);
    return { ...empty, failed: true };
  }

  const rows: NotificationRow[] = data.slice(0, PAGE_SIZE);
  const last = rows.at(-1);
  const nextCursor = data.length > PAGE_SIZE && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;
  if (rows.length === 0) return empty;

  // Запрос 1: видимые серии тайтлов страницы.
  const episodes = new Set<string>();
  let episodesOk = true;
  const pairs = [
    ...new Set(
      rows.flatMap((r) =>
      r.episode_number !== null && Number.isSafeInteger(r.anilist_id) && Number.isSafeInteger(r.episode_number)
        ? [`and(anilist_id.eq.${r.anilist_id},number.eq.${r.episode_number})`]
        : [],
      ),
    ),
  ];
  if (pairs.length > 0) {
    const res = await supabase.from("episodes").select("anilist_id, number").neq("license_status", "none").or(pairs.join(","));
    if (res.error) {
      console.error("[notifications] серии не загружены", res.error.code);
      episodesOk = false;
    }
    for (const e of res.data ?? []) episodes.add(`${e.anilist_id}:${e.number}`);
  }

  // Запрос 2: комментарии-цели и их корни (самосоединение; скрытый RLS корень приходит как null).
  const commentIds = [...new Set(rows.flatMap((r) => (r.comment_id === null ? [] : [r.comment_id])))];
  const comments = new Map<number, { parent_id: number | null; status: string; root: { status: string } | null }>();
  let commentsOk = true;
  if (commentIds.length > 0) {
    const res = await supabase
      .from("comments")
      .select("id, parent_id, status, root:parent_id(status)")
      .in("id", commentIds);
    if (res.error) {
      console.error("[notifications] комментарии не загружены", res.error.code);
      commentsOk = false;
    }
    for (const c of res.data ?? []) comments.set(c.id, { parent_id: c.parent_id, status: c.status, root: c.root });
  }

  const actorIds = [...new Set(rows.flatMap((r) => (r.actor_id === null ? [] : [r.actor_id])))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const res = await supabase.from("profiles").select("id, username, display_name").in("id", actorIds);
    for (const p of res.data ?? []) names.set(p.id, p.display_name || p.username);
  }

  const items = rows.map((n): NotificationItem => {
    const availability: Availability = {
      episode:
        n.episode_number === null ? undefined : episodesOk && !(n.comment_id !== null && !commentsOk) && episodes.has(`${n.anilist_id}:${n.episode_number}`),
      comment: n.comment_id === null ? undefined : commentsOk && commentAvailable(comments.get(n.comment_id)),
    };
    return {
      id: n.id,
      type: n.type === "new_episode" ? "new_episode" : "reply",
      text: notificationText(n, n.actor_id ? (names.get(n.actor_id) ?? null) : null),
      title: notificationTitle(n),
      coverUrl: n.cover_url,
      href: notificationHref(n, availability),
      createdAt: n.created_at,
      read: n.read_at !== null,
    };
  });
  return { items, nextCursor, failed: false };
}


/** Настройки для формы в профиле. Нет строки — всё включено (как в триггерах); null — нет сессии или ошибка. */
export async function getNotificationPrefs(): Promise<NotificationPrefs | null> {
  if (!getSupabaseEnv()) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_prefs").select("reply, new_episode").eq("user_id", user.id).maybeSingle();
  if (error) {
    console.error("[notifications] настройки не загружены", error.code);
    return null;
  }
  return { reply: data?.reply ?? true, newEpisode: data?.new_episode ?? true };
}
