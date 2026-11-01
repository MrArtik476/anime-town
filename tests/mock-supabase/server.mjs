// Мок Supabase для E2E: минимальный Auth (GoTrue) и Data API (PostgREST) для таблицы profiles.
// Приложение собирается с NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4040 и фиктивным publishable-ключом —
// настоящий проект в тестах не используется. Данные живут в памяти процесса.
//
// Поведение как у Supabase:
// - токены HS256 (подпись фиктивная): @supabase/ssr при getClaims() проверяет их через GET /auth/v1/user;
// - signup с адресом, содержащим «confirm», — без сессии (включено подтверждение почты);
// - профиль создаётся «триггером» при регистрации; занятый ник (без учёта регистра) → запасной user_xxxxxxxx;
// - PATCH profiles — только своя строка (как RLS) и 409 / 23505 при занятом нике;
// - anime_list — GET/POST (upsert)/DELETE только своих строк, гостю — 401, проверки статуса и оценки как в базе;
// - anime_rating_stats — сумма и число оценок (в базе — триггер); Storage avatars — только своя папка, до 1 МБ;
// - ошибки — { code, error_code, msg } и заголовок X-Supabase-Api-Version.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 4040);
const API_VERSION = "2024-01-01";
const TOKEN_TTL = 3600;

/** email → { id, email, password, created_at } */
const users = new Map();
/** id → profile row */
const profiles = new Map();
/** access/refresh token → user id */
const accessTokens = new Map();
const refreshTokens = new Map();

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Supabase-Api-Version": API_VERSION,
    ...headers,
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const authError = (res, status, code, msg) => send(res, status, { code, error_code: code, msg, message: msg });

function publicUser(user) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.confirmed ? user.created_at : null,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: user.metadata,
    identities: [],
    created_at: user.created_at,
    updated_at: user.created_at,
  };
}

function issueSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    role: "authenticated",
    aud: "authenticated",
    aal: "aal1",
    session_id: randomUUID(),
    iat: now,
    exp: now + TOKEN_TTL,
  };
  const accessToken = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.${Buffer.from("mock-signature").toString("base64url")}`;
  const refreshToken = randomUUID();
  accessTokens.set(accessToken, user.id);
  refreshTokens.set(refreshToken, user.id);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: TOKEN_TTL,
    expires_at: now + TOKEN_TTL,
    refresh_token: refreshToken,
    user: publicUser(user),
  };
}

function userByToken(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const id = accessTokens.get(token);
  return id ? [...users.values()].find((user) => user.id === id) : undefined;
}

const USERNAME = /^[A-Za-z0-9_А-Яа-яЁё]{3,24}$/;
const usernameTaken = (name, exceptId) =>
  [...profiles.values()].some((p) => p.id !== exceptId && p.username.toLowerCase() === name.toLowerCase());

/** Как public.handle_new_user(): ник из метаданных или запасной. */
function createProfile(user) {
  const fallback = `user_${user.id.replace(/-/g, "").slice(0, 8)}`;
  const wanted = user.metadata?.username;
  const username = typeof wanted === "string" && USERNAME.test(wanted) && !usernameTaken(wanted) ? wanted : fallback;
  const now = new Date().toISOString();
  profiles.set(user.id, {
    id: user.id,
    username,
    display_name: null,
    avatar_url: null,
    role: "user",
    created_at: now,
    updated_at: now,
  });
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

/** Фильтры PostgREST вида column=eq.value / ilike.value (ilike без шаблонов — экранированное равенство). */
function matches(row, params) {
  for (const [column, filter] of params) {
    if (["select", "limit", "order", "offset", "on_conflict"].includes(column)) continue;
    const [op, ...rest] = filter.split(".");
    const value = rest.join(".");
    if (op === "eq" && String(row[column]) !== value) return false;
    if (op === "ilike" && String(row[column]).toLowerCase() !== value.replace(/\\(.)/g, "$1").toLowerCase()) return false;
  }
  return true;
}

function pick(row, select) {
  if (!select || select === "*") return row;
  return Object.fromEntries(select.split(",").map((column) => [column.trim(), row[column.trim()]]));
}

async function handleAuth(req, res, path, url) {
  if (req.method === "POST" && path === "/auth/v1/signup") {
    const { email, password, data } = await readJson(req);
    if (!email || !password) return authError(res, 400, "validation_failed", "Missing email or password");
    if (password.length < 6) return authError(res, 422, "weak_password", "Password should be at least 6 characters");
    if (users.has(email.toLowerCase())) return authError(res, 422, "user_already_exists", "User already registered");
    const needsConfirm = email.includes("confirm");
    const user = {
      id: randomUUID(),
      email: email.toLowerCase(),
      password,
      metadata: data ?? {},
      confirmed: !needsConfirm,
      created_at: new Date().toISOString(),
    };
    users.set(user.email, user);
    createProfile(user);
    return send(res, 200, needsConfirm ? publicUser(user) : issueSession(user));
  }

  if (req.method === "POST" && path === "/auth/v1/token") {
    const grant = url.searchParams.get("grant_type");
    const body = await readJson(req);
    if (grant === "password") {
      const user = users.get(String(body.email ?? "").toLowerCase());
      if (!user || user.password !== body.password) {
        return authError(res, 400, "invalid_credentials", "Invalid login credentials");
      }
      if (!user.confirmed) return authError(res, 400, "email_not_confirmed", "Email not confirmed");
      return send(res, 200, issueSession(user));
    }
    if (grant === "refresh_token") {
      const id = refreshTokens.get(body.refresh_token);
      const user = id && [...users.values()].find((candidate) => candidate.id === id);
      if (!user) return authError(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
      refreshTokens.delete(body.refresh_token);
      return send(res, 200, issueSession(user));
    }
    return authError(res, 400, "validation_failed", "Unsupported grant type");
  }

  if (path === "/auth/v1/user") {
    const user = userByToken(req);
    if (!user) return authError(res, 403, "bad_jwt", "invalid JWT");
    if (req.method === "GET") return send(res, 200, publicUser(user));
    if (req.method === "PUT") {
      const { password } = await readJson(req);
      if (password && password === user.password) {
        return authError(res, 422, "same_password", "New password should be different from the old password.");
      }
      if (password) user.password = password;
      return send(res, 200, publicUser(user));
    }
  }

  if (req.method === "POST" && path === "/auth/v1/logout") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    accessTokens.delete(token);
    return send(res, 204);
  }

  if (req.method === "POST" && path === "/auth/v1/recover") {
    await readJson(req);
    return send(res, 200, {});
  }

  return authError(res, 404, "not_found", `mock: ${req.method} ${path}`);
}

/** Ответ PostgREST: при .single() (Accept: vnd.pgrst.object+json) — объект или 406. */
function sendRows(req, res, status, rows) {
  if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
    if (rows.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    return send(res, status, rows[0]);
  }
  return send(res, status, rows);
}

/** Личный список (anime_list): RLS — только свои строки, проверки как в миграции 20261101170000. */
const LIST_STATUSES = ["planned", "watching", "completed", "on_hold", "dropped"];
/** "user_id:anilist_id" → строка */
const animeList = new Map();

function listRowError(row) {
  if (row.status != null && !LIST_STATUSES.includes(row.status)) return "status";
  if (row.score != null && !(Number.isInteger(row.score) && row.score >= 1 && row.score <= 10)) return "score";
  if (row.status == null && row.score == null) return "anime_list_has_status_or_score";
  if (!row.title) return "title";
  return null;
}

async function handleAnimeList(req, res, url) {
  const user = userByToken(req);
  const params = [...url.searchParams.entries()];
  // Гость: прав на таблицу нет (как revoke all from anon).
  if (!user) return send(res, 401, { code: "42501", message: "permission denied for table anime_list" });
  const own = () => [...animeList.values()].filter((row) => row.user_id === user.id && matches(row, params));

  if (req.method === "GET") {
    let rows = own();
    const order = url.searchParams.get("order");
    if (order?.startsWith("updated_at.desc")) rows = rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const limit = Number(url.searchParams.get("limit") ?? Infinity);
    return sendRows(req, res, 200, rows.slice(0, limit).map((row) => pick(row, url.searchParams.get("select"))));
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    const input = Array.isArray(body) ? body : [body];
    const saved = [];
    for (const item of input) {
      // RLS with check: чужой user_id не вставить.
      if (item.user_id !== user.id) return send(res, 403, { code: "42501", message: "new row violates row-level security policy" });
      const key = `${item.user_id}:${item.anilist_id}`;
      const now = new Date().toISOString();
      const previous = animeList.get(key);
      const row = { ...previous, ...item, created_at: previous?.created_at ?? now, updated_at: now };
      const error = listRowError(row);
      if (error) return send(res, 400, { code: "23514", message: `violates check constraint ${error}` });
      animeList.set(key, row);
      saved.push(pick(row, url.searchParams.get("select")));
    }
    return sendRows(req, res, 201, saved);
  }

  if (req.method === "DELETE") {
    for (const row of own()) animeList.delete(`${row.user_id}:${row.anilist_id}`);
    return send(res, 204);
  }
  return send(res, 405, { message: "method not allowed in mock" });
}

/** anime_rating_stats: в базе её ведёт триггер, в моке — считаем по anime_list на лету. */
function handleRatingStats(req, res, url) {
  if (req.method !== "GET") return send(res, 401, { code: "42501", message: "permission denied for table anime_rating_stats" });
  const stats = new Map();
  for (const row of animeList.values()) {
    if (row.score == null) continue;
    const current = stats.get(row.anilist_id) ?? { anilist_id: row.anilist_id, score_sum: 0, score_count: 0 };
    current.score_sum += row.score;
    current.score_count += 1;
    stats.set(row.anilist_id, current);
  }
  const rows = [...stats.values()].filter((row) => matches(row, [...url.searchParams.entries()]));
  return sendRows(req, res, 200, rows.map((row) => pick(row, url.searchParams.get("select"))));
}

/** Storage: бакет avatars, загрузка и удаление — только в своей папке <user id>/…, публичное чтение. */
const storage = new Map();

async function handleStorage(req, res, path) {
  const publicMatch = path.match(/^\/storage\/v1\/object\/public\/avatars\/(.+)$/);
  if (req.method === "GET" && publicMatch) {
    const file = storage.get(decodeURIComponent(publicMatch[1]));
    if (!file) return send(res, 404, { message: "Object not found" });
    res.writeHead(200, { "Content-Type": file.type });
    return res.end(file.body);
  }
  const user = userByToken(req);
  if (!user) return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });

  const uploadMatch = path.match(/^\/storage\/v1\/object\/avatars\/(.+)$/);
  if (req.method === "POST" && uploadMatch) {
    const key = decodeURIComponent(uploadMatch[1]);
    if (key.split("/")[0] !== user.id) {
      return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (body.length > 1024 * 1024) return send(res, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
    if (storage.has(key) && req.headers["x-upsert"] !== "true") return send(res, 409, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    storage.set(key, { body, type: req.headers["content-type"] ?? "application/octet-stream" });
    return send(res, 200, { Key: `avatars/${key}`, Id: randomUUID() });
  }

  if (req.method === "DELETE" && path === "/storage/v1/object/avatars") {
    const { prefixes = [] } = await readJson(req);
    const removed = [];
    for (const key of prefixes) {
      if (key.split("/")[0] === user.id && storage.delete(key)) removed.push({ name: key });
    }
    return send(res, 200, removed);
  }
  return send(res, 404, { message: `mock storage: ${req.method} ${path}` });
}

/**
 * Серии (как миграция 20261101210000): видны только license_status <> 'none'. Тайтл 1 — две серии
 * на тестовом ролике /media/test/ (собственный, сгенерирован scripts/build-test-hls.mjs) и одна без прав.
 */
const EPISODES = [
  { id: 101, anilist_id: 1, number: 1, title: "Начало", duration_sec: 6, license_status: "own", hls_url: "/media/test/master.m3u8", attribution: null, attribution_url: null },
  { id: 102, anilist_id: 1, number: 2, title: "Продолжение", duration_sec: 6, license_status: "own", hls_url: "/media/test/master.m3u8", attribution: null, attribution_url: null },
  { id: 103, anilist_id: 1, number: 3, title: "Без прав", duration_sec: 6, license_status: "none", hls_url: "/media/test/master.m3u8", attribution: null, attribution_url: null },
];
const SUBTITLES = [
  { id: 1, episode_id: 101, lang: "ru", label: "Русские", url: "/media/test/subtitles.ru.vtt", is_default: true },
  { id: 2, episode_id: 101, lang: "en", label: "English", url: "/media/test/subtitles.en.vtt", is_default: false },
  { id: 3, episode_id: 103, lang: "ru", label: "Русские", url: "/media/test/subtitles.ru.vtt", is_default: true },
];
const visibleEpisodeIds = new Set(EPISODES.filter((e) => e.license_status !== "none").map((e) => e.id));

function handleReadOnly(req, res, url, rows) {
  if (req.method !== "GET") return send(res, 401, { code: "42501", message: "permission denied" });
  let result = rows.filter((row) => matches(row, [...url.searchParams.entries()]));
  const order = url.searchParams.get("order");
  if (order?.startsWith("number")) result = [...result].sort((a, b) => a.number - b.number);
  if (order?.startsWith("is_default.desc")) result = [...result].sort((a, b) => Number(b.is_default) - Number(a.is_default));
  const limit = Number(url.searchParams.get("limit") ?? Infinity);
  return sendRows(req, res, 200, result.slice(0, limit).map((row) => pick(row, url.searchParams.get("select"))));
}

/** watch_progress (миграция 20261101230000): свои строки, completed = position ≥ 90 % (вычисляется). */
const progress = new Map();

async function handleProgress(req, res, url) {
  const user = userByToken(req);
  if (!user) return send(res, 401, { code: "42501", message: "permission denied for table watch_progress" });
  const params = [...url.searchParams.entries()];
  if (req.method === "GET") {
    let rows = [...progress.values()].filter((row) => row.user_id === user.id && matches(row, params));
    if (url.searchParams.get("order")?.startsWith("updated_at.desc")) rows = rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const limit = Number(url.searchParams.get("limit") ?? Infinity);
    return sendRows(req, res, 200, rows.slice(0, limit).map((row) => pick(row, url.searchParams.get("select"))));
  }
  if (req.method === "POST") {
    const body = await readJson(req);
    for (const item of Array.isArray(body) ? body : [body]) {
      if (item.user_id !== user.id) return send(res, 403, { code: "42501", message: "new row violates row-level security policy" });
      if (item.position_sec > item.duration_sec + 1) return send(res, 400, { code: "23514", message: "watch_progress_position_within_duration" });
      progress.set(`${item.user_id}:${item.episode_id}`, {
        ...item,
        completed: item.position_sec >= item.duration_sec * 0.9,
        updated_at: new Date().toISOString(),
      });
    }
    return send(res, 201);
  }
  return send(res, 405, { message: "method not allowed in mock" });
}

async function handleRest(req, res, path, url) {
  if (path === "/rest/v1/watch_progress") return handleProgress(req, res, url);
  if (path === "/rest/v1/episodes") return handleReadOnly(req, res, url, EPISODES.filter((e) => e.license_status !== "none"));
  if (path === "/rest/v1/subtitles") return handleReadOnly(req, res, url, SUBTITLES.filter((s) => visibleEpisodeIds.has(s.episode_id)));
  if (path === "/rest/v1/anime_list") return handleAnimeList(req, res, url);
  if (path === "/rest/v1/anime_rating_stats") return handleRatingStats(req, res, url);
  if (path !== "/rest/v1/profiles") return send(res, 404, { code: "PGRST205", message: "not in mock" });

  if (req.method === "GET") {
    const params = [...url.searchParams.entries()];
    const limit = Number(url.searchParams.get("limit") ?? Infinity);
    const rows = [...profiles.values()]
      .filter((row) => matches(row, params))
      .slice(0, limit)
      .map((row) => pick(row, url.searchParams.get("select")));
    return send(res, 200, rows);
  }

  if (req.method === "PATCH") {
    const user = userByToken(req);
    const patch = await readJson(req);
    const params = [...url.searchParams.entries()];
    // RLS: только своя строка; права на уровне колонок: role менять нельзя.
    const targets = [...profiles.values()].filter((row) => matches(row, params) && user && row.id === user.id);
    if ("role" in patch) return send(res, 401, { code: "42501", message: "permission denied for table profiles" });
    for (const row of targets) {
      if (patch.username !== undefined) {
        if (!USERNAME.test(patch.username)) return send(res, 400, { code: "23514", message: "check constraint" });
        if (usernameTaken(patch.username, row.id)) {
          return send(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
        }
      }
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
    }
    return send(res, 204);
  }

  return send(res, 405, { message: "method not allowed in mock" });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  try {
    if (path === "/health") return send(res, 200, { ok: true });
    if (path.startsWith("/auth/v1/")) return await handleAuth(req, res, path, url);
    if (path.startsWith("/rest/v1/")) return await handleRest(req, res, path, url);
    if (path.startsWith("/storage/v1/")) return await handleStorage(req, res, path);
    return send(res, 404, { message: "not found" });
  } catch (error) {
    console.error("[mock-supabase]", error);
    return send(res, 500, { message: "mock error" });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`mock Supabase on http://127.0.0.1:${PORT}`));
