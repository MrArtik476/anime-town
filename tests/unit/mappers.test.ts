import { describe, expect, it } from "vitest";

import { findRussianTitle, mapMediaToCard, mapMediaToDetails, pickTitles } from "@/lib/anime/mappers";
import type { AniListMediaCard, AniListMediaDetails } from "@/lib/anilist/types";

const card = (overrides: Partial<AniListMediaCard> = {}): AniListMediaCard => ({
  id: 21,
  idMal: 21,
  title: { romaji: "ONE PIECE", english: "One Piece", native: "ONE PIECE" },
  synonyms: ["Ван-Пис", "OP"],
  coverImage: { extraLarge: "https://s4.anilist.co/xl.jpg", large: "https://s4.anilist.co/l.jpg", color: "#e4a15d" },
  format: "TV",
  status: "RELEASING",
  season: "FALL",
  seasonYear: 1999,
  startDate: { year: 1999, month: 10, day: 20 },
  episodes: null,
  averageScore: 88,
  genres: ["Action", "Adventure"],
  ...overrides,
});

describe("названия", () => {
  it("находит русское название среди синонимов", () => {
    expect(findRussianTitle(["OP", "  Ван-Пис ", "ワンピース"])).toBe("Ван-Пис");
    expect(findRussianTitle(["OP"])).toBeNull();
    expect(findRussianTitle(null)).toBeNull();
  });

  it("не принимает украинские и белорусские синонимы за русские", () => {
    expect(findRussianTitle(["Сталевий алхімік. Братерство", "Стальной алхимик: Братство"])).toBe(
      "Стальной алхимик: Братство",
    );
    expect(findRussianTitle(["Сталевий алхімік", "Дзяўчынка"])).toBeNull();
  });

  it("основное: русское → английское → ромадзи → оригинальное", () => {
    expect(pickTitles({ romaji: "Romaji", english: "English", native: "日本" }, ["Русское"]).main).toBe("Русское");
    expect(pickTitles({ romaji: "Romaji", english: "English", native: "日本" }, []).main).toBe("English");
    expect(pickTitles({ romaji: "Romaji", english: " ", native: "日本" }, []).main).toBe("Romaji");
    expect(pickTitles({ romaji: null, english: null, native: "日本" }, []).main).toBe("日本");
    expect(pickTitles({ romaji: null, english: null, native: null }, []).main).toBe("Без названия");
  });

  it("альтернативное название отличается от основного", () => {
    expect(pickTitles({ romaji: "Same", english: "Same", native: null }, []).alt).toBeNull();
    expect(pickTitles({ romaji: "Romaji", english: "English", native: null }, []).alt).toBe("Romaji");
  });
});

describe("mapMediaToCard", () => {
  it("нормализует карточку", () => {
    expect(mapMediaToCard(card())).toEqual({
      id: 21,
      malId: 21,
      title: "Ван-Пис",
      altTitle: "ONE PIECE",
      coverUrl: "https://s4.anilist.co/l.jpg",
      coverColor: "#e4a15d",
      year: 1999,
      format: "TV",
      status: "RELEASING",
      season: "FALL",
      episodes: null,
      score: 88,
      genres: ["Action", "Adventure"],
    });
  });

  it("отбрасывает пустые и некорректные значения", () => {
    const result = mapMediaToCard(
      card({
        coverImage: { extraLarge: "", large: null, color: null },
        seasonYear: null,
        startDate: { year: 0, month: null, day: null },
        averageScore: 0,
        episodes: 0,
        genres: null,
      }),
    );
    expect(result).toMatchObject({ coverUrl: null, year: null, score: null, episodes: null, genres: [] });
  });

  it("берёт год из даты начала, если сезонного года нет", () => {
    expect(mapMediaToCard(card({ seasonYear: null, startDate: { year: 2004, month: 1, day: null } })).year).toBe(2004);
  });
});

describe("mapMediaToDetails", () => {
  const details = (overrides: Partial<AniListMediaDetails> = {}): AniListMediaDetails => ({
    ...card(),
    synonyms: ["Ван-Пис", "One Piece", "Большой куш", " "],
    description: "Pirates.<br><br>Treasure &amp; adventure.",
    bannerImage: "https://s4.anilist.co/banner.jpg",
    popularity: 600000,
    favourites: 80000,
    duration: 24,
    source: "MANGA",
    endDate: { year: null, month: null, day: null },
    isAdult: false,
    studios: { nodes: [{ id: 1, name: "Toei Animation" }] },
    relations: {
      edges: [
        {
          relationType: "SOURCE",
          node: {
            id: 30013,
            type: "MANGA",
            title: { romaji: "ONE PIECE", english: null, native: null },
            synonyms: [],
            format: "MANGA",
            status: "RELEASING",
            startDate: { year: 1997, month: 7, day: 22 },
            coverImage: { large: null, color: null },
            isAdult: false,
          },
        },
        { relationType: "OTHER", node: null },
        {
          relationType: "SPIN_OFF",
          node: {
            id: 99,
            type: "ANIME",
            title: { romaji: "Adult", english: null, native: null },
            synonyms: [],
            format: "OVA",
            status: "FINISHED",
            startDate: null,
            coverImage: null,
            isAdult: true,
          },
        },
      ],
    },
    ...overrides,
  });

  it("собирает данные страницы тайтла", () => {
    const result = mapMediaToDetails(details());
    expect(result.title).toBe("Ван-Пис");
    expect(result.coverUrl).toBe("https://s4.anilist.co/xl.jpg");
    expect(result.description).toEqual({ language: "en", source: "anilist", text: "Pirates.\n\nTreasure & adventure." });
    expect(result.startDate).toBe("20 октября 1999");
    expect(result.endDate).toBeNull();
    expect(result.studios).toEqual(["Toei Animation"]);
  });

  it("убирает из синонимов основное и официальные названия, пустые строки", () => {
    expect(mapMediaToDetails(details()).synonyms).toEqual(["Большой куш"]);
  });

  it("пропускает пустые связи и тайтлы 18+", () => {
    const relations = mapMediaToDetails(details()).relations;
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({ id: 30013, isAnime: false, relationType: "SOURCE", year: 1997 });
  });
});
