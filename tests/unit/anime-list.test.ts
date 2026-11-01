// @vitest-environment node
import { describe, expect, it } from "vitest";

import { groupByStatus, isEmptyInput, type ListEntry, parseListInput, rowToEntry } from "@/features/list/model";

const entry = (animeId: number, status: ListEntry["status"], score: number | null = null): ListEntry => ({
  animeId,
  status,
  score,
  title: `Тайтл ${animeId}`,
  coverUrl: null,
  updatedAt: "2026-11-01T00:00:00Z",
});

describe("parseListInput — данные от клиента", () => {
  it("корректные статус и оценка", () => {
    expect(parseListInput({ status: "watching", score: 8 })).toEqual({ status: "watching", score: 8 });
    expect(parseListInput({ status: null, score: 10 })).toEqual({ status: null, score: 10 });
    expect(parseListInput({ status: "planned", score: null })).toEqual({ status: "planned", score: null });
  });

  it.each([
    null,
    "watching",
    { status: "favorite", score: null },
    { status: null, score: 0 },
    { status: null, score: 11 },
    { status: null, score: 7.5 },
    { status: null, score: "8" },
    { status: undefined, score: null },
  ])("%j — отказ", (input) => {
    expect(parseListInput(input)).toBeNull();
  });

  it("пустой ввод — удалить из списка", () => {
    expect(isEmptyInput({ status: null, score: null })).toBe(true);
    expect(isEmptyInput({ status: null, score: 1 })).toBe(false);
  });
});

describe("строки и группы", () => {
  it("неизвестный статус из базы → null", () => {
    const row = { anilist_id: 5, status: "weird", score: 7, title: "X", cover_url: null, updated_at: "t" };
    expect(rowToEntry(row)).toMatchObject({ animeId: 5, status: null, score: 7 });
  });

  it("группы по порядку статусов, «Только оценка» в конце, пустые не показываются", () => {
    const groups = groupByStatus([entry(1, "completed", 9), entry(2, "planned"), entry(3, null, 6), entry(4, "planned")]);
    expect(groups.map((group) => [group.key, group.items.map((item) => item.animeId)])).toEqual([
      ["planned", [2, 4]],
      ["completed", [1]],
      ["rated", [3]],
    ]);
    expect(groups[0].label).toBe("Хочу посмотреть");
  });
});
