import { getAnimeById } from "@/lib/anilist/api";
import { resolveTitles } from "@/lib/localization/resolve";
import { localizeDescription, readLocalizations } from "@/lib/localization/service";
import type { LocalizationRecord } from "@/lib/localization/types";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { fallbackTitleName, type Listing } from "./queries";
import { describeTitleAction } from "./title-model";

/**
 * Чтение для раздела «Тайтлы» админ-панели (ADR-029). Без кэша и от имени вошедшего пользователя:
 * журнал title_actions отдаёт только RLS администратору.
 */

const failed = <T,>(): Listing<T> => ({ items: [], failed: true });

/** Название для админки: ручное → автоматическое русское → «Тайтл AniList #id». */
const recordName = (animeId: number, record: LocalizationRecord | undefined, snapshot?: string | null) =>
  record?.manualTitleRu ?? record?.titleRu ?? snapshot ?? fallbackTitleName(animeId);

export type TitleState = {
  animeId: number;
  /** false — такого тайтла на AniList нет (или он 18+): править и скрывать нечего. */
  exists: boolean;
  /** AniList не ответил: автоматические значения неизвестны, но править и скрывать можно. */
  degraded: boolean;
  name: string;
  manualTitleRu: string | null;
  manualDescriptionRu: string | null;
  /** Что сайт показывал бы без ручной правки. */
  automaticTitle: string | null;
  automaticDescription: string | null;
  automaticSource: string | null;
  hidden: boolean;
};

/** Текущее состояние тайтла: ручной и автоматический текст, скрыт ли. */
export async function getTitleState(animeId: number): Promise<TitleState> {
  const supabase = getSupabaseEnv() ? await createClient() : null;
  const [anime, stored, hiddenRow] = await Promise.all([
    getAnimeById(animeId),
    readLocalizations([animeId]),
    supabase ? supabase.from("anime_hidden").select("anilist_id").eq("anilist_id", animeId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const record = stored.records.get(animeId);
  const base: TitleState = {
    animeId,
    exists: true,
    degraded: false,
    name: recordName(animeId, record),
    manualTitleRu: record?.manualTitleRu ?? null,
    manualDescriptionRu: record?.manualDescriptionRu ?? null,
    automaticTitle: record?.titleRu ?? null,
    automaticDescription: null,
    automaticSource: null,
    hidden: !!hiddenRow.data,
  };
  if (!anime.ok) return anime.error.code === "NOT_FOUND" ? { ...base, exists: false } : { ...base, degraded: true };

  // «Автоматическое» — то, что вышло бы без ручных полей: так администратор видит, к чему вернётся текст.
  const automatic = record ? { ...record, manualTitleRu: null, manualDescriptionRu: null } : undefined;
  const title = resolveTitles(anime.data, automatic).title;
  const description = localizeDescription(anime.data.description, automatic);
  const source =
    description?.source === "shikimori"
      ? "Shikimori"
      : description?.source === "machine"
        ? `машинный перевод${description.translator ? ` (${description.translator})` : ""}`
        : description?.source === "anilist"
          ? "AniList, на английском"
          : null;
  return {
    ...base,
    name: record?.manualTitleRu ?? title,
    automaticTitle: title,
    automaticDescription: description?.text ?? null,
    automaticSource: source,
  };
}

export type TitleRef = { animeId: number; name: string; at: string };

/** Скрытые тайтлы, свежие сверху. */
export async function getHiddenTitles(): Promise<Listing<TitleRef>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  const { data, error } = await supabase.from("anime_hidden").select("anilist_id, title, created_at").order("created_at", { ascending: false }).limit(200);
  if (error) {
    console.error("[admin] скрытые тайтлы не загружены", error.code);
    return failed();
  }
  const { records } = data.length ? await readLocalizations(data.map((row) => row.anilist_id)) : { records: new Map<number, LocalizationRecord>() };
  return {
    items: data.map((row) => ({ animeId: row.anilist_id, name: recordName(row.anilist_id, records.get(row.anilist_id), row.title), at: row.created_at })),
    failed: false,
  };
}

export type EditedTitle = TitleRef & { title: boolean; description: boolean };

/** Тайтлы с ручным названием или описанием, свежие правки сверху. */
export async function getEditedTitles(): Promise<Listing<EditedTitle>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anime_localizations")
    .select("anilist_id, title_ru, manual_title_ru, manual_description_ru, updated_at")
    .or("manual_title_ru.not.is.null,manual_description_ru.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[admin] изменённые тайтлы не загружены", error.code);
    return failed();
  }
  return {
    items: data.map((row) => ({
      animeId: row.anilist_id,
      name: row.manual_title_ru ?? row.title_ru ?? fallbackTitleName(row.anilist_id),
      at: row.updated_at,
      title: row.manual_title_ru !== null,
      description: row.manual_description_ru !== null,
    })),
    failed: false,
  };
}

export type TitleLogEntry = { id: number; animeId: number; name: string; what: string; reason: string | null; admin: string; createdAt: string };

/** Последние 20 действий над тайтлами; animeId — только по одному тайтлу. */
export async function getTitleLog(animeId?: number): Promise<Listing<TitleLogEntry>> {
  if (!getSupabaseEnv()) return failed();
  const supabase = await createClient();
  let query = supabase.from("title_actions").select("id, admin_id, action, anilist_id, anime_title, title_ru, description_ru, reason, created_at");
  if (animeId) query = query.eq("anilist_id", animeId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[admin] журнал тайтлов не загружен", error.code);
    return failed();
  }
  if (data.length === 0) return { items: [], failed: false };
  const adminIds = [...new Set(data.map((row) => row.admin_id).filter((id): id is string => id !== null))];
  const [profiles, stored] = await Promise.all([
    adminIds.length ? supabase.from("profiles").select("id, username").in("id", adminIds) : Promise.resolve({ data: [] }),
    readLocalizations([...new Set(data.map((row) => row.anilist_id))]),
  ]);
  const names = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.username]));
  return {
    items: data.map((row) => ({
      id: row.id,
      animeId: row.anilist_id,
      name: recordName(row.anilist_id, stored.records.get(row.anilist_id), row.anime_title),
      what: describeTitleAction(row),
      reason: row.reason,
      admin: (row.admin_id && names.get(row.admin_id)) || "удалён",
      createdAt: row.created_at,
    })),
    failed: false,
  };
}
