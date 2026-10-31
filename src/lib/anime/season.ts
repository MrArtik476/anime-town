import type { MediaSeason } from "@/lib/anilist/types";

/** Аниме-сезоны AniList: зима — дек–фев, весна — мар–май, лето — июн–авг, осень — сен–ноя. */
export function getCurrentSeason(date: Date): { season: MediaSeason; year: number } {
  const month = date.getUTCMonth(); // 0–11
  const year = date.getUTCFullYear();
  if (month === 11) return { season: "WINTER", year: year + 1 };
  if (month <= 1) return { season: "WINTER", year };
  if (month <= 4) return { season: "SPRING", year };
  if (month <= 7) return { season: "SUMMER", year };
  return { season: "FALL", year };
}
