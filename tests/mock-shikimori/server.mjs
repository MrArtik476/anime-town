// Мок Shikimori GraphQL для E2E (тесты не ходят в сеть). Мок переводчика — tests/mock-deepl.
// Приложение запускается с SHIKIMORI_GRAPHQL_URL=http://127.0.0.1:4020/api/graphql
//
// Проверка контракта: без User-Agent «AnimeTown/…» — 403 (как бан по User-Agent у Shikimori).

import { createServer } from "node:http";

import { ANIMES } from "./fixtures.mjs";

const PORT = Number(process.env.MOCK_SHIKIMORI_PORT ?? 4020);
const MAX_LIMIT = 50;

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

function animes(vars) {
  const limit = Math.min(Number(vars.limit) || MAX_LIMIT, MAX_LIMIT);
  if (vars.ids) {
    const ids = String(vars.ids).split(",");
    return ANIMES.filter((anime) => ids.includes(anime.malId)).slice(0, limit);
  }
  if (vars.search) {
    const search = String(vars.search).toLowerCase();
    return ANIMES.filter((anime) =>
      [anime.name, anime.russian, ...anime.synonyms].some((name) => name?.toLowerCase().includes(search)),
    ).slice(0, limit);
  }
  return [];
}

function graphql(body, res) {
  const { query, variables = {} } = JSON.parse(body);
  if (!/animes\s*\(/.test(query)) return json(res, 200, { errors: [{ message: "Unsupported query" }] });
  // Запрос отдаёт только запрошенные поля — достаточно для мока, лишние поля клиент игнорирует.
  return json(res, 200, { data: { animes: animes(variables) } });
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      if (req.url === "/api/graphql") {
        if (!req.headers["user-agent"]?.startsWith("AnimeTown/")) {
          return json(res, 403, { errors: [{ message: "Set a proper User-Agent" }] });
        }
        return graphql(body, res);
      }
      return json(res, 404, { error: "Not found" });
    } catch {
      return json(res, 400, { errors: [{ message: "Invalid JSON" }] });
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`mock Shikimori on http://127.0.0.1:${PORT}/api/graphql`));
