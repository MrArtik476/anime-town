import type { MediaFormat, MediaSeason, MediaStatus } from "@/lib/anilist/types";

/** Карточка тайтла после нормализации — пустые значения уже отброшены (null). */
export type AnimeCard = {
  id: number;
  /** Основное название: русское (если есть в синонимах) → английское → ромадзи. */
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

export type FeaturedAnime = AnimeCard & {
  bannerUrl: string | null;
  description: string | null;
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
  description: string | null;
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
