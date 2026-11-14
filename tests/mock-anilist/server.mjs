// Мок AniList GraphQL для E2E: приложение запускается с ANILIST_GRAPHQL_URL=http://127.0.0.1:4010/graphql.
// Отвечает по имени операции (HomeCollections, CatalogPage, Genres, AnimeDetails, TranslationCandidates) из fixtures.mjs.
//
// Управляемые сценарии:
//   поиск «__error__»      → 500 (сбой AniList)
//   поиск «__ratelimit__»  → 429, Retry-After: 60
//   AnimeDetails id 500500 → 500
//   неизвестный id         → 404 Not Found (как у AniList)

import { createServer } from "node:http";

import { GENRES, MEDIA, SEARCH_ONLY_MEDIA } from "./fixtures.mjs";

const PORT = Number(process.env.MOCK_ANILIST_PORT ?? 4010);

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

const page = (items, pageNumber, perPage) => {
  const start = (pageNumber - 1) * perPage;
  return {
    pageInfo: { currentPage: pageNumber, hasNextPage: start + perPage < items.length },
    media: items.slice(start, start + perPage),
  };
};

const SORTERS = {
  POPULARITY_DESC: (a, b) => b.popularity - a.popularity,
  TRENDING_DESC: (a, b) => b.trending - a.trending,
  SCORE_DESC: (a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0),
  START_DATE_DESC: (a, b) => (b.startDate?.year ?? 0) - (a.startDate?.year ?? 0),
  EPISODES_DESC: (a, b) => (b.episodes ?? 0) - (a.episodes ?? 0),
  SEARCH_MATCH: () => 0,
};

const visible = (excluded = []) =>
  MEDIA.filter((m) => !m.isAdult && !m.genres.some((g) => excluded.includes(g)));

function catalog(vars) {
  const search = vars.search?.toLowerCase();
  // Тайтлы «только поиском» (тесты админки) участвуют лишь в запросах с текстом поиска.
  const pool = search ? [...visible(vars.excludedGenres), ...SEARCH_ONLY_MEDIA] : visible(vars.excludedGenres);
  let items = pool.filter((m) => {
    if (search) {
      const names = [m.title.romaji, m.title.english, m.title.native, ...m.synonyms].filter(Boolean);
      if (!names.some((name) => name.toLowerCase().includes(search))) return false;
    }
    if (vars.genre && !m.genres.includes(vars.genre)) return false;
    if (vars.seasonYear && m.seasonYear !== vars.seasonYear) return false;
    if (vars.season && m.season !== vars.season) return false;
    if (vars.format && m.format !== vars.format) return false;
    if (vars.status && m.status !== vars.status) return false;
    if (vars.idMalIn && !vars.idMalIn.includes(m.idMal)) return false;
    return true;
  });
  const sort = SORTERS[vars.sort?.[0]] ?? SORTERS.POPULARITY_DESC;
  items = [...items].sort(sort);
  return { Page: page(items, vars.page ?? 1, vars.perPage ?? 24) };
}

function handle(query, vars, res) {
  const operation = /query\s+(\w+)/.exec(query)?.[1];

  // Проверка контракта: клиент не должен слать null-переменные (AniList трактует их как фильтр).
  const nullVar = Object.entries(vars).find(([, value]) => value === null);
  if (nullVar) return json(res, 400, { errors: [{ message: `null variable ${nullVar[0]}`, status: 400 }] });

  switch (operation) {
    case "HomeCollections": {
      const all = visible(vars.excludedGenres);
      const seasonal = all.filter((m) => m.season === vars.season && m.seasonYear === vars.seasonYear);
      return json(res, 200, {
        data: {
          trending: page([...all].sort(SORTERS.TRENDING_DESC), 1, vars.perPage),
          topRated: page([...all].sort(SORTERS.SCORE_DESC), 1, vars.perPage),
          // В фикстурах нет текущего сезона — отдаём популярное, чтобы секция не была пустой.
          seasonal: page(seasonal.length ? seasonal : [...all].sort(SORTERS.POPULARITY_DESC), 1, vars.perPage),
        },
      });
    }
    case "CatalogPage": {
      if (vars.search === "__error__") return json(res, 500, { errors: [{ message: "Internal", status: 500 }] });
      if (vars.search === "__ratelimit__") {
        return json(res, 429, { errors: [{ message: "Too Many Requests.", status: 429 }] }, { "Retry-After": "60" });
      }
      return json(res, 200, { data: catalog(vars) });
    }
    case "TranslationCandidates": {
      const all = visible(vars.excludedGenres);
      return json(res, 200, {
        data: {
          trending: page([...all].sort(SORTERS.TRENDING_DESC), 1, vars.perPage),
          popular: page([...all].sort(SORTERS.POPULARITY_DESC), 1, vars.perPage),
        },
      });
    }
    case "Genres":
      return json(res, 200, { data: { GenreCollection: GENRES } });
    case "AnimeDetails": {
      if (vars.id === 500500) return json(res, 500, { errors: [{ message: "Internal", status: 500 }] });
      const found = [...MEDIA, ...SEARCH_ONLY_MEDIA].find((m) => m.id === vars.id);
      if (!found) return json(res, 404, { errors: [{ message: "Not Found.", status: 404 }], data: { Media: null } });
      return json(res, 200, { data: { Media: found } });
    }
    default:
      return json(res, 400, { errors: [{ message: `Unknown operation ${operation}`, status: 400 }] });
  }
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true });
  if (req.method !== "POST") return json(res, 405, { errors: [{ message: "Method not allowed" }] });

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { query, variables } = JSON.parse(body);
      handle(query, variables ?? {}, res);
    } catch {
      json(res, 400, { errors: [{ message: "Invalid JSON", status: 400 }] });
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`mock AniList on http://127.0.0.1:${PORT}/graphql`));
