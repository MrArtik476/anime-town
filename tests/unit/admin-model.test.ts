import { describe, expect, it } from "vitest";

import {
  adminErrorMessage,
  durationToInput,
  parseAnimeId,
  parseDuration,
  parseEpisodeInput,
  parseRole,
  parseSubtitleInput,
  summarizeTitles,
  userSearchPattern,
} from "@/features/admin/model";

const episode = {
  number: "3",
  title: "  Начало  ",
  duration: "24:10",
  licenseStatus: "own",
  hlsUrl: "/media/test/master.m3u8",
  attribution: "",
  attributionUrl: "",
};

describe("parseAnimeId", () => {
  it("принимает положительное целое", () => {
    expect(parseAnimeId("21")).toBe(21);
    expect(parseAnimeId(7)).toBe(7);
    expect(parseAnimeId(" 15 ")).toBe(15);
  });
  it("отклоняет остальное", () => {
    for (const raw of ["0", "-1", "1.5", "abc", "", "1234567890", null, undefined, {}]) expect(parseAnimeId(raw)).toBeNull();
  });
});

describe("parseDuration", () => {
  it("разбирает мм:сс, ч:мм:сс и секунды", () => {
    expect(parseDuration("24:10")).toBe(1450);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("120:00")).toBe(7200);
    expect(parseDuration(6)).toBe(6);
  });
  it("пусто — длительность не указана", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("   ")).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });
  it("неразборчивый ввод — undefined", () => {
    for (const raw of ["24:70", "abc", "0", "0:00", "1:75:00", "-5", "25:00:00", 0, 1.5, {}]) expect(parseDuration(raw)).toBeUndefined();
  });
  it("durationToInput обратен разбору", () => {
    expect(durationToInput(1450)).toBe("24:10");
    expect(durationToInput(3723)).toBe("1:02:03");
    expect(durationToInput(6)).toBe("0:06");
    expect(durationToInput(null)).toBe("");
    expect(parseDuration(durationToInput(3723))).toBe(3723);
  });
});

describe("parseEpisodeInput", () => {
  it("нормализует корректную серию", () => {
    expect(parseEpisodeInput(episode)).toEqual({
      ok: true,
      value: {
        number: 3,
        title: "Начало",
        durationSec: 1450,
        licenseStatus: "own",
        hlsUrl: "/media/test/master.m3u8",
        attribution: null,
        attributionUrl: null,
      },
    });
  });

  it.each([
    [{ number: "0" }, "Номер серии"],
    [{ number: "10001" }, "Номер серии"],
    [{ number: "1.5" }, "Номер серии"],
    [{ number: "" }, "Номер серии"],
    [{ title: "я".repeat(301) }, "Название"],
    [{ duration: "abc" }, "Длительность"],
    [{ licenseStatus: "pirate" }, "статус прав"],
    [{ hlsUrl: "http://example.com/a.m3u8" }, "Адрес видео"],
    [{ hlsUrl: "https://example.com/a.mp4" }, "Адрес видео"],
    [{ hlsUrl: "" }, "Адрес видео"],
    [{ hlsUrl: "javascript:alert(1)//.m3u8" }, "Адрес видео"],
    [{ licenseStatus: "open_license" }, "атрибуцию"],
    [{ attribution: "a".repeat(501) }, "Атрибуция"],
    [{ attributionUrl: "http://example.com" }, "https://"],
  ])("отклоняет %o", (patch, fragment) => {
    const result = parseEpisodeInput({ ...episode, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(fragment);
  });

  it("открытая лицензия с атрибуцией проходит", () => {
    const result = parseEpisodeInput({
      ...episode,
      licenseStatus: "open_license",
      hlsUrl: "https://cdn.example.com/bbb/master.m3u8?v=2",
      attribution: "Big Buck Bunny © Blender Foundation, CC BY 3.0",
      attributionUrl: "https://peach.blender.org/",
    });
    expect(result.ok).toBe(true);
  });

  it("не объект — отказ", () => {
    expect(parseEpisodeInput(null).ok).toBe(false);
    expect(parseEpisodeInput("x").ok).toBe(false);
  });
});

describe("parseSubtitleInput", () => {
  const subtitle = { lang: "ru", label: " Русские ", url: "/media/test/subtitles.ru.vtt", isDefault: true };
  it("нормализует корректные субтитры", () => {
    expect(parseSubtitleInput(subtitle)).toEqual({
      ok: true,
      value: { lang: "ru", label: "Русские", url: "/media/test/subtitles.ru.vtt", isDefault: true },
    });
    expect(parseSubtitleInput({ ...subtitle, lang: "pt-BR", isDefault: "yes" })).toMatchObject({ ok: true, value: { lang: "pt-BR", isDefault: false } });
  });
  it.each([
    [{ lang: "RU" }, "Язык"],
    [{ lang: "rus" }, "Язык"],
    [{ label: "" }, "Подпись"],
    [{ label: "a".repeat(61) }, "Подпись"],
    [{ url: "https://example.com/a.srt" }, "Адрес субтитров"],
    [{ url: "ftp://example.com/a.vtt" }, "Адрес субтитров"],
  ])("отклоняет %o", (patch, fragment) => {
    const result = parseSubtitleInput({ ...subtitle, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(fragment);
  });
});

describe("parseRole и userSearchPattern", () => {
  it("роль — только из списка", () => {
    expect(parseRole("moderator")).toBe("moderator");
    expect(parseRole("root")).toBeNull();
    expect(parseRole(undefined)).toBeNull();
  });
  it("шаблон поиска без спецсимволов ilike", () => {
    expect(userSearchPattern("Sakura")).toBe("%Sakura%");
    expect(userSearchPattern(" a_b%c,d)(.* ")).toBe("%a\\_bcd%");
    expect(userSearchPattern("Ёжик")).toBe("%Ёжик%");
    expect(userSearchPattern("%%%")).toBeNull();
    expect(userSearchPattern(42)).toBeNull();
    expect(userSearchPattern("x".repeat(40))).toBe(`%${"x".repeat(24)}%`);
  });
});

describe("adminErrorMessage", () => {
  it("переводит коды базы", () => {
    expect(adminErrorMessage({ code: "23505" }, "episodes")).toBe("Серия с таким номером уже есть");
    expect(adminErrorMessage({ code: "23505" }, "subtitles")).toBe("Субтитры на этом языке уже есть");
    expect(adminErrorMessage({ code: "42501" }, "episodes")).toBe("Недостаточно прав");
    expect(adminErrorMessage({ code: "PT422", message: "own_role" }, "admin_actions")).toBe("Свою роль менять нельзя");
    expect(adminErrorMessage({ code: "PT422", message: "role_unchanged" }, "admin_actions")).toBe("У пользователя уже эта роль");
    expect(adminErrorMessage({ code: "PT422", message: "???" }, "admin_actions")).toBe("Это действие недоступно");
    expect(adminErrorMessage(null, "episodes")).toBe("Не получилось — попробуйте ещё раз");
  });
});

describe("summarizeTitles", () => {
  it("считает серии по тайтлам, тайтлы с черновиками — первыми", () => {
    expect(
      summarizeTitles([
        { anilist_id: 5, license_status: "own" },
        { anilist_id: 1, license_status: "own" },
        { anilist_id: 9, license_status: "none" },
        { anilist_id: 9, license_status: "licensed" },
        { anilist_id: 1, license_status: "open_license" },
      ]),
    ).toEqual([
      { animeId: 9, total: 2, published: 1 },
      { animeId: 1, total: 2, published: 2 },
      { animeId: 5, total: 1, published: 1 },
    ]);
    expect(summarizeTitles([])).toEqual([]);
  });
});
