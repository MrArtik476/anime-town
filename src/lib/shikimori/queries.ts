// GraphQL Shikimori: https://shikimori.io/api/doc/graphql. Глубина запроса ограничена 5 уровнями.

export type ShikimoriAnime = {
  malId: string | null;
  russian: string | null;
  synonyms: string[] | null;
  description: string | null;
  url: string | null;
};

export type ShikimoriAnimesData = { animes: ShikimoriAnime[] };
export type ShikimoriSearchData = { animes: { malId: string | null }[] };

/** Пачка тайтлов по MAL id (= id Shikimori), `ids` — строка через запятую. */
export const ANIMES_BY_IDS_QUERY = /* GraphQL */ `
  query AnimesByIds($ids: String!, $limit: PositiveInt!) {
    animes(ids: $ids, limit: $limit, censored: true) {
      malId
      russian
      synonyms
      description
      url
    }
  }
`;

/** Поиск по названию на любом языке — Shikimori понимает русские названия. */
export const SEARCH_ANIMES_QUERY = /* GraphQL */ `
  query SearchAnimes($search: String!, $limit: PositiveInt!) {
    animes(search: $search, limit: $limit, censored: true) {
      malId
    }
  }
`;
