// @vitest-environment node
import { describe, expect, it } from "vitest";

import { formatClock, parseProgressInput, type ProgressRow, resumePosition, selectContinueItems } from "@/features/progress/model";

const row = (anilistId: number, episodeNumber: number, position: number, completed = false): ProgressRow => ({
  anilistId,
  episodeNumber,
  position,
  duration: 100,
  completed,
  title: `Тайтл ${anilistId}`,
  coverUrl: null,
  updatedAt: "t",
});

describe("parseProgressInput — тело POST /api/progress", () => {
  it("корректные данные; позиция не дальше конца, округление до 0,1 с", () => {
    expect(parseProgressInput({ animeId: 1, number: 2, position: 12.345, duration: 100 })).toEqual({
      animeId: 1,
      number: 2,
      position: 12.3,
      duration: 100,
    });
    expect(parseProgressInput({ animeId: 1, number: 1, position: 6.4, duration: 6.001 })?.position).toBe(6);
  });

  it.each([
    null,
    "x",
    { animeId: 0, number: 1, position: 1, duration: 10 },
    { animeId: 1, number: 1.5, position: 1, duration: 10 },
    { animeId: 1, number: 1, position: -1, duration: 10 },
    { animeId: 1, number: 1, position: 1, duration: 0 },
    { animeId: 1, number: 1, position: Number.NaN, duration: 10 },
    { animeId: 1, number: 1, position: 1, duration: 200_000 },
    { animeId: "1", number: 1, position: 1, duration: 10 },
  ])("%j — отказ", (body) => {
    expect(parseProgressInput(body)).toBeNull();
  });
});

describe("resumePosition", () => {
  it("продолжаем не с начала и не досмотренную серию", () => {
    expect(resumePosition(null)).toBe(0);
    expect(resumePosition({ position: 300, duration: 1400, completed: false })).toBe(300);
    expect(resumePosition({ position: 3, duration: 1400, completed: false })).toBe(0);
    expect(resumePosition({ position: 1300, duration: 1400, completed: true })).toBe(0);
    // Короткий ролик: порог — 10 % длительности.
    expect(resumePosition({ position: 3, duration: 6, completed: false })).toBe(3);
  });
});

describe("selectContinueItems", () => {
  const next = (anilistId: number, number: number) => (anilistId === 2 && number < 3 ? number + 1 : null);

  it("по тайтлу — последняя серия; досмотренная → следующая; без следующей — не показываем", () => {
    const items = selectContinueItems(
      [row(1, 4, 50), row(2, 1, 95, true), row(1, 3, 10), row(3, 12, 99, true)],
      next,
    );
    expect(items.map((item) => [item.anilistId, item.episodeNumber, item.isNext, item.fraction])).toEqual([
      [1, 4, false, 0.5],
      [2, 2, true, 0],
    ]);
  });

  it("не больше limit", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(100 + i, 1, 10));
    expect(selectContinueItems(rows, next, 8)).toHaveLength(8);
  });
});

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [3.9, "0:03"],
    [725, "12:05"],
    [3723, "1:02:03"],
  ])("%s → %s", (seconds, text) => expect(formatClock(seconds)).toBe(text));
});
