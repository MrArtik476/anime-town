/**
 * Ошибки переводчика, общие для всех провайдеров. Вызывающий код решает по коду, что делать дальше:
 * - AUTH, QUOTA_EXCEEDED — остановить фоновое заполнение до исправления ключа / следующего периода;
 * - RATE_LIMITED, UNAVAILABLE — временный сбой: провайдер уже сделал повторы, попробуем при следующем запуске;
 * - BAD_REQUEST — ошибка запроса (например, слишком большой текст): пропустить пачку.
 */
export type TranslatorErrorCode = "AUTH" | "QUOTA_EXCEEDED" | "RATE_LIMITED" | "UNAVAILABLE" | "BAD_REQUEST";

export class TranslatorError extends Error {
  readonly code: TranslatorErrorCode;
  readonly status?: number;

  constructor(code: TranslatorErrorCode, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "TranslatorError";
    this.code = code;
    this.status = options.status;
  }
}

export function isTranslatorError(error: unknown): error is TranslatorError {
  return error instanceof TranslatorError;
}

/** После этих ошибок продолжать бессмысленно: ключ неверен или квота исчерпана. */
export function isFatalTranslatorError(error: unknown): boolean {
  return isTranslatorError(error) && (error.code === "AUTH" || error.code === "QUOTA_EXCEEDED");
}
