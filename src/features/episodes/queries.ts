import { cacheLife, cacheTag } from "next/cache";

import { isLicenseStatus, type LicenseStatus } from "@/features/player/source";
import { createPublicClient } from "@/lib/supabase/public";

export type EpisodeSummary = {
  id: number;
  number: number;
  title: string | null;
  durationSec: number | null;
};

export type Subtitle = { lang: string; label: string; url: string; isDefault: boolean };

export type Episode = EpisodeSummary & {
  animeId: number;
  hlsUrl: string;
  licenseStatus: LicenseStatus;
  attribution: string | null;
  attributionUrl: string | null;
  subtitles: Subtitle[];
};

export const episodesTag = (animeId: number) => `episodes:${animeId}`;
/** Серии меняются редко (админка — этап 6): клиент переиспользует 5 минут, сервер обновляет раз в час. */
const EPISODES_LIFE = { stale: 300, revalidate: 3600, expire: 86_400 };

/** Серии тайтла с правами (RLS отдаёт только license_status <> none), по номеру. Публичные данные — общий кэш. */
export async function getEpisodes(animeId: number): Promise<EpisodeSummary[]> {
  "use cache";
  cacheTag(episodesTag(animeId));

  const supabase = createPublicClient();
  const { data, error } = supabase
    ? await supabase
        .from("episodes")
        .select("id, number, title, duration_sec")
        .eq("anilist_id", animeId)
        .order("number")
        .limit(2000)
    : { data: [], error: null };
  if (error) {
    console.error("[episodes] список не загружен", error.code);
    cacheLife("seconds");
    return [];
  }
  cacheLife(EPISODES_LIFE);
  return (data ?? []).map((row) => ({ id: row.id, number: row.number, title: row.title, durationSec: row.duration_sec }));
}

/** Серия с субтитрами. null — нет такой серии или на неё нет прав. */
export async function getEpisode(animeId: number, number: number): Promise<Episode | null> {
  "use cache";
  cacheTag(episodesTag(animeId));

  const supabase = createPublicClient();
  if (!supabase) {
    cacheLife("seconds");
    return null;
  }
  const { data: row, error } = await supabase
    .from("episodes")
    .select("id, anilist_id, number, title, duration_sec, hls_url, license_status, attribution, attribution_url")
    .eq("anilist_id", animeId)
    .eq("number", number)
    .maybeSingle();
  if (error || !row || !isLicenseStatus(row.license_status)) {
    if (error) {
      console.error("[episodes] серия не загружена", error.code);
      cacheLife("seconds");
    } else {
      cacheLife("minutes");
    }
    return null;
  }
  const { data: subs } = await supabase
    .from("subtitles")
    .select("lang, label, url, is_default")
    .eq("episode_id", row.id)
    .order("is_default", { ascending: false });
  cacheLife(EPISODES_LIFE);
  return {
    id: row.id,
    animeId: row.anilist_id,
    number: row.number,
    title: row.title,
    durationSec: row.duration_sec,
    hlsUrl: row.hls_url,
    licenseStatus: row.license_status,
    attribution: row.attribution,
    attributionUrl: row.attribution_url,
    subtitles: (subs ?? []).map((sub) => ({ lang: sub.lang, label: sub.label, url: sub.url, isDefault: sub.is_default })),
  };
}

/** «12 мин» / «1 ч 05 мин» / «0:06» для коротких роликов. */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `0:${String(seconds).padStart(2, "0")}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")} мин`;
}
