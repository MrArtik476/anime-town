// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { loadLocalizations } from "@/lib/localization/service";
import { createMemoryStore } from "@/lib/localization/store";
import type { LocalizationStore } from "@/lib/localization/types";
import { fetchShikimoriByMalIds, searchShikimoriMalIds, SHIKIMORI_BATCH_SIZE } from "@/lib/shikimori/api";
import { SHIKIMORI_USER_AGENT } from "@/lib/shikimori/client";
import { cleanShikimoriText } from "@/lib/shikimori/text";
import { createThrottle } from "@/lib/shikimori/throttle";

const freeThrottle = { acquire: async () => true };

const respond = (animes: unknown[]) =>
  new Response(JSON.stringify({ data: { animes } }), { headers: { "Content-Type": "application/json" } });

describe("cleanShikimoriText", () => {
  it("снимает BB-коды, сохраняя текст; [br] — перенос строки", () => {
    expect(
      cleanShikimoriText("[character=186854]Химмель[/character] и [anime=121]Стальной алхимик[/anime].[br][br][i]Конец[/i]"),
    ).toBe("Химмель и Стальной алхимик.\n\nКонец");
    expect(cleanShikimoriText("Текст [url=https://example.com]ссылка[/url].")).toBe("Текст ссылка.");
  });

  it("удаляет спойлеры и служебные источники целиком", () => {
    expect(cleanShikimoriText("Начало. [spoiler=спойлер]Он выживет[/spoiler]Конец.")).toBe("Начало. Конец.");
    expect(cleanShikimoriText("Текст.\n[source]ANN[/source]")).toBe("Текст.");
    expect(cleanShikimoriText("  ")).toBeNull();
    expect(cleanShikimoriText(null)).toBeNull();
  });
});

describe("createThrottle", () => {
  it("держит лимит в секунду: лишние запросы ждут следующего окна", async () => {
    let time = 0;
    const waits: number[] = [];
    const throttle = createThrottle({
      limits: [{ count: 2, windowMs: 1000 }],
      now: () => time,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    expect(await throttle.acquire(5000)).toBe(true);
    expect(await throttle.acquire(5000)).toBe(true);
    expect(await throttle.acquire(5000)).toBe(true);
    expect(waits).toEqual([1000]);
    time = 500;
    expect(await throttle.acquire(5000)).toBe(true);
    expect(waits).toEqual([1000, 500]);
  });

  it("отказывает, если ждать дольше допустимого, и не занимает слот", async () => {
    const throttle = createThrottle({ limits: [{ count: 1, windowMs: 60_000 }], now: () => 0, sleep: async () => {} });
    expect(await throttle.acquire(0)).toBe(true);
    expect(await throttle.acquire(1000)).toBe(false);
    expect(await throttle.acquire(60_000)).toBe(true);
  });

  it("учитывает несколько окон сразу (в секунду и в минуту)", async () => {
    const waits: number[] = [];
    const throttle = createThrottle({
      limits: [
        { count: 4, windowMs: 1000 },
        { count: 5, windowMs: 60_000 },
      ],
      now: () => 0,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    for (let i = 0; i < 5; i++) await throttle.acquire(2000);
    expect(waits).toEqual([1000]);
    expect(await throttle.acquire(2000)).toBe(false);
  });
});

describe("fetchShikimoriByMalIds", () => {
  it("ходит пачками по 50 со своим User-Agent и разбирает ответ", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      respond([
        {
          malId: "16498",
          russian: " Атака титанов ",
          synonyms: ["Вторжение гигантов", "AoT", "Атака титанов", "Атака титанів"],
          description: "[i]Титаны[/i] наступают.",
          url: "https://shikimori.io/animes/16498",
        },
        { malId: null, russian: "Без id", synonyms: [], description: null, url: null },
      ]),
    );
    const ids = Array.from({ length: SHIKIMORI_BATCH_SIZE + 10 }, (_, index) => index + 1);

    const result = await fetchShikimoriByMalIds([...ids, 1, 2], { fetchImpl, throttle: freeThrottle });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [, init] = fetchImpl.mock.calls[0];
    expect(new Headers(init?.headers).get("User-Agent")).toBe(SHIKIMORI_USER_AGENT);
    expect(SHIKIMORI_USER_AGENT).toMatch(/^AnimeTown\//);
    const firstBody = JSON.parse(String(init?.body));
    expect(firstBody.variables.ids.split(",")).toHaveLength(50);
    expect(firstBody.variables.limit).toBe(50);
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body)).variables.limit).toBe(10);

    expect(result.get(16498)).toEqual({
      malId: 16498,
      titleRu: "Атака титанов",
      // Украинский вариант, латиница и повтор основного названия отброшены.
      synonymsRu: ["Вторжение гигантов"],
      descriptionRu: "Титаны наступают.",
      url: "https://shikimori.io/animes/16498",
    });
    expect(result.size).toBe(1);
  });

  it("поиск возвращает MAL id без повторов", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => respond([{ malId: "16498" }, { malId: "16498" }, { malId: "x" }]));
    await expect(searchShikimoriMalIds("Атака титанов", { fetchImpl, throttle: freeThrottle })).resolves.toEqual([16498]);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).variables).toEqual({ search: "Атака титанов", limit: 50 });
  });

  it("ошибка HTTP или GraphQL — исключение ShikimoriError", async () => {
    const http = vi.fn<typeof fetch>(async () => new Response("", { status: 503 }));
    await expect(fetchShikimoriByMalIds([1], { fetchImpl: http, throttle: freeThrottle })).rejects.toMatchObject({
      name: "ShikimoriError",
      status: 503,
    });
    const gql = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ errors: [{ message: "depth" }] })));
    await expect(fetchShikimoriByMalIds([1], { fetchImpl: gql, throttle: freeThrottle })).rejects.toThrow("depth");
  });
});

describe("loadLocalizations", () => {
  const SHIKI_URL = "https://shikimori.io/animes/1001";
  const stubShikimori = (animes: unknown[]) => vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond(animes));

  it("свежая строка из хранилища — без запроса к Shikimori", async () => {
    const store = createMemoryStore();
    await store.upsertMany([
      { anilistId: 1, malId: 1001, titleRu: "Звёздный город", synonymsRu: [], descriptionRu: null, source: null, sourceHash: null, translator: null, shikimoriUrl: null },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { records, complete } = await loadLocalizations([{ id: 1, malId: 1001 }], store);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(records.get(1)?.titleRu).toBe("Звёздный город");
    expect(complete).toBe(true);
    fetchSpy.mockRestore();
  });

  it("нет строки — берёт из Shikimori и сохраняет; тайтлы без MAL id пропускает", async () => {
    const store = createMemoryStore();
    const fetchSpy = stubShikimori([
      { malId: "1001", russian: "Звёздный город", synonyms: [], description: "Сюжет.", url: SHIKI_URL },
    ]);

    const { records, complete } = await loadLocalizations(
      [
        { id: 1, malId: 1001 },
        { id: 2, malId: null },
      ],
      store,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(records.get(1)).toMatchObject({ descriptionRu: "Сюжет.", source: "shikimori", shikimoriUrl: SHIKI_URL });
    expect(records.has(2)).toBe(false);
    expect((await store.getMany([1])).get(1)?.source).toBe("shikimori");
    expect(complete).toBe(true);
    fetchSpy.mockRestore();
  });

  it("Shikimori недоступен — страница работает без русских данных, результат помечен неполным", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { records, complete } = await loadLocalizations([{ id: 1, malId: 1001 }], createMemoryStore());

    expect(records.size).toBe(0);
    expect(complete).toBe(false);
    fetchSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("хранилище недоступно — данные Shikimori всё равно показываются", async () => {
    const broken: LocalizationStore = {
      kind: "supabase",
      getMany: async () => {
        throw new Error("db down");
      },
      upsertMany: async () => {
        throw new Error("db down");
      },
    };
    const fetchSpy = stubShikimori([{ malId: "1001", russian: "Звёздный город", synonyms: [], description: null, url: null }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { records, complete } = await loadLocalizations([{ id: 1, malId: 1001 }], broken);

    expect(records.get(1)?.titleRu).toBe("Звёздный город");
    expect(complete).toBe(false);
    fetchSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
