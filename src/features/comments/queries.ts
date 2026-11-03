import { getCurrentProfile } from "@/features/auth/session";
import { getEpisode } from "@/features/episodes/queries";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import {
  buildReplies,
  buildThreads,
  type CommentRow,
  type CommentTarget,
  type CommentView,
  decodeCursor,
  encodeCursor,
  PAGE_SIZE,
  profileIds,
  type ProfileRow,
  REPLY_PREVIEW,
} from "./model";

export const COLUMNS =
  "id, user_id, anilist_id, episode_id, parent_id, reply_to_user_id, body, is_spoiler, status, reply_count, anime_title, anime_cover_url, created_at, edited_at";

export type Viewer = {
  userId: string | null;
  username: string | null;
  isModerator: boolean;
  /** Действующий бан: дата окончания (ISO), «forever» или null. */
  bannedUntil: string | null;
};

export type CommentsPage = { comments: CommentView[]; nextCursor: string | null; failed: boolean };
export type RepliesPage = { replies: CommentView[]; nextCursor: string | null; failed: boolean };

const GUEST: Viewer = { userId: null, username: null, isModerator: false, bannedUntil: null };

/** Кто смотрит блок комментариев: вошёл ли, модератор ли, действует ли бан. */
export async function getViewer(): Promise<Viewer> {
  const current = await getCurrentProfile();
  if (!current) return GUEST;
  const role = current.profile?.role ?? "user";
  const supabase = await createClient();
  // RLS отдаёт только свои баны; действующий определяется здесь (строк единицы).
  const { data } = await supabase.from("user_bans").select("expires_at, revoked_at").eq("user_id", current.user.id);
  const now = Date.now();
  const active = (data ?? []).filter((ban) => !ban.revoked_at && (!ban.expires_at || Date.parse(ban.expires_at) > now));
  const bannedUntil = active.some((ban) => !ban.expires_at)
    ? "forever"
    : (active.map((ban) => ban.expires_at as string).sort().at(-1) ?? null);
  return {
    userId: current.user.id,
    username: current.profile?.username ?? null,
    isModerator: role === "moderator" || role === "admin",
    bannedUntil,
  };
}

/** id серии по номеру. undefined — обсуждение тайтла; null — серии нет или нет прав. */
export async function resolveEpisodeId(target: CommentTarget): Promise<number | null | undefined> {
  if (target.episodeNumber === undefined) return undefined;
  const episode = await getEpisode(target.animeId, target.episodeNumber);
  return episode?.id ?? null;
}

async function loadProfiles(rows: CommentRow[]): Promise<ProfileRow[]> {
  const ids = profileIds(rows);
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
  if (error) console.error("[comments] профили не загружены", error.code);
  return data ?? [];
}

/** Корни обсуждения от новых к старым (keyset по 20) с первыми ответами. */
export async function getCommentsPage(target: CommentTarget, rawCursor: string | null): Promise<CommentsPage> {
  const empty: CommentsPage = { comments: [], nextCursor: null, failed: false };
  if (!getSupabaseEnv()) return { ...empty, failed: true };
  const episodeId = await resolveEpisodeId(target);
  if (episodeId === null) return empty;

  const supabase = await createClient();
  let query = supabase.from("comments").select(COLUMNS).eq("anilist_id", target.animeId).is("parent_id", null);
  query = episodeId === undefined ? query.is("episode_id", null) : query.eq("episode_id", episodeId);
  const cursor = decodeCursor(rawCursor);
  if (cursor) {
    query = query.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`);
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error) {
    console.error("[comments] комментарии не загружены", error.code);
    return { ...empty, failed: true };
  }

  const roots = data.slice(0, PAGE_SIZE);
  const last = roots.at(-1);
  const nextCursor = data.length > PAGE_SIZE && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

  const withReplies = roots.filter((root) => root.reply_count > 0).map((root) => root.id);
  let replies: CommentRow[] = [];
  if (withReplies.length > 0) {
    const preview = await supabase.rpc("comment_reply_previews", { root_ids: withReplies, per_root: REPLY_PREVIEW });
    if (preview.error) console.error("[comments] ответы не загружены", preview.error.code);
    replies = preview.data ?? [];
  }
  const profiles = await loadProfiles([...roots, ...replies]);
  return { comments: buildThreads(roots, replies, profiles), nextCursor, failed: false };
}

/** Ответы ветки от старых к новым после курсора (последнего показанного ответа), по 20. */
export async function getReplies(rootId: number, rawCursor: string | null): Promise<RepliesPage> {
  const empty: RepliesPage = { replies: [], nextCursor: null, failed: false };
  if (!getSupabaseEnv()) return { ...empty, failed: true };
  const supabase = await createClient();
  let query = supabase.from("comments").select(COLUMNS).eq("parent_id", rootId).neq("status", "deleted");
  const cursor = decodeCursor(rawCursor);
  if (cursor) {
    query = query.or(`created_at.gt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.gt.${cursor.id})`);
  }
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PAGE_SIZE + 1);
  if (error) {
    console.error("[comments] ответы не загружены", error.code);
    return { ...empty, failed: true };
  }
  const rows = data.slice(0, PAGE_SIZE);
  const last = rows.at(-1);
  const nextCursor = data.length > PAGE_SIZE && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;
  const profiles = await loadProfiles(rows);
  return { replies: buildReplies(rows, profiles), nextCursor, failed: false };
}
