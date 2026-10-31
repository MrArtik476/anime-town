export type AniListErrorCode = "NOT_FOUND" | "RATE_LIMITED" | "NETWORK" | "BAD_RESPONSE";

export class AniListError extends Error {
  readonly code: AniListErrorCode;
  readonly status?: number;
  /** Для RATE_LIMITED — через сколько секунд можно повторить. */
  readonly retryAfter?: number;

  constructor(
    code: AniListErrorCode,
    message: string,
    options: { status?: number; retryAfter?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AniListError";
    this.code = code;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }
}

export function isAniListError(error: unknown): error is AniListError {
  return error instanceof AniListError;
}

export function isNotFoundError(error: unknown): boolean {
  return isAniListError(error) && error.code === "NOT_FOUND";
}

export const ERROR_MESSAGES: Record<AniListErrorCode, { title: string; description: string }> = {
  NOT_FOUND: {
    title: "Ничего не найдено",
    description: "Такого тайтла нет в базе AniList или он недоступен.",
  },
  RATE_LIMITED: {
    title: "Слишком много запросов",
    description: "AniList временно ограничил запросы. Подождите минуту и попробуйте снова.",
  },
  NETWORK: {
    title: "AniList не отвечает",
    description: "Не удалось связаться с источником данных. Проверьте соединение и повторите попытку.",
  },
  BAD_RESPONSE: {
    title: "Не удалось загрузить данные",
    description: "Источник данных вернул неожиданный ответ. Попробуйте ещё раз чуть позже.",
  },
};

/** Код ошибки для UI: всё неизвестное считается временным сбоем. */
export function toErrorCode(error: unknown): AniListErrorCode {
  return isAniListError(error) ? error.code : "BAD_RESPONSE";
}
