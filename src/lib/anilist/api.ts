import { cacheLife, cacheTag } from "next/cache";

import { type CatalogFilters, toCatalogVariables } from "@/lib/anime/catalog-params";
import { mapFeatured, mapMediaToCard, mapMediaToDetails } from "@/lib/anime/mappers";
import type { MediaSeason } from "@/lib/anilist/types";
import type { AnimeDetails, AnimePage, HomeCollections } from "@/types/anime";

import { anilistRequest } from "./client";
import { AniListError, type DataErrorCode, isAniListError, toErrorCode } from "./errors";
import {
  ANIME_DETAILS_QUERY,
  CATALOG_PAGE_QUERY,
  EXCLUDED_GENRES,
  GENRES_QUERY,
  HOME_COLLECTIONS_QUERY,
} from "./queries";

// Серверный слой данных. Каждая функция кэширует результат через `use cache`:
// одинаковые аргументы → один запрос к AniList на время жизни кэша.
// Результат — сериализуемый объект { ok, data | error }: так код ошибки переживает границу кэша,
// а неудача кэшируется лишь на секунды (профиль `seconds`) и не долбит AniList повторами.

export type AniListFailure = { code: DataErrorCode; retryAfter: number | null };
export type AniListResult<T> = { ok: true; data: T } | { ok: false; error: AniListFailure };

async function settle<T>(work: () => Promise<T>): Promise<AniListResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    const code = toErrorCode(error);
    if (code !== "NOT_FOUND") console.error("[anilist]", code, error);
    return {
      ok: false,
      error: { code, retryAfter: isAniListError(error) ? (error.retryAfter ?? null) : null },
    };
  }
}

const HOME_SECTION_SIZE = 12;

export async function getHomeCollections(
  season: MediaSeason,
  seasonYear: number,
): Promise<AniListResult<HomeCollections>> {
  "use cache";
  cacheTag("anilist", "anilist:home");

  const result = await settle(async () => {
    const data = await anilistRequest(HOME_COLLECTIONS_QUERY, {
      perPage: HOME_SECTION_SIZE,
      season,
      seasonYear,
      excludedGenres: EXCLUDED_GENRES,
    });
    const trendingRaw = data.trending.media;
    const featuredRaw = trendingRaw.find((media) => media.bannerImage) ?? trendingRaw[0];

    return {
      featured: featuredRaw ? mapFeatured(featuredRaw) : null,
      trending: trendingRaw.map(mapMediaToCard),
      topRated: data.topRated.media.map(mapMediaToCard),
      seasonal: data.seasonal.media.map(mapMediaToCard),
      season,
      seasonYear,
    };
  });

  if (result.ok) cacheLife("hours");
  else cacheLife("seconds");
  return result;
}

export async function searchAnime(filters: CatalogFilters, page: number): Promise<AniListResult<AnimePage>> {
  "use cache";
  cacheTag("anilist", "anilist:catalog");

  const result = await settle(async () => {
    const data = await anilistRequest(CATALOG_PAGE_QUERY, toCatalogVariables(filters, page));
    return {
      items: data.Page.media.map(mapMediaToCard),
      page: data.Page.pageInfo.currentPage ?? page,
      hasNextPage: data.Page.pageInfo.hasNextPage ?? false,
    };
  });

  if (result.ok) cacheLife("hours");
  else cacheLife("seconds");
  return result;
}

export async function getGenres(): Promise<AniListResult<string[]>> {
  "use cache";
  cacheTag("anilist", "anilist:genres");

  const result = await settle(async () => {
    const data = await anilistRequest(GENRES_QUERY, {});
    return data.GenreCollection.filter((genre) => !EXCLUDED_GENRES.includes(genre));
  });

  if (result.ok) cacheLife("days");
  else cacheLife("seconds");
  return result;
}

export async function getAnimeById(id: number): Promise<AniListResult<AnimeDetails>> {
  "use cache";
  cacheTag("anilist", `anilist:anime:${id}`);

  const result = await settle(async () => {
    const data = await anilistRequest(ANIME_DETAILS_QUERY, { id });
    // Тайтлы 18+ на платформе не показываются — для пользователя это «не найдено».
    if (!data.Media || data.Media.isAdult) {
      throw new AniListError("NOT_FOUND", "Не найдено", { status: 404 });
    }
    return mapMediaToDetails(data.Media);
  });

  // «Не найдено» стабильно — его можно держать дольше, чем временный сбой.
  if (result.ok) cacheLife("hours");
  else if (result.error.code === "NOT_FOUND") cacheLife("minutes");
  else cacheLife("seconds");
  return result;
}
