import { cacheLife, cacheTag } from "next/cache";

import {
  type CatalogFilters,
  paginateMalIdResults,
  toCatalogVariables,
  toMalIdVariables,
} from "@/lib/anime/catalog-params";
import { mapFeatured, mapMediaToCard, mapMediaToDetails } from "@/lib/anime/mappers";
import { loadLocalizations, localizeCards, localizeDescription, readLocalizations } from "@/lib/localization/service";
import { hasCyrillic } from "@/lib/localization/text";
import { resolveTitles } from "@/lib/localization/resolve";
import { searchShikimoriMalIds } from "@/lib/shikimori/api";
import type { MediaSeason } from "@/lib/anilist/types";
import type { AnimeCard, AnimeDetails, AnimePage, HomeCollections } from "@/types/anime";

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
    const featured = featuredRaw ? mapFeatured(featuredRaw) : null;
    const trending = trendingRaw.map(mapMediaToCard);
    const topRated = data.topRated.media.map(mapMediaToCard);
    const seasonal = data.seasonal.media.map(mapMediaToCard);

    // Три подборки и главный тайтл — одна пачка к хранилищу и Shikimori.
    const { records, complete } = await loadLocalizations([...trending, ...topRated, ...seasonal]);
    const localize = <T extends AnimeCard>(card: T) => resolveTitles(card, records.get(card.id));

    return {
      collections: {
        featured: featured
          ? { ...localize(featured), description: localizeDescription(featured.description, records.get(featured.id)) }
          : null,
        trending: trending.map(localize),
        topRated: topRated.map(localize),
        seasonal: seasonal.map(localize),
        season,
        seasonYear,
      },
      complete,
    };
  });

  // Без русских данных (Shikimori или хранилище не ответили) — кэш на минуты, чтобы скоро повторить.
  if (!result.ok) cacheLife("seconds");
  else if (result.data.complete) cacheLife("hours");
  else cacheLife("minutes");
  return result.ok ? { ok: true, data: result.data.collections } : result;
}

export async function searchAnime(filters: CatalogFilters, page: number): Promise<AniListResult<AnimePage>> {
  "use cache";
  cacheTag("anilist", "anilist:catalog");

  const result = await settle(async () => {
    const found = await findPage(filters, page);
    const { items, complete } = await localizeCards(found.items);
    return { page: { ...found, items }, complete };
  });

  if (!result.ok) cacheLife("seconds");
  else if (result.data.complete) cacheLife("hours");
  else cacheLife("minutes");
  return result.ok ? { ok: true, data: result.data.page } : result;
}

/**
 * Страница каталога без локализации. Запрос на кириллице ищется через Shikimori (MAL id → AniList);
 * если Shikimori недоступен — обычным поиском AniList (он находит русские синонимы).
 */
async function findPage(filters: CatalogFilters, page: number): Promise<AnimePage> {
  if (filters.q && hasCyrillic(filters.q)) {
    const malIds = await searchShikimoriMalIds(filters.q).catch((error: unknown) => {
      console.error("[shikimori] поиск недоступен", error);
      return null;
    });
    if (malIds?.length === 0) return { items: [], page, hasNextPage: false };
    if (malIds) {
      const data = await anilistRequest(CATALOG_PAGE_QUERY, toMalIdVariables(filters, malIds));
      return paginateMalIdResults(data.Page.media.map(mapMediaToCard), malIds, filters, page);
    }
  }

  const data = await anilistRequest(CATALOG_PAGE_QUERY, toCatalogVariables(filters, page));
  return {
    items: data.Page.media.map(mapMediaToCard),
    page: data.Page.pageInfo.currentPage ?? page,
    hasNextPage: data.Page.pageInfo.hasNextPage ?? false,
  };
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

/**
 * Срок жизни страницы тайтла с переводом. stale ≥ 5 минут — клиентский роутер переиспользует её при повторных
 * переходах без запроса к серверу. revalidate 10 минут — перевод, записанный фоновым заполнением
 * (Edge Function `translate-cron`, другой процесс), появляется на странице не позже чем через 10 минут; ручной запуск
 * /api/cron/translate сбрасывает тег `localization` сразу.
 */
const LOCALIZED_ANIME_LIFE = { stale: 300, revalidate: 600, expire: 86_400 };

/**
 * Тайтл с русским названием и описанием. Кэшируется целиком (`use cache`): повторный показ и prefetch
 * по наведению на карточку отдаются без запросов к AniList, Supabase и Shikimori.
 * Данные AniList и строки переводов читаются параллельно: для чтения перевода нужен только id AniList.
 */
export async function getLocalizedAnimeById(id: number): Promise<AniListResult<AnimeDetails>> {
  "use cache";
  cacheTag("anilist", `anilist:anime:${id}`, "localization", `localization:${id}`);

  const [result, stored] = await Promise.all([getAnimeById(id), readLocalizations([id])]);
  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") cacheLife("minutes");
    else cacheLife("seconds");
    return result;
  }

  const anime = result.data;
  const { records, complete } = await loadLocalizations([anime], undefined, stored);
  // Сбой хранилища или Shikimori — кэшируем ненадолго, чтобы быстро подтянуть русские данные.
  if (complete) cacheLife(LOCALIZED_ANIME_LIFE);
  else cacheLife("minutes");

  const record = records.get(anime.id);
  const localized = resolveTitles(anime, record);
  // Русские синонимы Shikimori — первыми в «Других названиях». Прежнее основное название (например,
  // русский синоним AniList) тоже остаётся среди них, если его заменило название Shikimori.
  const synonyms = [...new Set([...(record?.synonymsRu ?? []), anime.title, ...anime.synonyms])].filter(
    (synonym) => synonym !== localized.title && synonym !== localized.altTitle,
  );
  return {
    ok: true,
    data: { ...localized, synonyms, description: localizeDescription(anime.description, record) },
  };
}
