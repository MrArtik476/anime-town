/** Тайтлы в админ-панели (этап 6c, ADR-029): проверка ручного текста, причина скрытия, тексты ошибок и журнала. */
import type { Parsed } from "./model";

export const MAX_TITLE_RU = 300;
export const MAX_DESCRIPTION_RU = 5000;
export const MAX_HIDE_REASON = 500;

export type TitleText = { titleRu: string | null; descriptionRu: string | null };

const fail = (message: string): Parsed<TitleText> => ({ ok: false, message });

/** Строка формы → значение колонки: пробелы по краям убираются, пустая строка — null («вернуть автоматическое»). */
function field(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  return raw.trim() || null;
}

/** Ручные название и описание из формы. Те же пределы проверяет база (триггер title_apply и check-ограничения). */
export function parseTitleText(raw: unknown): Parsed<TitleText> {
  if (typeof raw !== "object" || raw === null) return fail("Неверные данные");
  const source = raw as Record<string, unknown>;
  const titleRu = field(source.titleRu);
  const descriptionRu = field(source.descriptionRu);
  if (titleRu === undefined || descriptionRu === undefined) return fail("Неверные данные");
  if (titleRu && titleRu.length > MAX_TITLE_RU) return fail(`Название — не длиннее ${MAX_TITLE_RU} символов`);
  if (descriptionRu && descriptionRu.length > MAX_DESCRIPTION_RU) return fail(`Описание — не длиннее ${MAX_DESCRIPTION_RU} символов`);
  return { ok: true, value: { titleRu, descriptionRu } };
}

/** Причина скрытия: необязательна. undefined — неверные данные, null — без причины. */
export function parseHideReason(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const reason = raw.trim();
  if (reason.length > MAX_HIDE_REASON) return undefined;
  return reason || null;
}

const TITLE_ERRORS: Record<string, string> = {
  text_unchanged: "Текст не изменился — сохранять нечего",
  text_too_long: "Текст слишком длинный",
  already_hidden: "Тайтл уже скрыт",
  not_hidden: "Тайтл уже виден на сайте",
  invalid_title: "Неверный id тайтла",
};

/** Ошибка базы → сообщение на русском. */
export function titleErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  switch (error?.code) {
    case "PT422":
      return TITLE_ERRORS[error.message ?? ""] ?? "Это действие недоступно";
    case "23514":
      return "База отклонила данные — проверьте поля";
    case "42501":
      return "Недостаточно прав";
    default:
      return "Не получилось — попробуйте ещё раз";
  }
}

/** Строка журнала title_actions → что сделал администратор. */
export function describeTitleAction(row: { action: string; title_ru: string | null; description_ru: string | null }): string {
  switch (row.action) {
    case "set_text":
      if (row.title_ru && row.description_ru) return "Изменил название и описание";
      if (row.title_ru) return "Изменил название";
      if (row.description_ru) return "Изменил описание";
      return "Вернул автоматический текст";
    case "hide":
      return "Скрыл тайтл";
    case "show":
      return "Вернул тайтл на сайт";
    default:
      return "Действие";
  }
}
