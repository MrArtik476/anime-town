import { describe, expect, it } from "vitest";

import {
  cleanDescription,
  formatDuration,
  formatEpisodes,
  formatFormat,
  formatFuzzyDate,
  formatGenre,
  formatScore,
  formatStatus,
  plural,
  truncate,
} from "@/lib/anime/format";
import { getCurrentSeason } from "@/lib/anime/season";

describe("format", () => {
  it("склоняет слова", () => {
    expect([1, 2, 5, 11, 21, 22, 112].map((n) => plural(n, ["серия", "серии", "серий"]))).toEqual([
      "серия", "серии", "серий", "серий", "серия", "серии", "серий",
    ]);
  });

  it("оценка 0–100 → «8.7», мусор → null", () => {
    expect(formatScore(87)).toBe("8.7");
    expect(formatScore(100)).toBe("10.0");
    expect(formatScore(0)).toBeNull();
    expect(formatScore(null)).toBeNull();
    expect(formatScore(150)).toBeNull();
  });

  it("эпизоды и длительность", () => {
    expect(formatEpisodes(1)).toBe("1 серия");
    expect(formatEpisodes(24)).toBe("24 серии");
    expect(formatEpisodes(0)).toBeNull();
    expect(formatDuration(24)).toBe("24 мин");
    expect(formatDuration(120)).toBe("2 ч");
    expect(formatDuration(135)).toBe("2 ч 15 мин");
    expect(formatDuration(null)).toBeNull();
  });

  it("неполные даты AniList", () => {
    expect(formatFuzzyDate({ year: 2024, month: 3, day: 12 })).toBe("12 марта 2024");
    expect(formatFuzzyDate({ year: 2024, month: 3, day: null })).toBe("март 2024");
    expect(formatFuzzyDate({ year: 2024, month: null, day: null })).toBe("2024");
    expect(formatFuzzyDate({ year: null, month: 3, day: 1 })).toBeNull();
    expect(formatFuzzyDate(null)).toBeNull();
  });

  it("подписи форматов, статусов и жанров", () => {
    expect(formatFormat("TV_SHORT")).toBe("Короткий сериал");
    expect(formatFormat("MANGA")).toBe("Манга");
    expect(formatFormat("UNKNOWN")).toBeNull();
    expect(formatStatus("NOT_YET_RELEASED")).toBe("Анонс");
    expect(formatGenre("Slice of Life")).toBe("Повседневность");
    expect(formatGenre("Новый жанр")).toBe("Новый жанр");
  });

  it("чистит описание от HTML", () => {
    expect(cleanDescription("A<br>B<br/><br><i>C</i> &quot;D&quot; &#039;E&#039; &amp; F")).toBe("A\nB\n\nC \"D\" 'E' & F");
    expect(cleanDescription("<br><br>")).toBeNull();
    expect(cleanDescription(null)).toBeNull();
  });

  it("декодирует числовые и именованные HTML-сущности", () => {
    expect(cleanDescription("It&#39;s &#x27;fine&#x27; &hellip; 1&ndash;2 &laquo;да&raquo;")).toBe("It's 'fine' … 1–2 «да»");
    expect(cleanDescription("&#8212;&#X2014;")).toBe("——");
    // Один проход: экранированная сущность остаётся текстом, а не превращается в тег.
    expect(cleanDescription("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    expect(cleanDescription("&unknown; &#0;")).toBe("&unknown; &#0;");
  });

  it("убирает хвосты-атрибуции источника", () => {
    expect(cleanDescription("Story text.<br><br>(Source: Crunchyroll)")).toBe("Story text.");
    expect(cleanDescription("Story text.\n\n<i>(Source: ANN, edited)</i>")).toBe("Story text.");
    expect(cleanDescription("Story text. [Written by MAL Rewrite]")).toBe("Story text.");
    expect(cleanDescription("Line one (Source: X)\nLine two")).toBe("Line one\nLine two");
    // Скобки в середине текста — часть сюжета, их не трогаем.
    expect(cleanDescription("A hero (source of hope) rises.")).toBe("A hero (source of hope) rises.");
    expect(cleanDescription("(Source: Funimation)")).toBeNull();
  });

  it("обрезает по словам", () => {
    expect(truncate("короткий", 20)).toBe("короткий");
    expect(truncate("один два три четыре", 12)).toBe("один два…");
  });
});

describe("getCurrentSeason", () => {
  it("месяцы → аниме-сезон, декабрь относится к зиме следующего года", () => {
    expect(getCurrentSeason(new Date("2026-01-15T00:00:00Z"))).toEqual({ season: "WINTER", year: 2026 });
    expect(getCurrentSeason(new Date("2026-04-01T00:00:00Z"))).toEqual({ season: "SPRING", year: 2026 });
    expect(getCurrentSeason(new Date("2026-07-31T00:00:00Z"))).toEqual({ season: "SUMMER", year: 2026 });
    expect(getCurrentSeason(new Date("2026-10-31T00:00:00Z"))).toEqual({ season: "FALL", year: 2026 });
    expect(getCurrentSeason(new Date("2026-12-05T00:00:00Z"))).toEqual({ season: "WINTER", year: 2027 });
  });
});
