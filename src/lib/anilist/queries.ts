import type {
  AniListMediaCard,
  AniListMediaDetails,
  AniListPage,
  MediaFormat,
  MediaSeason,
  MediaSort,
  MediaStatus,
} from "./types";

/** Строка GraphQL-документа с привязанными типами ответа и переменных. */
export type GraphQLDocument<TData, TVariables> = string & {
  readonly __data?: TData;
  readonly __variables?: TVariables;
};

const gql = <TData, TVariables>(source: string) => source as GraphQLDocument<TData, TVariables>;

/** Жанр 18+ исключается из всех выборок вместе с isAdult: false. */
export const EXCLUDED_GENRES = ["Hentai"];

const MEDIA_CARD_FIELDS = /* GraphQL */ `
  id
  title { romaji english native }
  synonyms
  coverImage { extraLarge large color }
  format
  status
  season
  seasonYear
  startDate { year month day }
  episodes
  averageScore
  genres
`;

const PAGE_INFO_FIELDS = /* GraphQL */ `pageInfo { currentPage hasNextPage }`;

// --- Главная: три подборки одним запросом (экономит лимит AniList) ---

export type AniListFeaturedMedia = AniListMediaCard & {
  bannerImage: string | null;
  description: string | null;
};

export type HomeCollectionsData = {
  trending: AniListPage<AniListFeaturedMedia>;
  topRated: AniListPage<AniListMediaCard>;
  seasonal: AniListPage<AniListMediaCard>;
};

export type HomeCollectionsVariables = {
  perPage: number;
  season: MediaSeason;
  seasonYear: number;
  excludedGenres: string[];
};

export const HOME_COLLECTIONS_QUERY = gql<HomeCollectionsData, HomeCollectionsVariables>(/* GraphQL */ `
  query HomeCollections($perPage: Int!, $season: MediaSeason!, $seasonYear: Int!, $excludedGenres: [String]) {
    trending: Page(page: 1, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(type: ANIME, isAdult: false, genre_not_in: $excludedGenres, sort: [TRENDING_DESC, POPULARITY_DESC]) {
        ${MEDIA_CARD_FIELDS}
        bannerImage
        description(asHtml: false)
      }
    }
    topRated: Page(page: 1, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(type: ANIME, isAdult: false, genre_not_in: $excludedGenres, sort: [SCORE_DESC, POPULARITY_DESC]) {
        ${MEDIA_CARD_FIELDS}
      }
    }
    seasonal: Page(page: 1, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(type: ANIME, isAdult: false, genre_not_in: $excludedGenres, season: $season, seasonYear: $seasonYear, sort: [POPULARITY_DESC]) {
        ${MEDIA_CARD_FIELDS}
      }
    }
  }
`);

// --- Каталог: поиск, фильтры, сортировка, пагинация ---

export type CatalogPageData = { Page: AniListPage<AniListMediaCard> };

export type CatalogPageVariables = {
  page: number;
  perPage: number;
  sort: MediaSort[];
  search: string | null;
  genre: string | null;
  seasonYear: number | null;
  season: MediaSeason | null;
  format: MediaFormat | null;
  status: MediaStatus | null;
  excludedGenres: string[];
};

// Один запрос покрывает любые сочетания фильтров: незаданные переменные клиент не отправляет
// (см. compactVariables — явный null AniList воспринимает как фильтр, а не как «не задано»).
export const CATALOG_PAGE_QUERY = gql<CatalogPageData, CatalogPageVariables>(/* GraphQL */ `
  query CatalogPage(
    $page: Int!, $perPage: Int!, $sort: [MediaSort], $search: String, $genre: String,
    $seasonYear: Int, $season: MediaSeason, $format: MediaFormat, $status: MediaStatus,
    $excludedGenres: [String]
  ) {
    Page(page: $page, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(
        type: ANIME, isAdult: false, sort: $sort, search: $search, genre: $genre,
        genre_not_in: $excludedGenres, seasonYear: $seasonYear, season: $season,
        format: $format, status: $status
      ) {
        ${MEDIA_CARD_FIELDS}
      }
    }
  }
`);

// --- Жанры ---

export type GenresData = { GenreCollection: string[] };

export const GENRES_QUERY = gql<GenresData, Record<string, never>>(/* GraphQL */ `
  query Genres {
    GenreCollection
  }
`);

// --- Страница тайтла ---

export type AnimeDetailsData = { Media: AniListMediaDetails | null };
export type AnimeDetailsVariables = { id: number };

export const ANIME_DETAILS_QUERY = gql<AnimeDetailsData, AnimeDetailsVariables>(/* GraphQL */ `
  query AnimeDetails($id: Int!) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_CARD_FIELDS}
      description(asHtml: false)
      bannerImage
      popularity
      favourites
      duration
      source(version: 3)
      endDate { year month day }
      isAdult
      studios(isMain: true) { nodes { id name } }
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            type
            title { romaji english native }
            synonyms
            format
            status
            startDate { year month day }
            coverImage { large color }
            isAdult
          }
        }
      }
    }
  }
`);
