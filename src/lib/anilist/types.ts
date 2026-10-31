// Типы ответов AniList GraphQL (только поля, которые запрашивает Anime Town).
// Схема: https://docs.anilist.co/reference/

export const MEDIA_FORMATS = ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL"] as const;
export type MediaFormat = (typeof MEDIA_FORMATS)[number];

export const MEDIA_STATUSES = ["RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number] | "HIATUS";

export const MEDIA_SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;
export type MediaSeason = (typeof MEDIA_SEASONS)[number];

export type MediaSort =
  | "POPULARITY_DESC"
  | "SCORE_DESC"
  | "TRENDING_DESC"
  | "START_DATE_DESC"
  | "EPISODES_DESC"
  | "SEARCH_MATCH";

export type FuzzyDate = {
  year: number | null;
  month: number | null;
  day: number | null;
};

export type MediaTitle = {
  romaji: string | null;
  english: string | null;
  native: string | null;
};

export type MediaCoverImage = {
  extraLarge: string | null;
  large: string | null;
  color: string | null;
};

/** Поля карточки — общий фрагмент для всех списков. */
export type AniListMediaCard = {
  id: number;
  /** ID на MyAnimeList — он же ID тайтла на Shikimori. */
  idMal: number | null;
  title: MediaTitle;
  synonyms: string[] | null;
  coverImage: MediaCoverImage | null;
  format: MediaFormat | null;
  status: MediaStatus | null;
  season: MediaSeason | null;
  seasonYear: number | null;
  startDate: FuzzyDate | null;
  episodes: number | null;
  averageScore: number | null;
  genres: string[] | null;
};

export type AniListRelationEdge = {
  relationType: string | null;
  node: {
    id: number;
    type: "ANIME" | "MANGA" | null;
    title: MediaTitle;
    synonyms: string[] | null;
    format: string | null;
    status: MediaStatus | null;
    startDate: FuzzyDate | null;
    coverImage: Pick<MediaCoverImage, "large" | "color"> | null;
    isAdult: boolean | null;
  } | null;
};

export type AniListMediaDetails = AniListMediaCard & {
  description: string | null;
  bannerImage: string | null;
  popularity: number | null;
  favourites: number | null;
  duration: number | null;
  source: string | null;
  endDate: FuzzyDate | null;
  isAdult: boolean | null;
  studios: { nodes: { id: number; name: string }[] } | null;
  relations: { edges: AniListRelationEdge[] } | null;
};

export type AniListPageInfo = {
  currentPage: number | null;
  hasNextPage: boolean | null;
};

export type AniListPage<T> = {
  pageInfo: AniListPageInfo;
  media: T[];
};
