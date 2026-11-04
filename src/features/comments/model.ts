/** Комментарии: проверка ввода, курсор keyset, сборка веток (ADR-025). Общий код сервера и клиента. */
import type { Database } from "@/types/database";

export const MAX_BODY = 2000;
export const PAGE_SIZE = 20;
export const REPLY_PREVIEW = 3;

export type CommentRow = Database["public"]["Tables"]["comments"]["Row"];
export type ProfileRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "username" | "display_name" | "avatar_url">;

export type CommentAuthor = { id: string; username: string; displayName: string | null; avatarUrl: string | null };

export type CommentView = {
  id: number;
  parentId: number | null;
  author: CommentAuthor | null;
  replyTo: { id: string; username: string } | null;
  body: string | null;
  isSpoiler: boolean;
  status: "visible" | "hidden" | "deleted";
  replyCount: number;
  createdAt: string;
  editedAt: string | null;
  replies: CommentView[];
};

const COVER_PREFIX = /^https:\/\/s4\.anilist\.co\/file\/anilistcdn\//;

/** Обложка для снимка — по тем же правилам, что check в базе (comments.anime_cover_url), иначе null. */
export function snapshotCover(url: string | null | undefined): string | null {
  return url && url.length <= 500 && COVER_PREFIX.test(url) ? url : null;
}

/** Обсуждение тайтла (без серии) или серии. */
export type CommentTarget = { animeId: number; episodeNumber?: number };

/**
 * Текст от клиента: обрезка пробелов, \r\n → \n, не больше трёх переводов строки подряд, 1–2000 символов.
 * null — пусто, слишком длинно или не строка.
 */
export function parseCommentBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (body.length === 0 || body.length > MAX_BODY) return null;
  return body;
}

type Cursor = { createdAt: string; id: number };

/** created_at из PostgREST: «2026-11-03T10:00:00.123456+00:00» (или с Z). Date.parse пропускает и «1 Nov 2026». */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

// Курсор — только ASCII (дата ISO и число), поэтому хватает btoa/atob: модуль работает и в браузере.
export function encodeCursor(cursor: Cursor): string {
  return btoa(`${cursor.createdAt}|${cursor.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** null — нет курсора или он испорчен (данные от клиента). */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  let decoded: string;
  try {
    decoded = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const separator = decoded.lastIndexOf("|");
  if (separator <= 0) return null;
  const createdAt = decoded.slice(0, separator);
  const id = Number(decoded.slice(separator + 1));
  if (!Number.isSafeInteger(id) || id <= 0 || !ISO_TIMESTAMP.test(createdAt) || Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}

const STATUSES = ["visible", "hidden", "deleted"] as const;

/** Строка базы → вид для UI (без фильтров по статусу). */
export function toView(row: CommentRow, profiles: Map<string, ProfileRow>): CommentView {
  const author = profiles.get(row.user_id);
  const replyTo = row.reply_to_user_id ? profiles.get(row.reply_to_user_id) : undefined;
  return {
    id: row.id,
    parentId: row.parent_id,
    author: author
      ? { id: author.id, username: author.username, displayName: author.display_name, avatarUrl: author.avatar_url }
      : null,
    replyTo: replyTo ? { id: replyTo.id, username: replyTo.username } : null,
    // Текст удалённого база уже стёрла; на всякий случай не показываем его и здесь.
    body: row.status === "deleted" ? null : row.body,
    isSpoiler: row.is_spoiler,
    status: STATUSES.find((status) => status === row.status) ?? "visible",
    replyCount: row.reply_count,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    replies: [],
  };
}

/**
 * Корни с ответами. Удалённый корень с ответами — «Комментарий удалён»; без ответов его уже отсёк запрос
 * (getCommentsPage), поэтому здесь корни не фильтруются.
 */
export function buildThreads(roots: CommentRow[], replies: CommentRow[], profileRows: ProfileRow[]): CommentView[] {
  const profiles = new Map(profileRows.map((profile) => [profile.id, profile]));
  const threads = roots.map((root) => toView(root, profiles));
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  for (const reply of replies) {
    if (reply.status === "deleted" || reply.parent_id === null) continue;
    byId.get(reply.parent_id)?.replies.push(toView(reply, profiles));
  }
  return threads;
}

/** Ответы без корня (догрузка «Показать ещё»). */
export function buildReplies(replies: CommentRow[], profileRows: ProfileRow[]): CommentView[] {
  const profiles = new Map(profileRows.map((profile) => [profile.id, profile]));
  return replies.filter((reply) => reply.status !== "deleted").map((reply) => toView(reply, profiles));
}

/**
 * Куда ложится ответ: ветки в один уровень, поэтому ответ на ответ уходит в корень ветки,
 * а «@ник» указывает автора ответа. Ответ прямо на корень — без «@».
 */
export function replyPlacement(target: Pick<CommentRow, "id" | "parent_id" | "user_id">): {
  parent_id: number;
  reply_to_user_id: string | null;
} {
  return target.parent_id === null
    ? { parent_id: target.id, reply_to_user_id: null }
    : { parent_id: target.parent_id, reply_to_user_id: target.user_id };
}

export const REPORT_REASONS = ["spam", "offensive", "spoiler", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Спам или реклама",
  offensive: "Оскорбления",
  spoiler: "Спойлер без пометки",
  other: "Другое",
};

/** Жалоба от клиента. null — неверные данные. */
export function parseReportInput(raw: unknown): { reason: ReportReason; details: string | null } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { reason, details } = raw as Record<string, unknown>;
  if (!REPORT_REASONS.some((known) => known === reason)) return null;
  if (details !== undefined && details !== null && typeof details !== "string") return null;
  const text = typeof details === "string" ? details.trim() : "";
  if (text.length > 500) return null;
  return { reason: reason as ReportReason, details: text || null };
}

/** Обсуждение от клиента. null — неверные данные. */
export function parseCommentTarget(raw: unknown): CommentTarget | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { animeId, episodeNumber } = raw as Record<string, unknown>;
  if (typeof animeId !== "number" || !Number.isSafeInteger(animeId) || animeId <= 0) return null;
  if (episodeNumber === undefined) return { animeId };
  if (typeof episodeNumber !== "number" || !Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 10_000) {
    return null;
  }
  return { animeId, episodeNumber };
}

/** id всех авторов и адресатов «@ник» — для одного запроса profiles. */
export function profileIds(rows: CommentRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.user_id);
    if (row.reply_to_user_id) ids.add(row.reply_to_user_id);
  }
  return [...ids];
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Minsk",
});

/** «5 минут назад» до суток, дальше — дата. Время сервера и браузера может разойтись — без предупреждения гидратации. */
export function formatWhen(iso: string): string {
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  const relative = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
  if (diff < 60) return "только что";
  if (diff < 3600) return relative.format(-Math.floor(diff / 60), "minute");
  if (diff < 86_400) return relative.format(-Math.floor(diff / 3600), "hour");
  return dateFormat.format(Date.parse(iso));
}
