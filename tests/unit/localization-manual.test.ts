// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { descriptionHash } from "@/lib/localization/hash";
import { mergeShikimori, needsMachineTranslation, resolveDescription, resolveTitles, withMachineTranslation } from "@/lib/localization/resolve";
import { loadLocalizations, readLocalizations } from "@/lib/localization/service";
import { createMemoryStore, createSupabaseStore, rowToRecord } from "@/lib/localization/store";
import type { LocalizationRecord, LocalizationStore } from "@/lib/localization/types";
import type { AnimeCard, AnimeDescription } from "@/types/anime";

// Ручной текст администратора (этап 6c, ADR-029): важнее автоматического и не затирается ни сверкой
// с Shikimori, ни машинным переводом — в запись, которую пишет импорт, ручные поля не попадают вообще.

const shikimori = vi.hoisted(() => ({ byMalId: new Map<number, unknown>() }));
vi.mock("@/lib/shikimori/api", () => ({ fetchShikimoriByMalIds: async () => shikimori.byMalId }));

/** Публичный клиент Supabase: отдаёт строки с ручным текстом (режим без служебного ключа и E2E). */
const manual = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], asked: [] as number[][] }));
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({
    from: () => ({
      select: () => ({
        in: (_column: string, ids: number[]) => {
          manual.asked.push(ids);
          return { or: async () => ({ data: manual.rows.filter((row) => ids.includes(row.anilist_id as number)), error: null }) };
        },
      }),
    }),
  }),
}));

const record = (overrides: Partial<LocalizationRecord> = {}): LocalizationRecord => ({
  anilistId: 1,
  malId: 1001,
  titleRu: "Звёздный город",
  synonymsRu: [],
  descriptionRu: "Сюжет с Shikimori.",
  source: "shikimori",
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
const card = (title: string, altTitle: string | null = null) => ({ id: 1, malId: 1001, title, altTitle }) as unknown as AnimeCard;
const SHIKI = { malId: 1001, titleRu: "Новое название Shikimori", synonymsRu: ["Синоним"], descriptionRu: "Новый сюжет.", url: "https://shikimori.io/animes/1001" };

beforeEach(() => {
  shikimori.byMalId = new Map();
  manual.rows = [];
  manual.asked = [];
});

describe("показ: ручной текст важнее автоматического", () => {
  it("ручное название заменяет название Shikimori", () => {
    const resolved = resolveTitles(card("Star City"), record({ manualTitleRu: "Город звёзд" }));
    expect(resolved.title).toBe("Город звёзд");
    expect(resolved.altTitle).toBe("Star City");
  });

  it("без ручного названия — название Shikimori, как раньше", () => {
    expect(resolveTitles(card("Star City"), record()).title).toBe("Звёздный город");
  });

  it("ручное описание важнее Shikimori и машинного перевода и не несёт подписи источника", () => {
    const manual = { language: "ru", source: "manual", text: "Описание редакции." };
    expect(resolveDescription(english, record({ manualDescriptionRu: "Описание редакции." }), HASH)).toEqual(manual);
    const machine = record({ descriptionRu: "Перевод.", source: "machine", sourceHash: HASH, translator: "deepl", manualDescriptionRu: "Описание редакции." });
    expect(resolveDescription(english, machine, HASH)).toEqual(manual);
    expect(resolveDescription(null, record({ descriptionRu: null, source: null, manualDescriptionRu: "Описание редакции." }), null)).toEqual(manual);
  });

  it("ручное описание есть — машинный перевод не заказывается", () => {
    const bare = record({ descriptionRu: null, source: null });
    expect(needsMachineTranslation(bare, HASH)).toBe(true);
    expect(needsMachineTranslation({ ...bare, manualDescriptionRu: "Описание редакции." }, HASH)).toBe(false);
  });
});

describe("запись: импорт и перевод не трогают ручные поля", () => {
  const withManual = record({ manualTitleRu: "Город звёзд", manualDescriptionRu: "Описание редакции." });

  it("строка сверки с Shikimori не содержит ручных полей", () => {
    const merged = mergeShikimori(1, 1001, withManual, SHIKI);
    expect(merged.titleRu).toBe("Новое название Shikimori");
    expect(merged).not.toHaveProperty("manualTitleRu");
    expect(merged).not.toHaveProperty("manualDescriptionRu");
    expect(mergeShikimori(1, 1001, withManual, undefined)).not.toHaveProperty("manualTitleRu");
  });

  it("строка машинного перевода не содержит ручных полей", () => {
    const translated = withMachineTranslation(1, 1001, withManual, "Перевод.", HASH, "deepl");
    expect(translated).not.toHaveProperty("manualTitleRu");
    expect(translated).not.toHaveProperty("manualDescriptionRu");
  });

  it("upsert в Supabase не отправляет колонки manual_* — база их не меняет", async () => {
    const sent: Record<string, unknown>[] = [];
    const client = {
      from: () => ({
        upsert: async (rows: Record<string, unknown>[]) => {
          sent.push(...rows);
          return { error: null };
        },
      }),
    };
    const store = createSupabaseStore(client as never);
    // Даже если запись с ручными полями попала в upsertMany (как объект из чтения) — в базу они не уходят.
    await store.upsertMany([withManual, mergeShikimori(1, 1001, withManual, SHIKI)]);
    expect(sent).toHaveLength(2);
    for (const row of sent) {
      expect(Object.keys(row).filter((key) => key.startsWith("manual"))).toEqual([]);
      expect(row).toHaveProperty("title_ru");
    }
  });

  it("строка базы читается вместе с ручными полями", () => {
    const row = {
      anilist_id: 1,
      mal_id: 1001,
      title_ru: "Звёздный город",
      synonyms_ru: [],
      description_ru: null,
      source: null,
      source_hash: null,
      translator: null,
      shikimori_url: null,
      manual_title_ru: "Город звёзд",
      manual_description_ru: "Описание редакции.",
      updated_at: "2026-11-01T00:00:00.000Z",
    };
    expect(rowToRecord(row)).toMatchObject({ manualTitleRu: "Город звёзд", manualDescriptionRu: "Описание редакции." });
  });

  it("сверка с Shikimori: ручной текст остаётся в ответе и после сохранения", async () => {
    // Строка старше недели — loadLocalizations идёт в Shikimori и пишет обновление в хранилище.
    const stale = record({ manualTitleRu: "Город звёзд", manualDescriptionRu: "Описание редакции.", updatedAt: "2026-01-01T00:00:00.000Z" });
    const saved: unknown[] = [];
    const store: LocalizationStore = {
      kind: "supabase",
      getMany: async () => new Map([[1, stale]]),
      upsertMany: async (rows) => {
        saved.push(...rows);
      },
    };
    shikimori.byMalId = new Map([[1001, SHIKI]]);

    const { records } = await loadLocalizations([{ id: 1, malId: 1001 }], store);
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty("manualTitleRu");
    expect(records.get(1)).toMatchObject({
      titleRu: "Новое название Shikimori",
      manualTitleRu: "Город звёзд",
      manualDescriptionRu: "Описание редакции.",
    });
  });

  it("без служебного ключа (хранилище в памяти) ручной текст читается из базы публичным клиентом", async () => {
    const store = createMemoryStore();
    await store.upsertMany([mergeShikimori(1, 1001, undefined, SHIKI)]);
    manual.rows = [
      { anilist_id: 1, manual_title_ru: "Город звёзд", manual_description_ru: null },
      { anilist_id: 2, manual_title_ru: null, manual_description_ru: "Описание без строки перевода." },
    ];

    const { records, ok } = await readLocalizations([1, 2, 3], store);
    expect(ok).toBe(true);
    expect(records.get(1)).toMatchObject({ titleRu: "Новое название Shikimori", manualTitleRu: "Город звёзд", manualDescriptionRu: null });
    expect(records.get(2)).toMatchObject({ titleRu: null, malId: null, manualDescriptionRu: "Описание без строки перевода." });
    expect(records.has(3)).toBe(false);
    expect(manual.asked).toEqual([[1, 2, 3]]);
  });

  it("хранилище Supabase отдаёт ручные поля само — второго запроса нет", async () => {
    const store: LocalizationStore = { kind: "supabase", getMany: async () => new Map([[1, withManual]]), upsertMany: async () => {} };
    manual.rows = [{ anilist_id: 1, manual_title_ru: "Чужое", manual_description_ru: null }];
    const { records } = await readLocalizations([1], store);
    expect(records.get(1)?.manualTitleRu).toBe("Город звёзд");
    expect(manual.asked).toEqual([]);
  });
});
