import { AniListError } from "./errors";
import type { GraphQLDocument } from "./queries";

const DEFAULT_ENDPOINT = "https://graphql.anilist.co";
/** Ждать Retry-After дольше этого нет смысла — пользователь увидит сообщение и сможет повторить. */
const MAX_RETRY_AFTER_SECONDS = 5;
const DEFAULT_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 10_000;

type GraphQLResponse<TData> = {
  data?: TData | null;
  errors?: { message: string; status?: number }[];
};

export type AniListRequestOptions = {
  endpoint?: string;
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export function getAniListEndpoint(): string {
  return process.env.ANILIST_GRAPHQL_URL || DEFAULT_ENDPOINT;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * AniList не игнорирует аргументы с явным null: `format: null` фильтрует выдачу (вплоть до пустой).
 * Поэтому переменные без значения не отправляются вовсе — тогда аргумент считается не заданным.
 */
export function compactVariables(variables: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(variables).filter(([, value]) => value !== null && value !== undefined));
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Запрос к AniList GraphQL.
 * Повторяет сетевые сбои и 5xx с нарастающей паузой, на 429 ждёт Retry-After (если он короткий),
 * GraphQL-ошибку со статусом 404 превращает в NOT_FOUND.
 */
export async function anilistRequest<TData, TVariables extends Record<string, unknown>>(
  document: GraphQLDocument<TData, TVariables>,
  variables: TVariables,
  options: AniListRequestOptions = {},
): Promise<TData> {
  const endpoint = options.endpoint ?? getAniListEndpoint();
  const retries = options.retries ?? DEFAULT_RETRIES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < retries;
    let response: Response;

    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: document, variables: compactVariables(variables) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (cause) {
      if (canRetry) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new AniListError("NETWORK", "AniList недоступен", { cause });
    }

    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      if (canRetry && retryAfter !== undefined && retryAfter <= MAX_RETRY_AFTER_SECONDS) {
        await sleep(retryAfter * 1000);
        continue;
      }
      throw new AniListError("RATE_LIMITED", "Превышен лимит запросов к AniList", {
        status: 429,
        retryAfter,
      });
    }

    if (response.status >= 500) {
      if (canRetry) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new AniListError("NETWORK", `AniList ответил ${response.status}`, {
        status: response.status,
      });
    }

    let body: GraphQLResponse<TData>;
    try {
      body = (await response.json()) as GraphQLResponse<TData>;
    } catch (cause) {
      throw new AniListError("BAD_RESPONSE", "AniList вернул некорректный ответ", {
        status: response.status,
        cause,
      });
    }

    const firstError = body.errors?.[0];
    if (firstError) {
      const status = firstError.status ?? response.status;
      if (status === 404) {
        throw new AniListError("NOT_FOUND", "Не найдено", { status: 404 });
      }
      throw new AniListError("BAD_RESPONSE", firstError.message, { status });
    }

    if (!response.ok || !body.data) {
      throw new AniListError("BAD_RESPONSE", `AniList ответил ${response.status}`, {
        status: response.status,
      });
    }

    return body.data;
  }
}
