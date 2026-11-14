// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  describeTitleAction,
  MAX_DESCRIPTION_RU,
  MAX_TITLE_RU,
  parseHideReason,
  parseTitleText,
  titleErrorMessage,
} from "@/features/admin/title-model";

describe("parseTitleText", () => {
  it("обрезает пробелы по краям", () => {
    expect(parseTitleText({ titleRu: "  Город звёзд ", descriptionRu: "\nОписание.\n" })).toEqual({
      ok: true,
      value: { titleRu: "Город звёзд", descriptionRu: "Описание." },
    });
  });

  it("пустая строка — «вернуть автоматическое», а не пустой текст", () => {
    expect(parseTitleText({ titleRu: "   ", descriptionRu: "" })).toEqual({ ok: true, value: { titleRu: null, descriptionRu: null } });
    expect(parseTitleText({ titleRu: null })).toEqual({ ok: true, value: { titleRu: null, descriptionRu: null } });
  });

  it("слишком длинный текст — понятная ошибка с пределом", () => {
    const longTitle = parseTitleText({ titleRu: "я".repeat(MAX_TITLE_RU + 1), descriptionRu: "" });
    expect(longTitle).toEqual({ ok: false, message: `Название — не длиннее ${MAX_TITLE_RU} символов` });
    const longText = parseTitleText({ titleRu: "", descriptionRu: "я".repeat(MAX_DESCRIPTION_RU + 1) });
    expect(longText).toEqual({ ok: false, message: `Описание — не длиннее ${MAX_DESCRIPTION_RU} символов` });
    expect(parseTitleText({ titleRu: "я".repeat(MAX_TITLE_RU), descriptionRu: "я".repeat(MAX_DESCRIPTION_RU) }).ok).toBe(true);
  });

  it("не объект и не строки — неверные данные", () => {
    expect(parseTitleText("text")).toEqual({ ok: false, message: "Неверные данные" });
    expect(parseTitleText({ titleRu: 5 })).toEqual({ ok: false, message: "Неверные данные" });
  });
});

describe("parseHideReason", () => {
  it("причина необязательна, обрезается, не длиннее 500", () => {
    expect(parseHideReason(undefined)).toBeNull();
    expect(parseHideReason("  ")).toBeNull();
    expect(parseHideReason(" жалоба правообладателя ")).toBe("жалоба правообладателя");
    expect(parseHideReason("я".repeat(501))).toBeUndefined();
    expect(parseHideReason(7)).toBeUndefined();
  });
});

describe("titleErrorMessage", () => {
  it("ошибки триггера — по-русски", () => {
    expect(titleErrorMessage({ code: "PT422", message: "text_unchanged" })).toBe("Текст не изменился — сохранять нечего");
    expect(titleErrorMessage({ code: "PT422", message: "already_hidden" })).toBe("Тайтл уже скрыт");
    expect(titleErrorMessage({ code: "PT422", message: "not_hidden" })).toBe("Тайтл уже виден на сайте");
    expect(titleErrorMessage({ code: "42501" })).toBe("Недостаточно прав");
    expect(titleErrorMessage({ code: "XX000" })).toBe("Не получилось — попробуйте ещё раз");
  });
});

describe("describeTitleAction", () => {
  const row = { action: "set_text", title_ru: null as string | null, description_ru: null as string | null };

  it("описывает действие для журнала", () => {
    expect(describeTitleAction({ ...row, title_ru: "Город звёзд" })).toBe("Изменил название");
    expect(describeTitleAction({ ...row, description_ru: "Текст" })).toBe("Изменил описание");
    expect(describeTitleAction({ ...row, title_ru: "Город", description_ru: "Текст" })).toBe("Изменил название и описание");
    expect(describeTitleAction(row)).toBe("Вернул автоматический текст");
    expect(describeTitleAction({ ...row, action: "hide" })).toBe("Скрыл тайтл");
    expect(describeTitleAction({ ...row, action: "show" })).toBe("Вернул тайтл на сайт");
    expect(describeTitleAction({ ...row, action: "other" })).toBe("Действие");
  });
});
