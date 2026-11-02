// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runTranslationBackfill, type TranslationCandidate } from "@/lib/localization/backfill";
import { chunkForTranslation, jsonTextBytes } from "@/lib/localization/batches";
import {
  createUsageTracker,
  DEFAULT_MONTHLY_CHAR_LIMIT,
  monthlyCharLimit,
  remainingBudget,
  runCharLimit,
} from "@/lib/localization/budget";
import { descriptionHash } from "@/lib/localization/hash";
import { createMemoryStore } from "@/lib/localization/store";
import type { Translator, TranslatorUsage } from "@/lib/localization/translator";
import { TranslatorError } from "@/lib/localization/translators/errors";
import type { LocalizationStore } from "@/lib/localization/types";

const resetUsageCache = () =>
  delete (globalThis as { __animeTownTranslatorUsage?: unknown }).__animeTownTranslatorUsage;

/** Фальшивый переводчик: «RU: текст», расход = длина текста. */
function fakeTranslator(usage: TranslatorUsage | null = { used: 0, limit: 500_000 }, overrides: Partial<Translator> = {}) {
  const translate = vi.fn(async (texts: string[]) => ({
    texts: texts.map((text) => `RU: ${text}`),
    billedCharacters: texts.reduce((sum, text) => sum + text.length, 0),
  }));
  const getUsage = vi.fn(async () => usage);
  const translator: Translator = {
    name: "deepl",
    label: "DeepL",
    maxBatchTexts: 2,
    maxBatchBytes: 10_000,
    translate,
    getUsage,
    ...overrides,
  };
  return { translator, translate, getUsage };
}

const candidate = (id: number, description: string, malId: number | null = null): TranslationCandidate => ({
  id,
  malId,
  description,
});

const E2E_ENV = { ANIME_TOWN_E2E: "1" };

describe("бюджет", () => {
  it("лимиты из окружения: по умолчанию 450 000 в месяц и 15 000 за запуск", () => {
    expect(monthlyCharLimit({})).toBe(DEFAULT_MONTHLY_CHAR_LIMIT);
    expect(monthlyCharLimit({ TRANSLATE_MONTHLY_CHAR_LIMIT: "100000" })).toBe(100_000);
    expect(monthlyCharLimit({ TRANSLATE_MONTHLY_CHAR_LIMIT: "-5" })).toBe(450_000);
    expect(runCharLimit({})).toBe(15_000);
  });

  it("остаток — меньший из своего лимита и лимита провайдера минус расход", () => {
    expect(remainingBudget({ used: 100_000, limit: 500_000 }, 450_000)).toBe(350_000);
    expect(remainingBudget({ used: 100_000, limit: 120_000 }, 450_000)).toBe(20_000);
    expect(remainingBudget({ used: 460_000, limit: 500_000 }, 450_000)).toBe(0);
  });

  it("/v2/usage кэшируется, расход учитывается локально, 456 обнуляет остаток", async () => {
    resetUsageCache();
    let time = 0;
    const { translator, getUsage } = fakeTranslator({ used: 1000, limit: 500_000 });
    const tracker = createUsageTracker(translator, { now: () => time, ttlMs: 60_000 });

    await tracker.current();
    tracker.record(500);
    expect(await tracker.current()).toEqual({ used: 1500, limit: 500_000 });
    expect(getUsage).toHaveBeenCalledTimes(1);

    tracker.markExhausted();
    expect(await tracker.current()).toEqual({ used: 500_000, limit: 500_000 });

    time = 61_000;
    await tracker.current();
    expect(getUsage).toHaveBeenCalledTimes(2);
  });
});

describe("пачки", () => {
  it("не больше maxTexts текстов и maxBytes байт; слишком большой текст — отдельно", () => {
    const items = ["a", "b", "c", "x".repeat(500), "d"].map((text) => ({ text }));
    const { batches, oversized } = chunkForTranslation(items, 2, 400);
    expect(batches.map((batch) => batch.map((item) => item.text))).toEqual([["a", "b"], ["c", "d"]]);
    expect(oversized).toHaveLength(1);
  });

  it("учитывает кириллицу и экранирование в байтах", () => {
    expect(jsonTextBytes("ab")).toBe(5); // "ab" + запятая
    expect(jsonTextBytes("я")).toBe(5); // 2 байта UTF-8 + кавычки + запятая
    expect(jsonTextBytes('"')).toBe(5); // \" + кавычки + запятая
  });
});

describe("runTranslationBackfill", () => {
  beforeEach(resetUsageCache);
  afterEach(() => vi.restoreAllMocks());

  it("без переводчика и без базы (вне E2E) ничего не тратит", async () => {
    await expect(runTranslationBackfill({ translator: null, env: {} })).resolves.toMatchObject({ stopped: "no_translator" });

    const { translator, translate } = fakeTranslator();
    const report = await runTranslationBackfill({ translator, store: createMemoryStore(), env: {}, fetchCandidates: async () => [] });
    expect(report.stopped).toBe("no_store");
    expect(translate).not.toHaveBeenCalled();
  });

  it("переводит пачками, сохраняет source=machine, хеш и провайдера; повторно не переводит", async () => {
    const store = createMemoryStore();
    const { translator, translate } = fakeTranslator();
    const candidates = [candidate(1, "One."), candidate(2, "Two."), candidate(3, "Three.")];

    const report = await runTranslationBackfill({ translator, store, env: E2E_ENV, fetchCandidates: async () => candidates });

    expect(report).toMatchObject({ candidates: 3, pending: 3, translated: 3, batches: 2, characters: 14, stopped: null });
    expect(translate.mock.calls.map(([texts]) => texts)).toEqual([["One.", "Two."], ["Three."]]);
    const saved = (await store.getMany([1])).get(1);
    expect(saved).toMatchObject({
      descriptionRu: "RU: One.",
      source: "machine",
      sourceHash: descriptionHash("One."),
      translator: "deepl",
    });
    expect(report.usage).toEqual({ used: 14, limit: 500_000, ownLimit: 450_000 });

    // Второй запуск: хеши совпали — ни одного запроса к переводчику.
    const again = await runTranslationBackfill({ translator, store, env: E2E_ENV, fetchCandidates: async () => candidates });
    expect(again).toMatchObject({ pending: 0, translated: 0 });
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it("AniList изменил описание — перевод делается заново", async () => {
    const store = createMemoryStore();
    const { translator } = fakeTranslator();
    await runTranslationBackfill({ translator, store, env: E2E_ENV, fetchCandidates: async () => [candidate(1, "Old.")] });

    const report = await runTranslationBackfill({ translator, store, env: E2E_ENV, fetchCandidates: async () => [candidate(1, "New.")] });

    expect(report.translated).toBe(1);
    expect((await store.getMany([1])).get(1)?.descriptionRu).toBe("RU: New.");
  });

  it("описание Shikimori важнее: такие тайтлы не переводятся", async () => {
    const store = createMemoryStore();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { animes: [{ malId: "1001", russian: "Звёздный город", synonyms: [], description: "Сюжет.", url: null }] },
        }),
      ),
    );
    const { translator, translate } = fakeTranslator();

    const report = await runTranslationBackfill({
      translator,
      store,
      env: E2E_ENV,
      fetchCandidates: async () => [candidate(1, "Story.", 1001), candidate(2, "Other.")],
    });

    expect(report).toMatchObject({ pending: 1, translated: 1 });
    expect(translate.mock.calls[0][0]).toEqual(["Other."]);
    expect((await store.getMany([1])).get(1)?.source).toBe("shikimori");
  });

  it("свой месячный лимит: переводит только то, что помещается, и останавливается", async () => {
    const { translator, translate } = fakeTranslator({ used: 440, limit: 500_000 });
    const report = await runTranslationBackfill({
      translator,
      store: createMemoryStore(),
      env: { ...E2E_ENV, TRANSLATE_MONTHLY_CHAR_LIMIT: "450" },
      fetchCandidates: async () => [candidate(1, "12345"), candidate(2, "1234567890")],
    });

    expect(report).toMatchObject({ translated: 1, characters: 5, stopped: "budget_exhausted" });
    expect(translate.mock.calls[0][0]).toEqual(["12345"]);
  });

  it("квота уже исчерпана — ни одного запроса на перевод", async () => {
    const { translator, translate } = fakeTranslator({ used: 500_000, limit: 500_000 });
    const report = await runTranslationBackfill({
      translator,
      store: createMemoryStore(),
      env: E2E_ENV,
      fetchCandidates: async () => [candidate(1, "One.")],
    });
    expect(report.stopped).toBe("budget_exhausted");
    expect(translate).not.toHaveBeenCalled();
  });

  it("456 от провайдера — остановка до следующего периода, остаток обнулён", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { translator } = fakeTranslator(undefined, {
      translate: vi.fn(async () => {
        throw new TranslatorError("QUOTA_EXCEEDED", "Квота DeepL исчерпана (456)", { status: 456 });
      }),
    });
    const report = await runTranslationBackfill({
      translator,
      store: createMemoryStore(),
      env: E2E_ENV,
      fetchCandidates: async () => [candidate(1, "One."), candidate(2, "Two."), candidate(3, "Three.")],
    });

    expect(report).toMatchObject({ stopped: "QUOTA_EXCEEDED", translated: 0, batches: 0 });
    expect(report.usage?.used).toBe(report.usage?.limit);
  });

  it("403 и временные сбои не роняют задачу; usage недоступен — не переводим", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = fakeTranslator(undefined, {
      getUsage: vi.fn(async () => {
        throw new TranslatorError("AUTH", "DeepL отклонил ключ (403)", { status: 403 });
      }),
    });
    await expect(
      runTranslationBackfill({ translator: auth.translator, store: createMemoryStore(), env: E2E_ENV, fetchCandidates: async () => [candidate(1, "x")] }),
    ).resolves.toMatchObject({ stopped: "AUTH", translated: 0 });

    const silent = fakeTranslator(null);
    await expect(
      runTranslationBackfill({ translator: silent.translator, store: createMemoryStore(), env: E2E_ENV, fetchCandidates: async () => [candidate(1, "x")] }),
    ).resolves.toMatchObject({ stopped: "usage_unavailable" });
    expect(silent.translate).not.toHaveBeenCalled();
  });

  it("сбой записи в базу — остановка без потери остальных символов", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: LocalizationStore = { ...createMemoryStore(), upsertMany: async () => Promise.reject(new Error("db down")) };
    const { translator, translate } = fakeTranslator();
    const report = await runTranslationBackfill({
      translator,
      store: broken,
      env: E2E_ENV,
      fetchCandidates: async () => [candidate(1, "One."), candidate(2, "Two."), candidate(3, "Three.")],
    });
    expect(report).toMatchObject({ stopped: "store_error", translated: 0, batches: 1 });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("limit ограничивает число тайтлов за запуск", async () => {
    const { translator } = fakeTranslator();
    const report = await runTranslationBackfill({
      translator,
      store: createMemoryStore(),
      env: E2E_ENV,
      limit: 2,
      fetchCandidates: async () => [candidate(1, "A."), candidate(2, "B."), candidate(3, "C.")],
    });
    expect(report).toMatchObject({ pending: 2, translated: 2 });
  });

  it("limit считается после отбора: уже переведённые тайтлы место в limit не занимают", async () => {
    const store = createMemoryStore();
    const { translator, translate } = fakeTranslator();
    await runTranslationBackfill({ translator, store, env: E2E_ENV, fetchCandidates: async () => [candidate(1, "A.")] });

    const report = await runTranslationBackfill({
      translator,
      store,
      env: E2E_ENV,
      limit: 1,
      fetchCandidates: async () => [candidate(1, "A."), candidate(2, "B."), candidate(3, "C.")],
    });
    expect(report).toMatchObject({ candidates: 3, pending: 1, translated: 1 });
    expect(translate.mock.calls[1][0]).toEqual(["B."]);
  });

  it("бюджет запуска (TRANSLATE_RUN_CHAR_LIMIT) делится между пачками и останавливает запуск", async () => {
    const { translator, translate } = fakeTranslator();
    const report = await runTranslationBackfill({
      translator,
      store: createMemoryStore(),
      env: { ...E2E_ENV, TRANSLATE_RUN_CHAR_LIMIT: "12" },
      fetchCandidates: async () => [1, 2, 3, 4].map((id) => candidate(id, "1234")),
    });
    // Пачка 1: 8 символов, остаток 4; пачка 2: помещается один текст — остановка.
    expect(report).toMatchObject({ translated: 3, characters: 12, batches: 2, stopped: "budget_exhausted" });
    expect(translate.mock.calls.map(([texts]) => texts.length)).toEqual([2, 1]);
  });

  it("текст больше одного запроса пропускается и считается в skippedOversized", async () => {
    const { translator, translate } = fakeTranslator(undefined, { maxBatchBytes: 300 });
    const report = await runTranslationBackfill({
      translator,
      store: createMemoryStore(),
      env: E2E_ENV,
      fetchCandidates: async () => [candidate(1, "x".repeat(100)), candidate(2, "ok")],
    });
    expect(report).toMatchObject({ pending: 2, skippedOversized: 1, translated: 1, stopped: null });
    expect(translate.mock.calls[0][0]).toEqual(["ok"]);
  });
});
