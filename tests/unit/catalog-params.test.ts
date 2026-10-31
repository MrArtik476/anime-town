import { describe, expect, it } from "vitest";

import {
  catalogHref,
  countActiveFilters,
  EMPTY_FILTERS,
  hasAnyFilter,
  parseCatalogParams,
  resolveSort,
  serializeCatalogParams,
  toCatalogVariables,
} from "@/lib/anime/catalog-params";

const MAX_YEAR = 2027;

describe("parseCatalogParams", () => {
  it("читает корректные параметры из URLSearchParams и из объекта Next.js", () => {
    const expected = {
      q: "frieren",
      genre: "Action",
      year: 2023,
      season: "FALL",
      format: "TV",
      status: "FINISHED",
      sort: "score",
    };
    const query = "q=frieren&genre=Action&year=2023&season=FALL&format=TV&status=FINISHED&sort=score";
    expect(parseCatalogParams(new URLSearchParams(query), MAX_YEAR)).toEqual(expected);
    expect(
      parseCatalogParams(
        { q: "frieren", genre: "Action", year: "2023", season: "FALL", format: "TV", status: "FINISHED", sort: ["score", "x"] },
        MAX_YEAR,
      ),
    ).toEqual(expected);
  });

  it("отбрасывает некорректные значения", () => {
    const params = new URLSearchParams("q=%20%20&genre=Hentai&year=abc&season=MONSOON&format=MANGA&status=X&sort=random");
    expect(parseCatalogParams(params, MAX_YEAR)).toEqual(EMPTY_FILTERS);
    expect(parseCatalogParams(new URLSearchParams("year=1900"), MAX_YEAR).year).toBeNull();
    expect(parseCatalogParams(new URLSearchParams("year=2030"), MAX_YEAR).year).toBeNull();
    expect(parseCatalogParams(new URLSearchParams("year=2020.5"), MAX_YEAR).year).toBeNull();
  });

  it("обрезает слишком длинный запрос", () => {
    expect(parseCatalogParams(new URLSearchParams(`q=${"a".repeat(300)}`), MAX_YEAR).q).toHaveLength(100);
  });
});

describe("serializeCatalogParams / catalogHref", () => {
  it("стабильный порядок ключей и пропуск пустых значений", () => {
    const filters = { ...EMPTY_FILTERS, sort: "score" as const, genre: "Drama", year: 2020 };
    expect(serializeCatalogParams(filters).toString()).toBe("genre=Drama&year=2020&sort=score");
    expect(catalogHref(EMPTY_FILTERS)).toBe("/catalog");
    expect(catalogHref({ ...EMPTY_FILTERS, q: "наруто" })).toBe("/catalog?q=%D0%BD%D0%B0%D1%80%D1%83%D1%82%D0%BE");
  });

  it("разбор сериализованных фильтров возвращает те же фильтры", () => {
    const filters = { q: "one piece", genre: "Adventure", year: 1999, season: "FALL", format: "TV", status: "RELEASING", sort: "newest" } as const;
    expect(parseCatalogParams(serializeCatalogParams(filters), MAX_YEAR)).toEqual(filters);
  });
});

describe("сортировка", () => {
  it("по умолчанию: совпадение при поиске, иначе популярность", () => {
    expect(resolveSort(EMPTY_FILTERS)).toBe("popularity");
    expect(resolveSort({ ...EMPTY_FILTERS, q: "naruto" })).toBe("relevance");
    expect(resolveSort({ ...EMPTY_FILTERS, sort: "relevance" })).toBe("popularity");
    expect(resolveSort({ ...EMPTY_FILTERS, q: "naruto", sort: "score" })).toBe("score");
  });

  it("преобразуется в сортировку AniList с запасным критерием", () => {
    expect(toCatalogVariables({ ...EMPTY_FILTERS, sort: "score" }, 1).sort).toEqual(["SCORE_DESC", "POPULARITY_DESC"]);
    expect(toCatalogVariables({ ...EMPTY_FILTERS, sort: "newest" }, 1).sort).toEqual(["START_DATE_DESC", "POPULARITY_DESC"]);
    expect(toCatalogVariables({ ...EMPTY_FILTERS, sort: "episodes" }, 1).sort).toEqual(["EPISODES_DESC", "POPULARITY_DESC"]);
    expect(toCatalogVariables(EMPTY_FILTERS, 1).sort).toEqual(["POPULARITY_DESC"]);
    expect(toCatalogVariables({ ...EMPTY_FILTERS, q: "x" }, 1).sort).toEqual(["SEARCH_MATCH", "POPULARITY_DESC"]);
  });
});

describe("toCatalogVariables", () => {
  it("переносит все фильтры в переменные запроса", () => {
    expect(
      toCatalogVariables({ q: "x", genre: "Drama", year: 2020, season: "SPRING", format: "MOVIE", status: "FINISHED", sort: null }, 3),
    ).toEqual({
      page: 3,
      perPage: 24,
      sort: ["SEARCH_MATCH", "POPULARITY_DESC"],
      search: "x",
      genre: "Drama",
      seasonYear: 2020,
      season: "SPRING",
      format: "MOVIE",
      status: "FINISHED",
      excludedGenres: ["Hentai"],
    });
  });
});

describe("счётчики", () => {
  it("считает фильтры без поиска и сортировки", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...EMPTY_FILTERS, q: "x", sort: "score" })).toBe(0);
    expect(countActiveFilters({ ...EMPTY_FILTERS, genre: "Drama", format: "TV", year: 2020 })).toBe(3);
    expect(hasAnyFilter({ ...EMPTY_FILTERS, sort: "score" })).toBe(true);
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
  });
});
