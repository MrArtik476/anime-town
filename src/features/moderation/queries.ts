import { type CommentRow, decodeCursor, encodeCursor, PAGE_SIZE, profileIds, toView } from "@/features/comments/model";
import { COLUMNS } from "@/features/comments/queries";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { type ActiveBan, commentHref, groupReports, latestExpiry, type ReportGroup } from "./model";

/** Сколько открытых жалоб читается за раз. Группы считаются от старых жалоб, поэтому старые не теряются. */
const REPORTS_LIMIT = 1000;

export type ReportsPage = { items: ReportGroup[]; nextCursor: string | null; failed: boolean };


/**
 * Открытые жалобы, сгруппированные по комментарию, от старых к новым, по 20 групп.
 * Читать могут только модераторы (RLS comment_reports и comments — скрытые тоже).
 * Курсор — первая жалоба последней показанной группы (created_at|comment_id).
 */
export async function getOpenReports(rawCursor: string | null): Promise<ReportsPage> {
  const empty: ReportsPage = { items: [], nextCursor: null, failed: false };
  if (!getSupabaseEnv()) return { ...empty, failed: true };
  const supabase = await createClient();
  const { data: reports, error } = await supabase
    .from("comment_reports")
    .select("id, comment_id, reason, details, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(REPORTS_LIMIT);
  if (error) {
    console.error("[moderation] жалобы не загружены", error.code);
    return { ...empty, failed: true };
  }

  const cursor = decodeCursor(rawCursor);
  const buckets = groupReports(reports)
    .sort((a, b) => a.firstReportedAt.localeCompare(b.firstReportedAt) || a.commentId - b.commentId)
    .filter(
      (bucket) =>
        !cursor ||
        bucket.firstReportedAt > cursor.createdAt ||
        (bucket.firstReportedAt === cursor.createdAt && bucket.commentId > cursor.id),
    );
  const page = buckets.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor = buckets.length > PAGE_SIZE && last ? encodeCursor({ createdAt: last.firstReportedAt, id: last.commentId }) : null;
  if (page.length === 0) return { ...empty, nextCursor };

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select(COLUMNS)
    .in(
      "id",
      page.map((bucket) => bucket.commentId),
    );
  if (commentsError) {
    console.error("[moderation] комментарии не загружены", commentsError.code);
    return { ...empty, failed: true };
  }
  const rows = new Map<number, CommentRow>(comments.map((row) => [row.id, row]));
  const episodeIds = [...new Set(comments.map((row) => row.episode_id).filter((id): id is number => id !== null))];
  const [episodes, profiles] = await Promise.all([
    episodeIds.length > 0 ? supabase.from("episodes").select("id, number").in("id", episodeIds) : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", profileIds(comments)),
  ]);
  const episodeNumbers = new Map((episodes.data ?? []).map((episode) => [episode.id, episode.number]));
  const profileMap = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));

  const items: ReportGroup[] = [];
  for (const bucket of page) {
    const row = rows.get(bucket.commentId);
    if (!row) continue;
    // Серия без прав (license_status = none) не читается — ссылка ведёт на страницу тайтла.
    const episodeNumber = row.episode_id === null ? null : (episodeNumbers.get(row.episode_id) ?? null);
    items.push({
      comment: { ...toView(row, profileMap), href: commentHref(row.anilist_id, episodeNumber, row.id) },
      counts: bucket.counts,
      details: bucket.details,
      firstReportedAt: bucket.firstReportedAt,
    });
  }
  return { items, nextCursor, failed: false };
}

/** Действующие баны: по одной строке на пользователя, новые сверху. */
export async function getActiveBans(): Promise<ActiveBan[]> {
  if (!getSupabaseEnv()) return [];
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("user_bans")
    .select("user_id, reason, expires_at, created_at")
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt."${now}"`)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[moderation] баны не загружены", error.code);
    return [];
  }
  const byUser = new Map<string, typeof data>();
  for (const ban of data) byUser.set(ban.user_id, [...(byUser.get(ban.user_id) ?? []), ban]);
  if (byUser.size === 0) return [];

  const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", [...byUser.keys()]);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));
  return [...byUser.entries()].map(([userId, bans]) => ({
    userId,
    username: names.get(userId) ?? "удалён",
    expiresAt: latestExpiry(bans.map((ban) => ban.expires_at)),
    reason: bans.find((ban) => ban.reason)?.reason ?? null,
  }));
}
