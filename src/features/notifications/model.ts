import type { Database } from "@/types/database";

export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

/** Что известно о доступности цели ссылки; по умолчанию всё доступно. */
export type Availability = { episode?: boolean; comment?: boolean };

/** Готовая строка списка: ссылка уже учитывает скрытые комментарии и недоступные серии. */
export type NotificationItem = {
  id: number;
  type: "reply" | "new_episode";
  text: string;
  /** «Аниме №{id}», если снимка тайтла нет. */
  title: string;
  coverUrl: string | null;
  href: string;
  createdAt: string;
  read: boolean;
};

export const PAGE_SIZE = 20;

/** Бейдж колокольчика: 0 — без бейджа, от 10 — «9+». */
export function badgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(Math.floor(count));
}

export function notificationText(n: NotificationRow, actorName: string | null): string {
  if (n.type === "new_episode") return `Вышла серия ${n.episode_number ?? ""}`.trim();
  return `${actorName ?? "Пользователь"} ответил(а) на ваш комментарий`;
}

export function notificationTitle(n: Pick<NotificationRow, "title" | "anilist_id">): string {
  return n.title?.trim() || `Аниме №${n.anilist_id}`;
}

/**
 * Куда ведёт уведомление. Недоступная серия → страница тайтла; недоступный комментарий (ответ или его
 * корень скрыт/удалён) → тайтл или серия без якоря. Доступность определяет getNotifications при выдаче.
 */
export function notificationHref(n: NotificationRow, availability: Availability = {}): string {
  const base = `/anime/${n.anilist_id}`;
  const hasEpisode = n.episode_number !== null && availability.episode !== false;
  const page = hasEpisode ? `${base}/watch/${n.episode_number}` : base;
  if (n.type === "new_episode") return page;
  if (n.comment_id === null || availability.comment === false || (n.episode_number !== null && !hasEpisode)) return page;
  return `${page}#comment-${n.comment_id}`;
}

/** Комментарий-цель доступен, только если виден он сам и его корень (root: null — корень не найден или скрыт RLS). */
export function commentAvailable(
  comment: { parent_id: number | null; status: string; root: { status: string } | null } | undefined,
): boolean {
  if (!comment || comment.status !== "visible") return false;
  return comment.parent_id === null || comment.root?.status === "visible";
}
