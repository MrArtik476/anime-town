// СГЕНЕРИРОВАНО scripts/build-edge-functions.mjs из supabase/functions/translate-cron/main.ts — не редактировать вручную.

// supabase/functions/translate-cron/main.ts
import process2 from "node:process";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// src/lib/anilist/errors.ts
var AniListError = class extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "AniListError";
    this.code = code;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }
};

// src/lib/anilist/client.ts
var DEFAULT_ENDPOINT = "https://graphql.anilist.co";
var REQUEST_TIMEOUT_MS = 5e3;
var DEFAULT_RETRIES = 1;
var MAX_RETRY_AFTER_SECONDS = 2;
var RETRY_DELAY_MS = 500;
var MAX_WAIT_MS = REQUEST_TIMEOUT_MS * (DEFAULT_RETRIES + 1) + DEFAULT_RETRIES * Math.max(RETRY_DELAY_MS, MAX_RETRY_AFTER_SECONDS * 1e3);
function getAniListEndpoint() {
  return process.env.ANILIST_GRAPHQL_URL || DEFAULT_ENDPOINT;
}
var defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function compactVariables(variables) {
  return Object.fromEntries(Object.entries(variables).filter(([, value]) => value !== null && value !== void 0));
}
function parseRetryAfter(header) {
  if (!header) return void 0;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : void 0;
}
async function anilistRequest(document, variables, options = {}) {
  const endpoint = options.endpoint ?? getAniListEndpoint();
  const retries = options.retries ?? DEFAULT_RETRIES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < retries;
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: document, variables: compactVariables(variables) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store"
      });
    } catch (cause) {
      if (canRetry) {
        await sleep(RETRY_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw new AniListError("NETWORK", "AniList недоступен", { cause });
    }
    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      if (canRetry && retryAfter !== void 0 && retryAfter <= MAX_RETRY_AFTER_SECONDS) {
        await sleep(retryAfter * 1e3);
        continue;
      }
      throw new AniListError("RATE_LIMITED", "Превышен лимит запросов к AniList", {
        status: 429,
        retryAfter
      });
    }
    if (response.status >= 500) {
      if (canRetry) {
        await sleep(RETRY_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw new AniListError("NETWORK", `AniList ответил ${response.status}`, {
        status: response.status
      });
    }
    let body;
    try {
      body = await response.json();
    } catch (cause) {
      throw new AniListError("BAD_RESPONSE", "AniList вернул некорректный ответ", {
        status: response.status,
        cause
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
        status: response.status
      });
    }
    return body.data;
  }
}

// src/lib/anilist/queries.ts
var gql = (source) => source;
var EXCLUDED_GENRES = ["Hentai"];
var MEDIA_CARD_FIELDS = (
  /* GraphQL */
  `
  id
  idMal
  title { romaji english native }
  synonyms
  coverImage { extraLarge large color }
  format
  status
  season
  seasonYear
  startDate { year month day }
  episodes
  averageScore
  genres
`
);
var PAGE_INFO_FIELDS = (
  /* GraphQL */
  `pageInfo { currentPage hasNextPage }`
);
var HOME_COLLECTIONS_QUERY = gql(
  /* GraphQL */
  `
  query HomeCollections($perPage: Int!, $season: MediaSeason!, $seasonYear: Int!, $excludedGenres: [String]) {
    trending: Page(page: 1, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(type: ANIME, isAdult: false, genre_not_in: $excludedGenres, sort: [TRENDING_DESC, POPULARITY_DESC]) {
        ${MEDIA_CARD_FIELDS}
        bannerImage
        description(asHtml: false)
      }
    }
    topRated: Page(page: 1, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(type: ANIME, isAdult: false, genre_not_in: $excludedGenres, sort: [SCORE_DESC, POPULARITY_DESC]) {
        ${MEDIA_CARD_FIELDS}
      }
    }
    seasonal: Page(page: 1, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(type: ANIME, isAdult: false, genre_not_in: $excludedGenres, season: $season, seasonYear: $seasonYear, sort: [POPULARITY_DESC]) {
        ${MEDIA_CARD_FIELDS}
      }
    }
  }
`
);
var CATALOG_PAGE_QUERY = gql(
  /* GraphQL */
  `
  query CatalogPage(
    $page: Int!, $perPage: Int!, $sort: [MediaSort], $search: String, $genre: String,
    $seasonYear: Int, $season: MediaSeason, $format: MediaFormat, $status: MediaStatus,
    $idMalIn: [Int], $excludedGenres: [String]
  ) {
    Page(page: $page, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(
        type: ANIME, isAdult: false, sort: $sort, search: $search, genre: $genre,
        genre_not_in: $excludedGenres, seasonYear: $seasonYear, season: $season,
        format: $format, status: $status, idMal_in: $idMalIn
      ) {
        ${MEDIA_CARD_FIELDS}
      }
    }
  }
`
);
var GENRES_QUERY = gql(
  /* GraphQL */
  `
  query Genres {
    GenreCollection
  }
`
);
var ANIME_DETAILS_QUERY = gql(
  /* GraphQL */
  `
  query AnimeDetails($id: Int!) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_CARD_FIELDS}
      description(asHtml: false)
      bannerImage
      popularity
      favourites
      duration
      source(version: 3)
      endDate { year month day }
      isAdult
      studios(isMain: true) { nodes { id name } }
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            type
            title { romaji english native }
            synonyms
            format
            status
            startDate { year month day }
            coverImage { large color }
            isAdult
          }
        }
      }
    }
  }
`
);
var TRANSLATION_CANDIDATES_QUERY = gql(
  /* GraphQL */
  `
  query TranslationCandidates($perPage: Int!, $excludedGenres: [String]) {
    trending: Page(page: 1, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(type: ANIME, isAdult: false, genre_not_in: $excludedGenres, sort: [TRENDING_DESC, POPULARITY_DESC]) {
        id
        idMal
        description(asHtml: false)
      }
    }
    popular: Page(page: 1, perPage: $perPage) {
      ${PAGE_INFO_FIELDS}
      media(type: ANIME, isAdult: false, genre_not_in: $excludedGenres, sort: [POPULARITY_DESC]) {
        id
        idMal
        description(asHtml: false)
      }
    }
  }
`
);

// src/lib/anime/format.ts
var FORMAT_LABELS = {
  TV: "TV-сериал",
  TV_SHORT: "Короткий сериал",
  MOVIE: "Фильм",
  OVA: "OVA",
  ONA: "ONA",
  SPECIAL: "Спешл"
};
var RELATED_FORMAT_LABELS = {
  ...FORMAT_LABELS,
  MUSIC: "Музыкальное видео",
  MANGA: "Манга",
  NOVEL: "Ранобэ",
  ONE_SHOT: "Ваншот"
};
var numberFormatter = new Intl.NumberFormat("ru-RU");
var NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  times: "×"
};
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 1114111 ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}
var ATTRIBUTION = /[ \t]*[([]\s*(?:source|written by)\b[^)\]\n]*[)\]][ \t]*(?=\n|$)/gi;
function cleanDescription(raw) {
  if (!raw) return null;
  const text = decodeEntities(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(ATTRIBUTION, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text || null;
}

// src/lib/localization/batches.ts
var BODY_OVERHEAD_BYTES = 256;
var utf8 = new TextEncoder();
function jsonTextBytes(text) {
  return utf8.encode(JSON.stringify(text)).length + 1;
}
function chunkForTranslation(items, maxTexts, maxBytes) {
  const batches = [];
  const oversized = [];
  let current = [];
  let bytes = BODY_OVERHEAD_BYTES;
  for (const item of items) {
    const size = jsonTextBytes(item.text);
    if (size + BODY_OVERHEAD_BYTES > maxBytes) {
      oversized.push(item);
      continue;
    }
    if (current.length >= maxTexts || bytes + size > maxBytes) {
      batches.push(current);
      current = [];
      bytes = BODY_OVERHEAD_BYTES;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return { batches, oversized };
}

// src/lib/localization/budget.ts
var DEFAULT_MONTHLY_CHAR_LIMIT = 45e4;
var DEFAULT_RUN_CHAR_LIMIT = 15e3;
var USAGE_CACHE_MS = 5 * 60 * 1e3;
function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function monthlyCharLimit(env = process.env) {
  return positiveInt(env.TRANSLATE_MONTHLY_CHAR_LIMIT, DEFAULT_MONTHLY_CHAR_LIMIT);
}
function runCharLimit(env = process.env) {
  return positiveInt(env.TRANSLATE_RUN_CHAR_LIMIT, DEFAULT_RUN_CHAR_LIMIT);
}
function remainingBudget(usage, ownLimit) {
  return Math.max(0, Math.min(ownLimit, usage.limit) - usage.used);
}
var holder = globalThis;
function createUsageTracker(translator, { now = Date.now, ttlMs = USAGE_CACHE_MS } = {}) {
  holder.__animeTownTranslatorUsage ??= /* @__PURE__ */ new Map();
  const cache = holder.__animeTownTranslatorUsage;
  return {
    /** Текущее использование; null — провайдер не сообщил (тогда переводить не рискуем). */
    async current() {
      const cached = cache.get(translator.name);
      if (cached && now() - cached.fetchedAt < ttlMs) return cached.usage;
      const usage = await translator.getUsage();
      if (usage) cache.set(translator.name, { usage, fetchedAt: now() });
      return usage;
    },
    record(billedCharacters) {
      const cached = cache.get(translator.name);
      if (cached) cached.usage = { ...cached.usage, used: cached.usage.used + billedCharacters };
    },
    markExhausted() {
      const cached = cache.get(translator.name);
      const limit = cached?.usage.limit ?? 0;
      cache.set(translator.name, { usage: { used: limit, limit }, fetchedAt: now() });
    },
    reset() {
      cache.delete(translator.name);
    }
  };
}

// src/lib/localization/hash.ts
import { createHash } from "node:crypto";
function descriptionHash(text) {
  return createHash("sha256").update(text.normalize("NFC").trim()).digest("hex");
}

// src/lib/localization/text.ts
var CYRILLIC = /[а-яё]/i;
var NON_RUSSIAN_CYRILLIC = /[іїєґў]/i;
function hasCyrillic(text) {
  return !!text && CYRILLIC.test(text);
}
function isRussianText(text) {
  return hasCyrillic(text) && !NON_RUSSIAN_CYRILLIC.test(text ?? "");
}

// src/lib/localization/translators/errors.ts
var TranslatorError = class extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "TranslatorError";
    this.code = code;
    this.status = options.status;
  }
};
function isTranslatorError(error) {
  return error instanceof TranslatorError;
}

// src/lib/localization/translators/deepl.ts
var DEEPL_FREE_ENDPOINT = "https://api-free.deepl.com";
var DEEPL_PRO_ENDPOINT = "https://api.deepl.com";
var DEEPL_MAX_REQUEST_BYTES = 128 * 1024;
var DEEPL_BATCH_MAX_BYTES = 100 * 1024;
var DEEPL_BATCH_MAX_TEXTS = 50;
var REQUEST_TIMEOUT_MS2 = 2e4;
var MAX_RETRIES = 3;
var BASE_DELAY_MS = 1e3;
var MAX_DELAY_MS = 1e4;
function deeplEndpointForKey(apiKey) {
  return apiKey.trim().endsWith(":fx") ? DEEPL_FREE_ENDPOINT : DEEPL_PRO_ENDPOINT;
}
var defaultSleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function retryAfterMs(response) {
  const header = response.headers.get("Retry-After");
  const seconds = header === null ? NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1e3 : null;
}
function errorForStatus(status) {
  if (status === 403) return new TranslatorError("AUTH", "DeepL отклонил ключ (403)", { status });
  if (status === 456) return new TranslatorError("QUOTA_EXCEEDED", "Квота DeepL исчерпана (456)", { status });
  if (status === 429 || status === 529) return new TranslatorError("RATE_LIMITED", `DeepL ограничил частоту (${status})`, { status });
  if (status >= 500) return new TranslatorError("UNAVAILABLE", `DeepL недоступен (${status})`, { status });
  return new TranslatorError("BAD_REQUEST", `DeepL отклонил запрос (${status})`, { status });
}
var isRetryableStatus = (status) => status === 429 || status === 529 || status >= 500;
function createDeepLTranslator({
  apiKey,
  endpoint,
  fetchImpl = fetch,
  sleep = defaultSleep2,
  random = Math.random
}) {
  const base = (endpoint ?? deeplEndpointForKey(apiKey)).replace(/\/+$/, "");
  const headers = {
    Authorization: `DeepL-Auth-Key ${apiKey.trim()}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  async function request(path, init) {
    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < MAX_RETRIES;
      const backoff = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt) * (0.5 + random() / 2);
      let response;
      try {
        response = await fetchImpl(`${base}${path}`, {
          ...init,
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS2),
          cache: "no-store"
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
        body: JSON.stringify({ text: texts, source_lang: "EN", target_lang: "RU", show_billed_characters: true })
      });
      let body;
      try {
        body = await response.json();
      } catch (cause) {
        throw new TranslatorError("UNAVAILABLE", "DeepL вернул некорректный ответ", { cause });
      }
      const translations = body.translations ?? [];
      if (translations.length !== texts.length || translations.some((item) => typeof item.text !== "string")) {
        throw new TranslatorError("UNAVAILABLE", "DeepL вернул неполный ответ");
      }
      const billed = translations.reduce((sum, item) => sum + (item.billed_characters ?? 0), 0);
      return {
        texts: translations.map((item) => item.text.trim()),
        // Если DeepL не прислал billed_characters — считаем по исходному тексту (так DeepL и тарифицирует).
        billedCharacters: billed || texts.reduce((sum, text) => sum + text.length, 0)
      };
    },
    async getUsage() {
      const response = await request("/v2/usage", { method: "GET" });
      const body = await response.json().catch(() => ({}));
      if (typeof body.character_count !== "number" || typeof body.character_limit !== "number") {
        throw new TranslatorError("UNAVAILABLE", "DeepL вернул некорректный ответ /v2/usage");
      }
      return { used: body.character_count, limit: body.character_limit };
    }
  };
}

// src/lib/localization/translator.ts
var PROVIDERS = {
  deepl(env) {
    const apiKey = (env.DEEPL_API_KEY || env.TRANSLATOR_API_KEY)?.trim();
    if (!apiKey) return null;
    const endpoint = env.ANIME_TOWN_E2E === "1" ? env.DEEPL_API_URL : void 0;
    return createDeepLTranslator({ apiKey, endpoint });
  }
};
function getTranslator(env = process.env) {
  const provider = env.TRANSLATOR_PROVIDER?.trim().toLowerCase();
  if (!provider) return null;
  const create = PROVIDERS[provider];
  if (!create) {
    console.warn(`[translator] неизвестный провайдер «${provider}» — машинный перевод выключен`);
    return null;
  }
  const translator = create(env);
  if (!translator) console.warn(`[translator] у провайдера «${provider}» не задан ключ — машинный перевод выключен`);
  return translator;
}

// src/lib/localization/resolve.ts
var SHIKIMORI_REFRESH_MS = 7 * 24 * 60 * 60 * 1e3;
function needsShikimoriRefresh(malId, record, now = Date.now()) {
  if (!malId) return false;
  if (!record || record.malId !== malId) return true;
  return now - Date.parse(record.updatedAt) > SHIKIMORI_REFRESH_MS;
}
function mergeShikimori(anilistId, malId, previous, shikimori) {
  const base = {
    anilistId,
    malId,
    titleRu: previous?.titleRu ?? null,
    synonymsRu: previous?.synonymsRu ?? [],
    descriptionRu: previous?.descriptionRu ?? null,
    source: previous?.source ?? null,
    sourceHash: previous?.sourceHash ?? null,
    translator: previous?.translator ?? null,
    shikimoriUrl: previous?.shikimoriUrl ?? null
  };
  if (!shikimori) return base;
  const keepMachine = !shikimori.descriptionRu && previous?.source === "machine";
  return {
    ...base,
    titleRu: shikimori.titleRu,
    synonymsRu: shikimori.synonymsRu,
    shikimoriUrl: shikimori.url,
    descriptionRu: shikimori.descriptionRu ?? (keepMachine ? base.descriptionRu : null),
    source: shikimori.descriptionRu ? "shikimori" : keepMachine ? "machine" : null,
    sourceHash: shikimori.descriptionRu ? null : keepMachine ? base.sourceHash : null,
    translator: shikimori.descriptionRu ? null : keepMachine ? base.translator : null
  };
}
function withMachineTranslation(anilistId, malId, previous, translation, sourceHash, translator) {
  return {
    anilistId,
    malId: previous?.malId ?? malId,
    titleRu: previous?.titleRu ?? null,
    synonymsRu: previous?.synonymsRu ?? [],
    shikimoriUrl: previous?.shikimoriUrl ?? null,
    descriptionRu: translation,
    source: "machine",
    sourceHash,
    translator
  };
}
function needsMachineTranslation(record, originalHash) {
  if (record?.descriptionRu && record.source === "shikimori") return false;
  return !(record?.descriptionRu && record.source === "machine" && record.sourceHash === originalHash);
}

// src/lib/shikimori/throttle.ts
var defaultSleep3 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function createThrottle({ limits, now = Date.now, sleep = defaultSleep3 }) {
  const slots = [];
  const longestWindow = Math.max(...limits.map((limit) => limit.windowMs));
  return {
    async acquire(maxWaitMs) {
      const time = now();
      while (slots.length && slots[0] <= time - longestWindow) slots.shift();
      let at = Math.max(time, slots.at(-1) ?? time);
      for (const { count, windowMs } of limits) {
        if (slots.length >= count) at = Math.max(at, slots[slots.length - count] + windowMs);
      }
      const wait = at - time;
      if (wait > maxWaitMs) return false;
      slots.push(at);
      if (wait > 0) await sleep(wait);
      return true;
    }
  };
}

// src/lib/shikimori/client.ts
var DEFAULT_ENDPOINT2 = "https://shikimori.io/api/graphql";
var SHIKIMORI_USER_AGENT = "AnimeTown/0.2 (+https://github.com/MrArtik476/anime-town)";
var REQUEST_TIMEOUT_MS3 = 5e3;
var MAX_QUEUE_WAIT_MS = 3e3;
var ShikimoriError = class extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "ShikimoriError";
    this.status = options.status;
  }
};
function getShikimoriEndpoint() {
  return process.env.SHIKIMORI_GRAPHQL_URL || DEFAULT_ENDPOINT2;
}
var holder2 = globalThis;
function getShikimoriThrottle() {
  holder2.__animeTownShikimoriThrottle ??= createThrottle({
    limits: [
      { count: 4, windowMs: 1e3 },
      { count: 80, windowMs: 6e4 }
    ]
  });
  return holder2.__animeTownShikimoriThrottle;
}
async function shikimoriRequest(query, variables, options = {}) {
  const throttle = options.throttle ?? getShikimoriThrottle();
  if (!await throttle.acquire(MAX_QUEUE_WAIT_MS)) {
    throw new ShikimoriError("Лимит запросов к Shikimori исчерпан", { status: 429 });
  }
  let response;
  try {
    response = await (options.fetchImpl ?? fetch)(options.endpoint ?? getShikimoriEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SHIKIMORI_USER_AGENT
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS3),
      cache: "no-store"
    });
  } catch (cause) {
    throw new ShikimoriError("Shikimori недоступен", { cause });
  }
  if (!response.ok) throw new ShikimoriError(`Shikimori ответил ${response.status}`, { status: response.status });
  let body;
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

// src/lib/shikimori/queries.ts
var ANIMES_BY_IDS_QUERY = (
  /* GraphQL */
  `
  query AnimesByIds($ids: String!, $limit: PositiveInt!) {
    animes(ids: $ids, limit: $limit, censored: true) {
      malId
      russian
      synonyms
      description
      url
    }
  }
`
);

// src/lib/shikimori/text.ts
function cleanShikimoriText(raw) {
  if (!raw) return null;
  const text = raw.replace(/\r\n?/g, "\n").replace(/\[(spoiler|source)(?:=[^\]]*)?\][\s\S]*?\[\/\1\]/gi, "").replace(/\[br\]/gi, "\n").replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/gi, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text || null;
}

// src/lib/shikimori/api.ts
var SHIKIMORI_BATCH_SIZE = 50;
var toId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};
async function fetchShikimoriByMalIds(malIds, options) {
  const unique = [...new Set(malIds)];
  const result = /* @__PURE__ */ new Map();
  for (let start = 0; start < unique.length; start += SHIKIMORI_BATCH_SIZE) {
    const batch = unique.slice(start, start + SHIKIMORI_BATCH_SIZE);
    const data = await shikimoriRequest(
      ANIMES_BY_IDS_QUERY,
      { ids: batch.join(","), limit: batch.length },
      options
    );
    for (const anime of data.animes) {
      const malId = toId(anime.malId);
      if (!malId) continue;
      const titleRu = anime.russian?.trim() || null;
      result.set(malId, {
        malId,
        titleRu,
        synonymsRu: (anime.synonyms ?? []).map((synonym) => synonym.trim()).filter((synonym) => synonym && synonym !== titleRu && isRussianText(synonym)),
        descriptionRu: cleanShikimoriText(anime.description),
        url: anime.url?.startsWith("https://") ? anime.url : null
      });
    }
  }
  return result;
}

// src/lib/supabase/admin.ts
import { createClient as createSupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

// src/lib/supabase/env.ts
var PLACEHOLDER = /<|xxx/;
function getSupabaseAdminEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  if (PLACEHOLDER.test(url) || PLACEHOLDER.test(serviceRoleKey)) return null;
  if (isPublishableKey(serviceRoleKey)) {
    console.error(
      "[supabase] SUPABASE_SERVICE_ROLE_KEY содержит publishable-ключ (sb_publishable_…) — нужен secret key (sb_secret_…)"
    );
    return null;
  }
  return { url, serviceRoleKey: serviceRoleKey.trim() };
}
function isPublishableKey(key) {
  const value = key.trim();
  if (value.startsWith("sb_publishable_")) return true;
  const payload = value.split(".")[1];
  if (!value.startsWith("eyJ") || !payload) return false;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role === "anon";
  } catch {
    return false;
  }
}

// src/lib/supabase/admin.ts
function createAdminClient() {
  const env = getSupabaseAdminEnv();
  if (!env) return null;
  return createSupabaseClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

// src/lib/localization/store.ts
var SOURCES = ["shikimori", "machine"];
function rowToRecord(row) {
  return {
    anilistId: row.anilist_id,
    malId: row.mal_id,
    titleRu: row.title_ru,
    synonymsRu: row.synonyms_ru ?? [],
    descriptionRu: row.description_ru,
    source: SOURCES.find((source) => source === row.source) ?? null,
    sourceHash: row.source_hash,
    translator: row.translator,
    shikimoriUrl: row.shikimori_url,
    updatedAt: row.updated_at
  };
}
function recordToRow(record) {
  return {
    anilist_id: record.anilistId,
    mal_id: record.malId,
    title_ru: record.titleRu,
    synonyms_ru: record.synonymsRu,
    description_ru: record.descriptionRu,
    source: record.source,
    source_hash: record.sourceHash,
    translator: record.translator,
    shikimori_url: record.shikimoriUrl
    // Триггер выставляет updated_at при UPDATE; при INSERT — значение по умолчанию.
  };
}
function createSupabaseStore(client) {
  return {
    kind: "supabase",
    async getMany(anilistIds) {
      const result = /* @__PURE__ */ new Map();
      if (!anilistIds.length) return result;
      const { data, error } = await client.from("anime_localizations").select("*").in("anilist_id", anilistIds);
      if (error) throw new Error(`anime_localizations: ${error.message}`);
      for (const row of data) result.set(row.anilist_id, rowToRecord(row));
      return result;
    },
    async upsertMany(records) {
      if (!records.length) return;
      const { error } = await client.from("anime_localizations").upsert(records.map(recordToRow), { onConflict: "anilist_id" });
      if (error) throw new Error(`anime_localizations: ${error.message}`);
    }
  };
}
function createMemoryStore(now = () => /* @__PURE__ */ new Date()) {
  const records = /* @__PURE__ */ new Map();
  return {
    kind: "memory",
    async getMany(anilistIds) {
      const result = /* @__PURE__ */ new Map();
      for (const id of anilistIds) {
        const record = records.get(id);
        if (record) result.set(id, { ...record });
      }
      return result;
    },
    async upsertMany(input) {
      for (const record of input) {
        records.set(record.anilistId, { ...record, updatedAt: now().toISOString() });
      }
    }
  };
}
var holder3 = globalThis;
function getLocalizationStore() {
  if (!holder3.__animeTownLocalizationStore) {
    const client = process.env.ANIME_TOWN_E2E === "1" ? null : createAdminClient();
    holder3.__animeTownLocalizationStore = client ? createSupabaseStore(client) : createMemoryStore();
  }
  return holder3.__animeTownLocalizationStore;
}

// src/lib/localization/service.ts
async function readLocalizations(ids, store = getLocalizationStore()) {
  try {
    return { records: await store.getMany(ids), ok: true };
  } catch (error) {
    console.error("[localization] хранилище недоступно", error);
    return { records: /* @__PURE__ */ new Map(), ok: false };
  }
}
async function loadLocalizations(entries, store = getLocalizationStore(), stored) {
  const initial = stored ?? await readLocalizations(entries.map((entry) => entry.id), store);
  let complete = initial.ok;
  const records = new Map(initial.records);
  const stale = entries.filter((entry) => needsShikimoriRefresh(entry.malId, records.get(entry.id)));
  if (!stale.length) return { records, complete };
  try {
    const shikimori = await fetchShikimoriByMalIds(stale.map((entry) => entry.malId));
    const updated = stale.map(
      (entry) => mergeShikimori(entry.id, entry.malId, records.get(entry.id), shikimori.get(entry.malId))
    );
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const record of updated) records.set(record.anilistId, { ...record, updatedAt: now });
    try {
      await store.upsertMany(updated);
    } catch (error) {
      complete = false;
      console.error("[localization] не удалось сохранить переводы", error);
    }
  } catch (error) {
    complete = false;
    console.error("[localization] Shikimori недоступен", error);
  }
  return { records, complete };
}

// src/lib/localization/backfill.ts
var CANDIDATES_PER_LIST = 50;
async function fetchTranslationCandidates() {
  const data = await anilistRequest(TRANSLATION_CANDIDATES_QUERY, {
    perPage: CANDIDATES_PER_LIST,
    excludedGenres: EXCLUDED_GENRES
  });
  const seen = /* @__PURE__ */ new Set();
  const candidates = [];
  for (const media of [...data.trending.media, ...data.popular.media]) {
    const description = cleanDescription(media.description);
    if (!description || seen.has(media.id)) continue;
    seen.add(media.id);
    candidates.push({ id: media.id, malId: media.idMal && media.idMal > 0 ? media.idMal : null, description });
  }
  return candidates;
}
async function runTranslationBackfill(options = {}) {
  const env = options.env ?? process.env;
  const translator = options.translator === void 0 ? getTranslator(env) : options.translator;
  const report = {
    translator: translator?.name ?? null,
    candidates: 0,
    pending: 0,
    translated: 0,
    characters: 0,
    batches: 0,
    skippedOversized: 0,
    stopped: null,
    usage: null
  };
  if (!translator) return { ...report, stopped: "no_translator" };
  const store = options.store ?? getLocalizationStore();
  if (store.kind !== "supabase" && env.ANIME_TOWN_E2E !== "1") return { ...report, stopped: "no_store" };
  const candidates = await (options.fetchCandidates ?? fetchTranslationCandidates)();
  report.candidates = candidates.length;
  const { records } = await loadLocalizations(candidates, store);
  const pending = candidates.map((candidate) => ({ ...candidate, hash: descriptionHash(candidate.description), text: candidate.description })).filter((candidate) => needsMachineTranslation(records.get(candidate.id), candidate.hash)).slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  report.pending = pending.length;
  const ownLimit = monthlyCharLimit(env);
  const tracker = createUsageTracker(translator);
  if (!pending.length) {
    const usage2 = await tracker.current().catch(() => null);
    return { ...report, usage: usage2 ? { ...usage2, ownLimit } : null };
  }
  let runBudget = runCharLimit(env);
  const { batches, oversized } = chunkForTranslation(pending, translator.maxBatchTexts, translator.maxBatchBytes);
  report.skippedOversized = oversized.length;
  try {
    for (const batch of batches) {
      const usage2 = await tracker.current();
      if (!usage2) {
        report.stopped = "usage_unavailable";
        break;
      }
      let allowance = Math.min(remainingBudget(usage2, ownLimit), runBudget);
      const affordable = batch.filter((item) => {
        if (item.text.length > allowance) return false;
        allowance -= item.text.length;
        return true;
      });
      if (!affordable.length) {
        report.stopped = "budget_exhausted";
        break;
      }
      const result = await translator.translate(affordable.map((item) => item.text));
      tracker.record(result.billedCharacters);
      runBudget -= result.billedCharacters;
      report.characters += result.billedCharacters;
      report.batches++;
      const rows = affordable.map(
        (item, index) => withMachineTranslation(item.id, item.malId, records.get(item.id), result.texts[index], item.hash, translator.name)
      );
      try {
        await store.upsertMany(rows);
      } catch (error) {
        console.error("[translator] не удалось сохранить переводы", error);
        report.stopped = "store_error";
        break;
      }
      report.translated += rows.length;
      if (affordable.length < batch.length) {
        report.stopped = "budget_exhausted";
        break;
      }
    }
  } catch (error) {
    if (!isTranslatorError(error)) throw error;
    if (error.code === "QUOTA_EXCEEDED") tracker.markExhausted();
    console.error(`[translator] ${translator.name}: ${error.code} — ${error.message}`);
    report.stopped = error.code;
  }
  const usage = await tracker.current().catch(() => null);
  report.usage = usage ? { ...usage, ownLimit } : null;
  return report;
}

// src/lib/localization/backfill-run.ts
var MAX_BACKFILL_LIMIT = 100;
function parseBackfillLimit(raw) {
  if (raw === null || raw === void 0 || raw.trim() === "") return { ok: true, limit: void 0 };
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BACKFILL_LIMIT) {
    return { ok: false, message: `limit должен быть целым числом от 1 до ${MAX_BACKFILL_LIMIT}` };
  }
  return { ok: true, limit };
}
var FAILURES = /* @__PURE__ */ new Set([
  "no_translator",
  "no_store",
  "usage_unavailable",
  "AUTH",
  "store_error"
]);
function isBackfillFailure(report) {
  return report.stopped !== null && FAILURES.has(report.stopped);
}

// src/lib/localization/runs.ts
var RUN_STALE_AFTER_SECONDS = 5 * 60;
var MAX_ERROR_LENGTH = 500;
function runStatus(report) {
  if (isBackfillFailure(report)) return "failed";
  return report.stopped ? "stopped" : "ok";
}
function errorMessage(error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.replace(/\s+/g, " ").slice(0, MAX_ERROR_LENGTH);
}
async function runJournaledBackfill({
  journal,
  trigger,
  backfill
}) {
  const runId = journal ? await journal.begin(trigger) : null;
  if (journal && runId === null) return { busy: true };
  const finish = async (outcome) => {
    if (!journal || runId === null) return;
    await journal.finish(runId, outcome).catch((error) => {
      console.error("[translator] не удалось записать итог запуска", errorMessage(error));
    });
  };
  let report;
  try {
    report = await backfill();
  } catch (error) {
    await finish({ status: "failed", report: null, error: errorMessage(error) });
    throw error;
  }
  const status = runStatus(report);
  await finish({ status, report, error: null });
  return { busy: false, runId, status, report };
}
function createSupabaseRunJournal(client) {
  return {
    async begin(trigger) {
      const { data, error } = await client.rpc("begin_translation_run", {
        p_trigger: trigger,
        p_stale_after_seconds: RUN_STALE_AFTER_SECONDS
      });
      if (error) throw new Error(`translation_runs: ${error.message}`);
      return data ?? null;
    },
    async finish(id, { status, report, error }) {
      const update = {
        status,
        finished_at: (/* @__PURE__ */ new Date()).toISOString(),
        error,
        candidates: report?.candidates ?? null,
        pending: report?.pending ?? null,
        translated: report?.translated ?? null,
        characters: report?.characters ?? null,
        batches: report?.batches ?? null,
        skipped_oversized: report?.skippedOversized ?? null,
        stopped: report?.stopped ?? null,
        usage_used: report?.usage?.used ?? null,
        usage_limit: report?.usage?.limit ?? null,
        own_limit: report?.usage?.ownLimit ?? null
      };
      const { error: dbError } = await client.from("translation_runs").update(update).eq("id", id);
      if (dbError) throw new Error(`translation_runs: ${dbError.message}`);
    }
  };
}
function supabaseSecretKey(env) {
  const override = env.TRANSLATE_SUPABASE_SECRET_KEY?.trim();
  if (override) return { key: override, source: "TRANSLATE_SUPABASE_SECRET_KEY" };
  try {
    const keys = JSON.parse(env.SUPABASE_SECRET_KEYS ?? "null");
    const key = keys && typeof keys === "object" ? keys.default : void 0;
    if (typeof key === "string" && key.trim()) return { key: key.trim(), source: "SUPABASE_SECRET_KEYS" };
  } catch {
  }
  const legacy = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return legacy ? { key: legacy, source: "SUPABASE_SERVICE_ROLE_KEY" } : null;
}
function secretMatches(actual, expected) {
  const encoder = new TextEncoder();
  const a = encoder.encode(actual ?? "");
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let index = 0; index < b.length; index++) diff |= b[index] ^ (a[index] ?? 0);
  return diff === 0;
}
var CRON_SECRET_HEADER = "x-cron-secret";
var json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
async function handleTranslateCronRequest(request, deps) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST" });
  const secret = deps.secret?.trim();
  if (!secret) console.error("[translator] CRON_SECRET не задан — вызовы translate-cron отклоняются");
  if (!secret || !secretMatches(request.headers.get(CRON_SECRET_HEADER), secret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  let body = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed;
    } catch {
      return json({ ok: false, error: "invalid_body", message: "тело — JSON-объект" }, 400);
    }
  }
  if (body.trigger !== void 0 && body.trigger !== "cron" && body.trigger !== "manual") {
    return json({ ok: false, error: "invalid_body", message: "trigger — cron или manual" }, 400);
  }
  const trigger = body.trigger ?? "cron";
  const limit = parseBackfillLimit(body.limit === void 0 || body.limit === null ? null : String(body.limit));
  if (!limit.ok) return json({ ok: false, error: "invalid_limit", message: limit.message }, 400);
  try {
    const run = await runJournaledBackfill({
      journal: deps.journal,
      trigger,
      backfill: () => deps.backfill({ limit: limit.limit })
    });
    if (run.busy) {
      console.warn("[translator] translate-cron: уже идёт другой запуск — пропуск");
      return json({ ok: false, error: "already_running" }, 409);
    }
    console.info("[translator] translate-cron", JSON.stringify({ runId: run.runId, trigger, status: run.status, ...run.report }));
    return json({ ok: run.status !== "failed", runId: run.runId, status: run.status, report: run.report }, run.status === "failed" ? 500 : 200);
  } catch (error) {
    console.error("[translator] translate-cron failed", errorMessage(error));
    return json({ ok: false, error: "backfill_failed" }, 502);
  }
}

// supabase/functions/translate-cron/main.ts
if (!("process" in globalThis)) Object.assign(globalThis, { process: process2 });
async function handle(request) {
  const env = process2.env;
  const url = env.SUPABASE_URL;
  const secretKey = supabaseSecretKey(env);
  const client = url && secretKey ? createClient(url, secretKey.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  }) : null;
  if (!client) console.error("[translator] translate-cron: нет SUPABASE_URL или ключа service role");
  else console.info(`[translator] translate-cron: ключ базы из ${secretKey?.source}`);
  return handleTranslateCronRequest(request, {
    secret: env.CRON_SECRET,
    journal: client ? createSupabaseRunJournal(client) : null,
    // Без базы runTranslationBackfill остановится с no_store и ничего не потратит.
    backfill: ({ limit }) => runTranslationBackfill({
      limit,
      env,
      store: client ? createSupabaseStore(client) : createMemoryStore()
    })
  });
}
var translateCron = { fetch: handle };
var main_default = translateCron;
export {
  main_default as default
};
