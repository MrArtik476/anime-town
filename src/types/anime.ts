import type { MediaFormat, MediaSeason, MediaStatus } from "@/lib/anilist/types";

/** Карточка тайтла после нормализации — пустые значения уже отброшены (null). */
export type AnimeCard = {
  id: number;
  /** ID на MyAnimeList = ID на Shikimori; по нему подтягивается русский контент. */
  malId: number | null;
  /** Основное название: русское (Shikimori, затем синонимы AniList) → английское → ромадзи. */
  title: string;
  /** Альтернативное название, отличное от основного. */
  altTitle: string | null;
  coverUrl: string | null;
  coverColor: string | null;
  year: number | null;
  format: MediaFormat | null;
  status: MediaStatus | null;
  season: MediaSeason | null;
  episodes: number | null;
  /** Средняя оценка AniList по шкале 0–100. */
  score: number | null;
  genres: string[];
};

/**
 * Описание для показа: русское (Shikimori или машинный перевод) либо английский оригинал AniList.
 * Порядок выбора — lib/localization/resolve.ts.
 */
export type AnimeDescription =
  | { language: "ru"; source: "shikimori"; text: string; sourceUrl: string | null }
  | { language: "ru"; source: "machine"; text: string }
  | { language: "en"; source: "anilist"; text: string };

export type FeaturedAnime = AnimeCard & {
  bannerUrl: string | null;
  description: AnimeDescription | null;
};

export type AnimeRelation = {
  id: number;
  title: string;
  relationType: string | null;
  isAnime: boolean;
  format: string | null;
  year: number | null;
  coverUrl: string | null;
  coverColor: string | null;
};

export type AnimeDetails = AnimeCard & {
  nativeTitle: string | null;
  romajiTitle: string | null;
  englishTitle: string | null;
  synonyms: string[];
  description: AnimeDescription | null;
  bannerUrl: string | null;
  popularity: number | null;
  favourites: number | null;
  duration: number | null;
  source: string | null;
  startDate: string | null;
  endDate: string | null;
  studios: string[];
  relations: AnimeRelation[];
};

export type AnimePage = {
  items: AnimeCard[];
  page: number;
  hasNextPage: boolean;
};

export type HomeCollections = {
  featured: FeaturedAnime | null;
  trending: AnimeCard[];
  topRated: AnimeCard[];
  seasonal: AnimeCard[];
  season: MediaSeason;
  seasonYear: number;
};
