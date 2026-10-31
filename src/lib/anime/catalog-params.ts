import type { CatalogPageVariables } from "@/lib/anilist/queries";
import { EXCLUDED_GENRES } from "@/lib/anilist/queries";
import {
  MEDIA_FORMATS,
  MEDIA_SEASONS,
  MEDIA_STATUSES,
  type MediaFormat,
  type MediaSeason,
  type MediaSort,
  type MediaStatus,
} from "@/lib/anilist/types";

export const CATALOG_PAGE_SIZE = 24;
export const MIN_CATALOG_YEAR = 1960;
export const MAX_SEARCH_LENGTH = 100;

export const SORT_OPTIONS = ["popularity", "trending", "score", "newest", "episodes", "relevance"] as const;
export type CatalogSort = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS: Record<CatalogSort, string> = {
  popularity: "По популярности",
  trending: "В тренде",
  score: "По рейтингу",
  newest: "Сначала новые",
  episodes: "По числу серий",
  relevance: "По совпадению",
};

const SORT_TO_ANILIST: Record<CatalogSort, MediaSort[]> = {
  popularity: ["POPULARITY_DESC"],
  trending: ["TRENDING_DESC", "POPULARITY_DESC"],
  score: ["SCORE_DESC", "POPULARITY_DESC"],
  newest: ["START_DATE_DESC", "POPULARITY_DESC"],
  episodes: ["EPISODES_DESC", "POPULARITY_DESC"],
  relevance: ["SEARCH_MATCH", "POPULARITY_DESC"],
};

export type CatalogFilters = {
  q: string | null;
  genre: string | null;
  year: number | null;
  season: MediaSeason | null;
  format: MediaFormat | null;
  status: MediaStatus | null;
  /** null — сортировка по умолчанию (совпадение при поиске, иначе популярность). */
  sort: CatalogSort | null;
};

export const EMPTY_FILTERS: CatalogFilters = {
  q: null,
  genre: null,
  year: null,
  season: null,
  format: null,
  status: null,
  sort: null,
};

/** Ключи фильтров в URL — совпадают с полями CatalogFilters. */
export const FILTER_KEYS = ["q", "genre", "year", "season", "format", "status", "sort"] as const;

type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

function readParam(params: SearchParamsLike, key: string): string | null {
  const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const oneOf = <T extends string>(allowed: readonly T[], value: string | null): T | null =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : null;

/**
 * Разбирает параметры URL. Некорректные значения отбрасываются, а не ломают страницу:
 * `?year=abc&format=XYZ` равносильно пустым фильтрам.
 */
export function parseCatalogParams(params: SearchParamsLike, maxYear: number): CatalogFilters {
  const year = Number(readParam(params, "year"));
  const genre = readParam(params, "genre");
  const q = readParam(params, "q");

  return {
    q: q ? q.slice(0, MAX_SEARCH_LENGTH) : null,
    genre: genre && !EXCLUDED_GENRES.includes(genre) ? genre : null,
    year: Number.isInteger(year) && year >= MIN_CATALOG_YEAR && year <= maxYear ? year : null,
    season: oneOf(MEDIA_SEASONS, readParam(params, "season")),
    format: oneOf(MEDIA_FORMATS, readParam(params, "format")),
    status: oneOf(MEDIA_STATUSES, readParam(params, "status")),
    sort: oneOf(SORT_OPTIONS, readParam(params, "sort")),
  };
}

/** Стабильный порядок ключей — одинаковые фильтры дают одинаковый URL и ключ кэша. */
export function serializeCatalogParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value !== null && value !== "") params.set(key, String(value));
  }
  return params;
}

export function catalogHref(filters: CatalogFilters): string {
  const query = serializeCatalogParams(filters).toString();
  return query ? `/catalog?${query}` : "/catalog";
}

export function resolveSort(filters: CatalogFilters): CatalogSort {
  if (filters.sort === "relevance" && !filters.q) return "popularity";
  return filters.sort ?? (filters.q ? "relevance" : "popularity");
}

export function toCatalogVariables(filters: CatalogFilters, page: number): CatalogPageVariables {
  return {
    page,
    perPage: CATALOG_PAGE_SIZE,
    sort: SORT_TO_ANILIST[resolveSort(filters)],
    search: filters.q,
    genre: filters.genre,
    seasonYear: filters.year,
    season: filters.season,
    format: filters.format,
    status: filters.status,
    excludedGenres: EXCLUDED_GENRES,
  };
}

/** Количество активных фильтров без учёта поиска и сортировки. */
export function countActiveFilters(filters: CatalogFilters): number {
  return [filters.genre, filters.year, filters.season, filters.format, filters.status].filter(
    (value) => value !== null,
  ).length;
}

export function hasAnyFilter(filters: CatalogFilters): boolean {
  return countActiveFilters(filters) > 0 || filters.q !== null || filters.sort !== null;
}

export function yearOptions(maxYear: number): number[] {
  const years: number[] = [];
  for (let year = maxYear; year >= MIN_CATALOG_YEAR; year--) years.push(year);
  return years;
}
