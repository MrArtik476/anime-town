// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { BackfillReport } from "@/lib/localization/backfill";
import { isBackfillFailure, parseBackfillArgs, parseBackfillLimit } from "@/lib/localization/backfill-run";

const report = (overrides: Partial<BackfillReport> = {}): BackfillReport => ({
  translator: "deepl",
  candidates: 80,
  pending: 5,
  translated: 5,
  characters: 4_200,
  batches: 1,
  skippedOversized: 0,
  stopped: null,
  usage: { used: 104_200, limit: 500_000, ownLimit: 450_000 },
  ...overrides,
});

describe("parseBackfillLimit", () => {
  it("пусто — без ограничения", () => {
    expect(parseBackfillLimit(null)).toEqual({ ok: true, limit: undefined });
    expect(parseBackfillLimit(undefined)).toEqual({ ok: true, limit: undefined });
    expect(parseBackfillLimit("  ")).toEqual({ ok: true, limit: undefined });
  });

  it("целое от 1 до 100", () => {
    expect(parseBackfillLimit("1")).toEqual({ ok: true, limit: 1 });
    expect(parseBackfillLimit("100")).toEqual({ ok: true, limit: 100 });
  });

  it.each(["0", "101", "-3", "2.5", "abc", "1e9"])("«%s» — ошибка", (raw) => {
    expect(parseBackfillLimit(raw)).toMatchObject({ ok: false, message: expect.stringContaining("от 1 до 100") });
  });
});

describe("parseBackfillArgs", () => {
  it("без аргументов — все кандидаты", () => {
    expect(parseBackfillArgs([])).toEqual({ help: false, limit: undefined });
  });

  it("--limit N и --limit=N", () => {
    expect(parseBackfillArgs(["--limit", "5"])).toEqual({ help: false, limit: 5 });
    expect(parseBackfillArgs(["--limit=3"])).toEqual({ help: false, limit: 3 });
    // Пустое значение — без ограничения.
    expect(parseBackfillArgs(["--limit="])).toEqual({ help: false, limit: undefined });
  });

  it("--help и -h", () => {
    expect(parseBackfillArgs(["--help"])).toEqual({ help: true });
    expect(parseBackfillArgs(["-h"])).toEqual({ help: true });
  });

  it("ошибки: нет числа, неверное число, лишний аргумент", () => {
    expect(parseBackfillArgs(["--limit"])).toEqual({ error: "после --limit нужно число" });
    expect(parseBackfillArgs(["--limit", "0"])).toHaveProperty("error");
    expect(parseBackfillArgs(["--force"])).toEqual({ error: "неизвестный аргумент «--force»" });
  });
});

describe("isBackfillFailure", () => {
  it.each(["no_translator", "no_store", "usage_unavailable", "AUTH", "store_error"] as const)("%s — сбой", (stopped) => {
    expect(isBackfillFailure(report({ stopped }))).toBe(true);
  });

  it.each([null, "budget_exhausted", "QUOTA_EXCEEDED", "RATE_LIMITED", "UNAVAILABLE", "BAD_REQUEST"] as const)(
    "%s — штатно, следующий запуск продолжит",
    (stopped) => {
      expect(isBackfillFailure(report({ stopped }))).toBe(false);
    },
  );
});
