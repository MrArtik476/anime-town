import type { Translator, TranslatorUsage } from "../translator";

import { TranslatorError } from "./errors";

// DeepL API — https://developers.deepl.com
// Проверено по документации 2026-11-01:
// - эндпоинты и авторизация: https://developers.deepl.com/api-reference/translate
//   Free-ключи оканчиваются на ":fx" и работают только с api-free.deepl.com;
// - размер запроса ≤ 128 KiB, фиксированного лимита на число текстов нет:
//   https://developers.deepl.com/docs/resources/usage-limits
// - коды ошибок и повторы (429/5xx/529 — экспоненциальная пауза с jitter и учётом Retry-After;
//   400/403/456 — не повторять): https://developers.deepl.com/docs/best-practices/error-handling
// - остаток квоты: GET /v2/usage → { character_count, character_limit }:
//   https://developers.deepl.com/api-reference/usage-and-quota

export const DEEPL_FREE_ENDPOINT = "https://api-free.deepl.com";
export const DEEPL_PRO_ENDPOINT = "https://api.deepl.com";
/** Документированный предел всего запроса. */
export const DEEPL_MAX_REQUEST_BYTES = 128 * 1024;
/** Наш предел тела запроса — с запасом под заголовки и JSON-обвязку. */
export const DEEPL_BATCH_MAX_BYTES = 100 * 1024;
/** Документация не фиксирует число текстов — держим осторожный предел. */
export const DEEPL_BATCH_MAX_TEXTS = 50;
const REQUEST_TIMEOUT_MS = 20_000;
/** Повторы для 429, 529, 5xx и сетевых сбоев: 1 + 3 попытки, пауза 1 → 2 → 4 с (± jitter), не больше 10 с. */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 10_000;

/** Free-ключи DeepL оканчиваются на ":fx" и работают только с api-free.deepl.com. */
export function deeplEndpointForKey(apiKey: string): string {
  return apiKey.trim().endsWith(":fx") ? DEEPL_FREE_ENDPOINT : DEEPL_PRO_ENDPOINT;
}

type DeepLOptions = {
  apiKey: string;
  /** Только для тестов: мок-сервер вместо api(-free).deepl.com. */
  endpoint?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

type TranslateResponse = { translations?: { text?: string; billed_characters?: number }[] };
type UsageResponse = { character_count?: number; character_limit?: number };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  const seconds = header === null ? NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/** Ошибка по HTTP-статусу. Тело ответа не логируем и в сообщение не включаем. */
function errorForStatus(status: number): TranslatorError {
  if (status === 403) return new TranslatorError("AUTH", "DeepL отклонил ключ (403)", { status });
  if (status === 456) return new TranslatorError("QUOTA_EXCEEDED", "Квота DeepL исчерпана (456)", { status });
  if (status === 429 || status === 529) return new TranslatorError("RATE_LIMITED", `DeepL ограничил частоту (${status})`, { status });
  if (status >= 500) return new TranslatorError("UNAVAILABLE", `DeepL недоступен (${status})`, { status });
  return new TranslatorError("BAD_REQUEST", `DeepL отклонил запрос (${status})`, { status });
}

const isRetryableStatus = (status: number) => status === 429 || status === 529 || status >= 500;

export function createDeepLTranslator({
  apiKey,
  endpoint,
  fetchImpl = fetch,
  sleep = defaultSleep,
  random = Math.random,
}: DeepLOptions): Translator {
  const base = (endpoint ?? deeplEndpointForKey(apiKey)).replace(/\/+$/, "");
  const headers = {
    Authorization: `DeepL-Auth-Key ${apiKey.trim()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  async function request(path: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < MAX_RETRIES;
      const backoff = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt) * (0.5 + random() / 2);

      let response: Response;
      try {
        response = await fetchImpl(`${base}${path}`, {
          ...init,
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (cause) {
        if (canRetry) {
          await sleep(backoff);
          continue;
        }
        throw new TranslatorError("UNAVAILABLE", "DeepL не ответил (сеть или таймаут)", { cause });
      }

      if (response.ok) return response;
      if (isRetryableStatus(response.status) && canRetry) {
        await sleep(Math.min(MAX_DELAY_MS, retryAfterMs(response) ?? backoff));
        continue;
      }
      throw errorForStatus(response.status);
    }
  }

  return {
    name: "deepl",
    label: "DeepL",
    maxBatchTexts: DEEPL_BATCH_MAX_TEXTS,
    maxBatchBytes: DEEPL_BATCH_MAX_BYTES,

    async translate(texts) {
      if (!texts.length) return { texts: [], billedCharacters: 0 };
      const response = await request("/v2/translate", {
        method: "POST",
        body: JSON.stringify({ text: texts, source_lang: "EN", target_lang: "RU", show_billed_characters: true }),
      });

      let body: TranslateResponse;
      try {
        body = (await response.json()) as TranslateResponse;
      } catch (cause) {
        throw new TranslatorError("UNAVAILABLE", "DeepL вернул некорректный ответ", { cause });
      }
      const translations = body.translations ?? [];
      if (translations.length !== texts.length || translations.some((item) => typeof item.text !== "string")) {
        throw new TranslatorError("UNAVAILABLE", "DeepL вернул неполный ответ");
      }
      const billed = translations.reduce((sum, item) => sum + (item.billed_characters ?? 0), 0);
      return {
        texts: translations.map((item) => (item.text as string).trim()),
        // Если DeepL не прислал billed_characters — считаем по исходному тексту (так DeepL и тарифицирует).
        billedCharacters: billed || texts.reduce((sum, text) => sum + text.length, 0),
      };
    },

    async getUsage(): Promise<TranslatorUsage> {
      const response = await request("/v2/usage", { method: "GET" });
      const body = (await response.json().catch(() => ({}))) as UsageResponse;
      if (typeof body.character_count !== "number" || typeof body.character_limit !== "number") {
        throw new TranslatorError("UNAVAILABLE", "DeepL вернул некорректный ответ /v2/usage");
      }
      return { used: body.character_count, limit: body.character_limit };
    },
  };
}
