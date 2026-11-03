/** Модерация: сроки бана, причина, ссылки на комментарии, группировка жалоб (ADR-025). Общий код сервера и клиента. */
import type { CommentView, ReportReason } from "@/features/comments/model";

export const BAN_DURATIONS = ["1d", "7d", "30d", "forever"] as const;
export type BanDuration = (typeof BAN_DURATIONS)[number];
export const BAN_DURATION_LABELS: Record<BanDuration, string> = {
  "1d": "1 день",
  "7d": "7 дней",
  "30d": "30 дней",
  forever: "Навсегда",
};

export const MAX_REASON = 500;

export function parseBanDuration(raw: unknown): BanDuration | null {
  return BAN_DURATIONS.find((duration) => duration === raw) ?? null;
}

/** Причина бана: необязательна, обрезка пробелов, ≤ 500. undefined — неверные данные, null — без причины. */
export function parseBanReason(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const reason = raw.trim();
  if (reason.length > MAX_REASON) return undefined;
  return reason || null;
}

/** Ссылка на комментарий: страница тайтла или серии с якорем. */
export function commentHref(animeId: number, episodeNumber: number | null, commentId: number): string {
  const page = episodeNumber === null ? `/anime/${animeId}` : `/anime/${animeId}/watch/${episodeNumber}`;
  return `${page}#comment-${commentId}`;
}

export type ReportCounts = Record<ReportReason, number>;

export type ReportGroup = {
  comment: CommentView & { href: string };
  counts: ReportCounts;
  details: string[];
  firstReportedAt: string;
};

export type OpenReportRow = { id: number; comment_id: number; reason: string; details: string | null; created_at: string };

export type ReportBucket = { commentId: number; counts: ReportCounts; details: string[]; firstReportedAt: string };

/** Открытые жалобы (от старых к новым) → по одной группе на комментарий, в порядке первой жалобы. */
export function groupReports(rows: OpenReportRow[]): ReportBucket[] {
  const groups = new Map<number, ReportBucket>();
  for (const row of rows) {
    let group = groups.get(row.comment_id);
    if (!group) {
      group = { commentId: row.comment_id, counts: { spam: 0, offensive: 0, spoiler: 0, other: 0 }, details: [], firstReportedAt: row.created_at };
      groups.set(row.comment_id, group);
    }
    if (row.reason in group.counts) group.counts[row.reason as ReportReason] += 1;
    if (row.details) group.details.push(row.details);
  }
  return [...groups.values()];
}

/** Действующий бан (строки user_bans одного пользователя): «forever» важнее даты, иначе самая поздняя дата. */
export function latestExpiry(expiries: (string | null)[]): string | null {
  if (expiries.some((expiry) => expiry === null)) return null;
  return (expiries as string[]).sort().at(-1) ?? null;
}

/** Действующий бан для /moderation: expiresAt null — навсегда. */
export type ActiveBan = { userId: string; username: string; expiresAt: string | null; reason: string | null };
