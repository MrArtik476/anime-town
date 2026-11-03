/** Ошибки базы для комментариев, жалоб и модерации → сообщения на русском (коды — ADR-025). */

export type DbError = { code?: string; details?: string | null; message?: string } | null | undefined;

export const GENERIC_ERROR = "Не получилось — попробуйте ещё раз";

const banDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Minsk",
});

/** Текст бана по detail из PT403: ISO-дата окончания или «forever». */
export function banMessage(until: string | null | undefined): string {
  if (!until || until === "forever") return "Вы заблокированы";
  const time = Date.parse(until);
  return Number.isNaN(time) ? "Вы заблокированы" : `Вы заблокированы до ${banDate.format(time)}`;
}

export function commentErrorMessage(error: DbError): string {
  switch (error?.code) {
    case "PT429":
      return "Слишком часто. Подождите немного и попробуйте снова";
    case "PT403":
      return banMessage(error.details);
    case "PT422":
      return "Это действие недоступно";
    case "23505":
      return "Вы уже пожаловались на этот комментарий";
    case "23514":
      return "Неверные данные";
    case "42501":
      return "Недостаточно прав";
    default:
      return GENERIC_ERROR;
  }
}
