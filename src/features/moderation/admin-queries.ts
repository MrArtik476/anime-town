import { decodeCursor, encodeCursor, PAGE_SIZE, type ReportReason, REPORT_REASONS } from "@/features/comments/model";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import {
  type BanFilter,
  type BanState,
  banState,
  exactNickPattern,
  type LogFilters,
  type ModAction,
  parseModAction,
  parseReportStatus,
  type ReportStatus,
} from "./admin-model";
import { type BanDuration, commentHref, parseBanDuration } from "./model";

/**
 * Чтение для раздела «Модерация» админ-панели (ADR-028). Всё без кэша и от имени вошедшего пользователя:
 * журнал, чужие жалобы и чужие баны отдаёт RLS (private.is_moderator() включает администратора).
 * Страницы — по 20 строк от новых к старым; курсор — created_at и id последней показанной строки.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AdminPage<T> = {
  items: T[];
  nextCursor: string | null;
  failed: boolean;
  /** Ник из фильтра, которого нет среди пользователей: список пуст, запрос данных не выполнялся. */
  unknownUser?: string;
};

export type LogEntry = {
  id: number;
  action: ModAction;
  moderator: string;
  target: string;
  commentHref: string | null;
  banDuration: BanDuration | null;
  reason: string | null;
  createdAt: string;
};

export type ReportEntry = {
  id: number;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reporter: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  /** null — комментарий удалён автором (текст стёрт) или его строки уже нет. */
  commentBody: string | null;
  commentAuthor: string;
  commentHref: string | null;
};

export type BanEntry = {
  id: number;
  userId: string;
  username: string;
  moderator: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  state: BanState;
};

const DELETED = "удалён";
const failed = <T>(): AdminPage<T> => ({
  items: [],
  nextCursor: null,
  failed: true,
});
const empty = <T>(): AdminPage<T> => ({
  items: [],
  nextCursor: null,
  failed: false,
});

/** Условие «строго старше курсора» для сортировки created_at desc, id desc. */
function olderThan(rawCursor: string | null): string | null {
  const cursor = decodeCursor(rawCursor);
  return cursor ? `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})` : null;
}

/** Прочитана 21 строка: первые 20 — страница, наличие 21-й — курсор на следующую. */
function cut<Row extends { id: number; created_at: string }>(rows: Row[]): { rows: Row[]; nextCursor: string | null } {
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

/** Ники всех упомянутых на странице пользователей — одним запросом. */
async function readNames(supabase: Supabase, ids: (string | null)[]): Promise<(id: string | null) => string> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  const { data } = unique.length ? await supabase.from("profiles").select("id, username").in("id", unique) : { data: [] };
  const names = new Map((data ?? []).map((profile) => [profile.id, profile.username]));
  return (id) => (id && names.get(id)) || DELETED;
}

type CommentRef = { id: number; anilist_id: number; episode_id: number | null };

/** Ссылки на комментарии: номер серии читается отдельно; серия без прав или удалённая — ссылка на страницу тайтла. */
async function readCommentHrefs(supabase: Supabase, comments: CommentRef[]): Promise<Map<number, string>> {
  const episodeIds = [...new Set(comments.map((comment) => comment.episode_id).filter((id): id is number => id !== null))];
  const { data } = episodeIds.length ? await supabase.from("episodes").select("id, number").in("id", episodeIds) : { data: [] };
  const numbers = new Map((data ?? []).map((episode) => [episode.id, episode.number]));
  return new Map(
    comments.map((comment) => [
      comment.id,
      commentHref(comment.anilist_id, comment.episode_id === null ? null : (numbers.get(comment.episode_id) ?? null), comment.id),
    ]),
  );
}

/** id пользователя по точному нику без учёта регистра; undefined — такого нет. */
async function findUserId(supabase: Supabase, nick: string): Promise<string | undefined> {
  const { data } = await supabase.from("profiles").select("id, username").ilike("username", exactNickPattern(nick)).limit(1);
  return data?.[0]?.id;
}

/** Журнал действий модераторов с фильтрами: кто, что, над кем, когда, причина. */
export async function getModerationLog(filters: LogFilters, rawCursor: string | null): Promise<AdminPage<LogEntry>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();

  // Ник, которого нет, — это пустой список, а не «без фильтра»: иначе опечатка показала бы весь журнал.
  let moderatorId: string | undefined;
  let targetId: string | undefined;
  if (filters.moderator) {
    moderatorId = await findUserId(supabase, filters.moderator);
    if (!moderatorId) return { ...empty(), unknownUser: filters.moderator };
  }
  if (filters.target) {
    targetId = await findUserId(supabase, filters.target);
    if (!targetId) return { ...empty(), unknownUser: filters.target };
  }

  let query = supabase.from("moderation_actions").select("id, action, moderator_id, target_user_id, comment_id, ban_duration, reason, created_at");
  if (moderatorId) query = query.eq("moderator_id", moderatorId);
  if (targetId) query = query.eq("target_user_id", targetId);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lt("created_at", filters.to);
  const older = olderThan(rawCursor);
  if (older) query = query.or(older);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error) {
    console.error("[admin] журнал модерации не загружен", error.code);
    return failed();
  }
  const { rows, nextCursor } = cut(data);
  if (rows.length === 0) return empty();

  const commentIds = [...new Set(rows.map((row) => row.comment_id).filter((id): id is number => id !== null))];
  const [name, comments] = await Promise.all([
    readNames(
      supabase,
      rows.flatMap((row) => [row.moderator_id, row.target_user_id]),
    ),
    commentIds.length ? supabase.from("comments").select("id, anilist_id, episode_id").in("id", commentIds) : Promise.resolve({ data: [] }),
  ]);
  const hrefs = await readCommentHrefs(supabase, comments.data ?? []);

  const items: LogEntry[] = [];
  for (const row of rows) {
    const action = parseModAction(row.action);
    if (!action) continue;
    items.push({
      id: row.id,
      action,
      moderator: name(row.moderator_id),
      target: name(row.target_user_id),
      commentHref: row.comment_id === null ? null : (hrefs.get(row.comment_id) ?? null),
      banDuration: parseBanDuration(row.ban_duration),
      reason: row.reason,
      createdAt: row.created_at,
    });
  }
  return { items, nextCursor, failed: false };
}

/** Все жалобы, включая закрытые: исход, кто и когда закрыл. status null — без фильтра. */
export async function getAllReports(status: ReportStatus | null, rawCursor: string | null): Promise<AdminPage<ReportEntry>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  let query = supabase.from("comment_reports").select("id, comment_id, reporter_id, reason, details, status, resolved_by, resolved_at, created_at");
  if (status) query = query.eq("status", status);
  const older = olderThan(rawCursor);
  if (older) query = query.or(older);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error) {
    console.error("[admin] жалобы не загружены", error.code);
    return failed();
  }
  const { rows, nextCursor } = cut(data);
  if (rows.length === 0) return empty();

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select("id, anilist_id, episode_id, user_id, body, status")
    .in("id", [...new Set(rows.map((row) => row.comment_id))]);
  if (commentsError) {
    console.error("[admin] комментарии жалоб не загружены", commentsError.code);
    return failed();
  }
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const [name, hrefs] = await Promise.all([
    readNames(supabase, [...rows.flatMap((row) => [row.reporter_id, row.resolved_by]), ...comments.map((comment) => comment.user_id)]),
    readCommentHrefs(supabase, comments),
  ]);

  const items: ReportEntry[] = [];
  for (const row of rows) {
    const reportStatus = parseReportStatus(row.status);
    const reason = REPORT_REASONS.find((value) => value === row.reason);
    if (!reportStatus || !reason) continue;
    const comment = byId.get(row.comment_id);
    items.push({
      id: row.id,
      reason,
      details: row.details,
      status: reportStatus,
      reporter: name(row.reporter_id),
      resolvedBy: row.resolved_by ? name(row.resolved_by) : null,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      commentBody: comment?.body ?? null,
      commentAuthor: name(comment?.user_id ?? null),
      commentHref: hrefs.get(row.comment_id) ?? null,
    });
  }
  return { items, nextCursor, failed: false };
}

/**
 * Все баны: действующие, истёкшие и снятые. now — время запроса: его передаёт страница после проверки роли
 * (обращение к часам при пререндере ломает сборку, Ошибки 12 и 34).
 */
export async function getAllBans(filter: BanFilter, rawCursor: string | null, now: Date): Promise<AdminPage<BanEntry>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  const nowIso = now.toISOString();
  let query = supabase.from("user_bans").select("id, user_id, moderator_id, reason, expires_at, revoked_at, revoked_by, created_at");
  if (filter === "active") query = query.is("revoked_at", null).or(`expires_at.is.null,expires_at.gt."${nowIso}"`);
  if (filter === "ended") query = query.or(`revoked_at.not.is.null,expires_at.lte."${nowIso}"`);
  // Второй or() PostgREST объединяет с первым через «и».
  const older = olderThan(rawCursor);
  if (older) query = query.or(older);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error) {
    console.error("[admin] баны не загружены", error.code);
    return failed();
  }
  const { rows, nextCursor } = cut(data);
  if (rows.length === 0) return empty();

  const name = await readNames(
    supabase,
    rows.flatMap((row) => [row.user_id, row.moderator_id, row.revoked_by]),
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: name(row.user_id),
      moderator: name(row.moderator_id),
      reason: row.reason,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      revokedBy: row.revoked_by ? name(row.revoked_by) : null,
      state: banState(row, now.getTime()),
    })),
    nextCursor,
    failed: false,
  };
}
