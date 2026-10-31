import { createThrottle, type Throttle } from "./throttle";

const DEFAULT_ENDPOINT = "https://shikimori.io/api/graphql";
/** Shikimori требует узнаваемый User-Agent; без него IP могут заблокировать. Браузер не имитируем. */
export const SHIKIMORI_USER_AGENT = "AnimeTown/0.2 (+https://github.com/MrArtik476/anime-town)";
const REQUEST_TIMEOUT_MS = 5_000;
/** Сколько ждать свободного слота лимита, прежде чем обойтись без Shikimori. */
const MAX_QUEUE_WAIT_MS = 3_000;

export class ShikimoriError extends Error {
  readonly status?: number;
  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "ShikimoriError";
    this.status = options.status;
  }
}

export function getShikimoriEndpoint(): string {
  return process.env.SHIKIMORI_GRAPHQL_URL || DEFAULT_ENDPOINT;
}

const holder = globalThis as typeof globalThis & { __animeTownShikimoriThrottle?: Throttle };

/** Официальный лимит — 5 запросов в секунду и 90 в минуту; держимся с запасом. */
function getShikimoriThrottle(): Throttle {
  holder.__animeTownShikimoriThrottle ??= createThrottle({
    limits: [
      { count: 4, windowMs: 1_000 },
      { count: 80, windowMs: 60_000 },
    ],
  });
  return holder.__animeTownShikimoriThrottle;
}

export type ShikimoriRequestOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  throttle?: Throttle;
};

/** Запрос к Shikimori GraphQL. Только с сервера: свой User-Agent и общий для процесса лимит. */
export async function shikimoriRequest<TData>(
  query: string,
  variables: Record<string, unknown>,
  options: ShikimoriRequestOptions = {},
): Promise<TData> {
  const throttle = options.throttle ?? getShikimoriThrottle();
  if (!(await throttle.acquire(MAX_QUEUE_WAIT_MS))) {
    throw new ShikimoriError("Лимит запросов к Shikimori исчерпан", { status: 429 });
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(options.endpoint ?? getShikimoriEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SHIKIMORI_USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (cause) {
    throw new ShikimoriError("Shikimori недоступен", { cause });
  }

  if (!response.ok) throw new ShikimoriError(`Shikimori ответил ${response.status}`, { status: response.status });

  let body: { data?: TData | null; errors?: { message: string }[] };
  try {
    body = await response.json();
  } catch (cause) {
    throw new ShikimoriError("Shikimori вернул некорректный ответ", { cause });
  }
  if (body.errors?.length || !body.data) {
    throw new ShikimoriError(body.errors?.[0]?.message ?? "Shikimori вернул пустой ответ");
  }
  return body.data;
}
