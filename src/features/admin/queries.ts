import { isLicenseStatus, type LicenseStatus } from "@/features/player/source";
import { readLocalizations } from "@/lib/localization/service";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { parseRole, type Role, summarizeTitles, type TitleSummary } from "./model";

/**
 * Чтение для админ-панели. Всё без кэша и от имени вошедшего пользователя: черновики серий (license_status = none)
 * и журнал отдаёт только RLS администратору (миграция admin), остальным придут пустые списки.
 */

export type AdminTitle = TitleSummary & { name: string };
export type AdminSubtitle = { id: number; lang: string; label: string; url: string; isDefault: boolean };
export type AdminEpisode = {
  id: number;
  number: number;
  title: string | null;
  durationSec: number | null;
  licenseStatus: LicenseStatus;
  hlsUrl: string;
  attribution: string | null;
  attributionUrl: string | null;
  subtitles: AdminSubtitle[];
};
export type AdminUser = { id: string; username: string; role: Role; createdAt: string };
export type RoleChange = {
  id: number;
  admin: string;
  target: string;
  oldRole: Role | null;
  newRole: Role | null;
  createdAt: string;
};

export type Listing<T> = { items: T[]; failed: boolean };
const failed = <T,>(): Listing<T> => ({ items: [], failed: true });

export const fallbackTitleName = (animeId: number) => `Тайтл AniList #${animeId}`;

/** Русское название из хранилища переводов (без запроса к AniList); нет — «Тайтл AniList #id». */
export async function getTitleName(animeId: number): Promise<string> {
  const { records } = await readLocalizations([animeId]);
  return records.get(animeId)?.titleRu ?? fallbackTitleName(animeId);
}

/** Тайтлы, у которых есть серии: всего и опубликовано. */
export async function getAdminTitles(): Promise<Listing<AdminTitle>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  const { data, error } = await supabase.from("episodes").select("anilist_id, license_status").order("anilist_id").limit(5000);
  if (error) {
    console.error("[admin] тайтлы не загружены", error.code);
    return failed();
  }
  const titles = summarizeTitles(data);
  const { records } = titles.length ? await readLocalizations(titles.map((title) => title.animeId)) : { records: new Map() };
  return {
    items: titles.map((title) => ({ ...title, name: records.get(title.animeId)?.titleRu ?? fallbackTitleName(title.animeId) })),
    failed: false,
  };
}

/** Все серии тайтла (включая черновики) с субтитрами, по номеру. */
export async function getAdminEpisodes(animeId: number): Promise<Listing<AdminEpisode>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("episodes")
    .select("id, number, title, duration_sec, license_status, hls_url, attribution, attribution_url")
    .eq("anilist_id", animeId)
    .order("number")
    .limit(2000);
  if (error) {
    console.error("[admin] серии не загружены", error.code);
    return failed();
  }
  if (rows.length === 0) return { items: [], failed: false };

  const { data: subs, error: subsError } = await supabase
    .from("subtitles")
    .select("id, episode_id, lang, label, url, is_default")
    .in(
      "episode_id",
      rows.map((row) => row.id),
    )
    .order("lang");
  if (subsError) {
    console.error("[admin] субтитры не загружены", subsError.code);
    return failed();
  }
  const byEpisode = new Map<number, AdminSubtitle[]>();
  for (const sub of subs) {
    const list = byEpisode.get(sub.episode_id) ?? [];
    list.push({ id: sub.id, lang: sub.lang, label: sub.label, url: sub.url, isDefault: sub.is_default });
    byEpisode.set(sub.episode_id, list);
  }
  return {
    items: rows.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      durationSec: row.duration_sec,
      licenseStatus: isLicenseStatus(row.license_status) ? row.license_status : "none",
      hlsUrl: row.hls_url,
      attribution: row.attribution,
      attributionUrl: row.attribution_url,
      subtitles: byEpisode.get(row.id) ?? [],
    })),
    failed: false,
  };
}

type ProfileRow = { id: string; username: string; role: string; created_at: string };
const toUser = (row: ProfileRow): AdminUser => ({
  id: row.id,
  username: row.username,
  role: parseRole(row.role) ?? "user",
  createdAt: row.created_at,
});

/** Поиск по нику: pattern — готовый шаблон ilike из userSearchPattern. */
export async function searchUsers(pattern: string): Promise<Listing<AdminUser>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role, created_at")
    .ilike("username", pattern)
    .order("username")
    .limit(20);
  if (error) {
    console.error("[admin] поиск пользователей не выполнен", error.code);
    return failed();
  }
  return { items: data.map(toUser), failed: false };
}

/** Модераторы и администраторы. */
export async function getStaff(): Promise<Listing<AdminUser>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role, created_at")
    .in("role", ["moderator", "admin"])
    .order("role")
    .order("username")
    .limit(200);
  if (error) {
    console.error("[admin] команда не загружена", error.code);
    return failed();
  }
  return { items: data.map(toUser), failed: false };
}

/** Последние 20 смен ролей из журнала admin_actions. */
export async function getRoleLog(): Promise<Listing<RoleChange>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_actions")
    .select("id, admin_id, target_user_id, old_role, new_role, created_at")
    .eq("action", "set_role")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[admin] журнал не загружен", error.code);
    return failed();
  }
  const ids = [...new Set(data.flatMap((row) => [row.admin_id, row.target_user_id]).filter((id): id is string => id !== null))];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, username").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));
  const name = (id: string | null) => (id && names.get(id)) || "удалён";
  return {
    items: data.map((row) => ({
      id: row.id,
      admin: name(row.admin_id),
      target: name(row.target_user_id),
      oldRole: parseRole(row.old_role),
      newRole: parseRole(row.new_role),
      createdAt: row.created_at,
    })),
    failed: false,
  };
}
