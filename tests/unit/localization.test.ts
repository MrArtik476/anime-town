// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { paginateMalIdResults, toMalIdVariables } from "@/lib/anime/catalog-params";
import { EMPTY_FILTERS } from "@/lib/anime/catalog-params";
import { descriptionHash } from "@/lib/localization/hash";
import {
  mergeShikimori,
  needsMachineTranslation,
  needsShikimoriRefresh,
  resolveDescription,
  resolveTitles,
  SHIKIMORI_REFRESH_MS,
  withMachineTranslation,
} from "@/lib/localization/resolve";
import { hasCyrillic, isRussianText } from "@/lib/localization/text";
import { getTranslator } from "@/lib/localization/translator";
import type { LocalizationRecord } from "@/lib/localization/types";
import type { AnimeCard, AnimeDescription } from "@/types/anime";

const record = (overrides: Partial<LocalizationRecord> = {}): LocalizationRecord => ({
  anilistId: 1,
  malId: 1001,
  titleRu: "Звёздный город",
  synonymsRu: [],
  descriptionRu: null,
  source: null,
  sourceHash: null,
  translator: null,
  shikimoriUrl: "https://shikimori.io/animes/1001",
  manualTitleRu: null,
  manualDescriptionRu: null,
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

const english: AnimeDescription = { language: "en", source: "anilist", text: "A story." };
const HASH = descriptionHash("A story.");

describe("кириллица", () => {
  it("hasCyrillic — любой кириллический символ, isRussianText — без украинских и белорусских букв", () => {
    expect(hasCyrillic("Атака титанов")).toBe(true);
    expect(hasCyrillic("Attack on Titan")).toBe(false);
    expect(hasCyrillic("Naruto ёж")).toBe(true);
    expect(hasCyrillic(null)).toBe(false);
    expect(isRussianText("Стальной алхимик")).toBe(true);
    expect(isRussianText("Сталевий алхімік")).toBe(false);
  });
});

describe("descriptionHash", () => {
  it("SHA-256 в hex, устойчив к пробелам по краям и меняется вместе с текстом", () => {
    expect(HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(descriptionHash("  A story. ")).toBe(HASH);
    expect(descriptionHash("A story!")).not.toBe(HASH);
  });
});

describe("resolveDescription: Shikimori → машинный перевод → оригинал", () => {
  it("Shikimori важнее всего и несёт ссылку для атрибуции", () => {
    const result = resolveDescription(english, record({ descriptionRu: "Сюжет.", source: "shikimori" }), HASH);
    expect(result).toEqual({
      language: "ru",
      source: "shikimori",
      text: "Сюжет.",
      sourceUrl: "https://shikimori.io/animes/1001",
    });
  });

  it("машинный перевод — только если сделан с текущего английского текста", () => {
    const machine = record({ descriptionRu: "Перевод.", source: "machine", sourceHash: HASH, translator: "deepl" });
    expect(resolveDescription(english, machine, HASH)).toEqual({
      language: "ru",
      source: "machine",
      text: "Перевод.",
      translator: "DeepL",
    });
    // AniList изменил описание — перевод устарел, показываем оригинал (и переводим заново).
    expect(resolveDescription(english, machine, descriptionHash("New story."))).toEqual(english);
    // Неизвестный (будущий) провайдер — подпись по идентификатору.
    expect(resolveDescription(english, { ...machine, translator: "acme" }, HASH)).toMatchObject({ translator: "acme" });
  });

  it("needsMachineTranslation: не переводить при описании Shikimori и при совпавшем хеше", () => {
    expect(needsMachineTranslation(undefined, HASH)).toBe(true);
    expect(needsMachineTranslation(record(), HASH)).toBe(true);
    expect(needsMachineTranslation(record({ descriptionRu: "Сюжет.", source: "shikimori" }), HASH)).toBe(false);
    const machine = record({ descriptionRu: "Перевод.", source: "machine", sourceHash: HASH, translator: "deepl" });
    expect(needsMachineTranslation(machine, HASH)).toBe(false);
    expect(needsMachineTranslation(machine, descriptionHash("New story."))).toBe(true);
  });

  it("без русского описания — английский оригинал или null", () => {
    expect(resolveDescription(english, record(), HASH)).toEqual(english);
    expect(resolveDescription(english, undefined, HASH)).toEqual(english);
    expect(resolveDescription(null, undefined, null)).toBeNull();
  });
});

describe("resolveTitles: Shikimori → синоним AniList → английское", () => {
  const card = (title: string, altTitle: string | null): AnimeCard => ({
    id: 1,
    malId: 1001,
    title,
    altTitle,
    coverUrl: null,
    coverColor: null,
    year: null,
    format: null,
    status: null,
    season: null,
    episodes: null,
    score: null,
    genres: [],
  });

  it("английское основное название становится альтернативным", () => {
    expect(resolveTitles(card("Attack on Titan", "Shingeki no Kyojin"), record({ titleRu: "Атака титанов" }))).toMatchObject({
      title: "Атака титанов",
      altTitle: "Attack on Titan",
    });
  });

  it("русский синоним AniList заменяется, альтернативное название сохраняется", () => {
    expect(resolveTitles(card("Ван-Пис", "ONE PIECE"), record({ titleRu: "Ван Пис" }))).toMatchObject({
      title: "Ван Пис",
      altTitle: "ONE PIECE",
    });
  });

  it("без названия Shikimori карточка не меняется", () => {
    const original = card("Star Town", "Hoshi no Machi");
    expect(resolveTitles(original, record({ titleRu: null }))).toBe(original);
    expect(resolveTitles(original, undefined)).toBe(original);
  });
});

describe("сверка с Shikimori", () => {
  const now = Date.parse("2026-11-01T00:00:00.000Z");

  it("needsShikimoriRefresh: нет строки, сменился MAL id или прошла неделя", () => {
    expect(needsShikimoriRefresh(1001, undefined, now)).toBe(true);
    expect(needsShikimoriRefresh(1001, record(), now)).toBe(false);
    expect(needsShikimoriRefresh(1002, record(), now)).toBe(true);
    expect(needsShikimoriRefresh(1001, record(), now + SHIKIMORI_REFRESH_MS + 1)).toBe(true);
    expect(needsShikimoriRefresh(null, undefined, now)).toBe(false);
  });

  it("описание Shikimori вытесняет машинный перевод", () => {
    const previous = record({ descriptionRu: "Перевод.", source: "machine", sourceHash: HASH });
    const merged = mergeShikimori(1, 1001, previous, {
      malId: 1001,
      titleRu: "Звёздный город",
      synonymsRu: ["Хосимати"],
      descriptionRu: "Сюжет.",
      url: "https://shikimori.io/animes/1001",
    });
    expect(merged).toMatchObject({ descriptionRu: "Сюжет.", source: "shikimori", sourceHash: null, synonymsRu: ["Хосимати"] });
  });

  it("нет описания на Shikimori — машинный перевод сохраняется", () => {
    const previous = record({ descriptionRu: "Перевод.", source: "machine", sourceHash: HASH });
    const merged = mergeShikimori(1, 1001, previous, {
      malId: 1001,
      titleRu: "Новое название",
      synonymsRu: [],
      descriptionRu: null,
      url: null,
    });
    expect(merged).toMatchObject({ titleRu: "Новое название", descriptionRu: "Перевод.", source: "machine", sourceHash: HASH });
  });

  it("тайтла нет на Shikimori — прежние данные не теряются", () => {
    const previous = record({ descriptionRu: "Сюжет.", source: "shikimori" });
    expect(mergeShikimori(1, 1001, previous, undefined)).toMatchObject({ titleRu: "Звёздный город", source: "shikimori" });
    expect(mergeShikimori(5, 1005, undefined, undefined)).toMatchObject({ anilistId: 5, malId: 1005, titleRu: null, source: null });
  });

  it("машинный перевод сохраняет название и ссылку Shikimori", () => {
    expect(withMachineTranslation(1, 1001, record(), "Перевод.", HASH, "deepl")).toMatchObject({
      titleRu: "Звёздный город",
      shikimoriUrl: "https://shikimori.io/animes/1001",
      descriptionRu: "Перевод.",
      source: "machine",
      sourceHash: HASH,
      translator: "deepl",
    });
  });
});

describe("русский поиск: MAL id → AniList", () => {
  it("переменные AniList: idMal_in без search, «по совпадению» → популярность", () => {
    const variables = toMalIdVariables({ ...EMPTY_FILTERS, q: "Атака", genre: "Action" }, [16498, 1001]);
    expect(variables).toMatchObject({ search: null, idMalIn: [16498, 1001], perPage: 2, page: 1, genre: "Action" });
    expect(variables.sort).toEqual(["POPULARITY_DESC"]);
    expect(toMalIdVariables({ ...EMPTY_FILTERS, q: "Атака", sort: "score" }, [1]).sort).toEqual([
      "SCORE_DESC",
      "POPULARITY_DESC",
    ]);
  });

  it("«по совпадению» сохраняет порядок Shikimori и режет на страницы по 24", () => {
    const malIds = Array.from({ length: 30 }, (_, index) => 100 + index);
    const items = [...malIds].reverse().map((malId) => ({ malId }));
    const first = paginateMalIdResults(items, malIds, { ...EMPTY_FILTERS, q: "тест" }, 1);
    expect(first.items.map((item) => item.malId).slice(0, 3)).toEqual([100, 101, 102]);
    expect(first).toMatchObject({ page: 1, hasNextPage: true });
    expect(first.items).toHaveLength(24);

    const second = paginateMalIdResults(items, malIds, { ...EMPTY_FILTERS, q: "тест" }, 2);
    expect(second.items).toHaveLength(6);
    expect(second.hasNextPage).toBe(false);
  });

  it("другая сортировка — порядок AniList", () => {
    const items = [{ malId: 2 }, { malId: 1 }];
    expect(paginateMalIdResults(items, [1, 2], { ...EMPTY_FILTERS, q: "тест", sort: "score" }, 1).items).toEqual(items);
  });
});

describe("getTranslator", () => {
  it("без провайдера машинного перевода нет", () => {
    expect(getTranslator({ NODE_ENV: "test" })).toBeNull();
  });

  it("deepl: ключ из DEEPL_API_KEY или TRANSLATOR_API_KEY, без ключа — выключен", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getTranslator({ TRANSLATOR_PROVIDER: "deepl", DEEPL_API_KEY: "test-key:fx" })).toMatchObject({ name: "deepl", label: "DeepL" });
    expect(getTranslator({ TRANSLATOR_PROVIDER: "DeepL", TRANSLATOR_API_KEY: "test-key:fx" })?.name).toBe("deepl");
    expect(getTranslator({ TRANSLATOR_PROVIDER: "deepl" })).toBeNull();
    expect(getTranslator({ TRANSLATOR_PROVIDER: "unknown", TRANSLATOR_API_KEY: "x" })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
