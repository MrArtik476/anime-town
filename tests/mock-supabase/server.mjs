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
// - notifications / notification_prefs — свои строки; уведомление об ответе создаёт «триггер» при вставке ответа,
//   о новой серии — тестовый вход POST /__test/episode-released { anilist_id, number, emails? } (только мок);
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

/** Разбивает "a,b(c,d),\"e,f\"" по запятым верхнего уровня (скобки и кавычки не режутся). */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === "(") depth += 1;
    else if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (current) parts.push(current);
  return parts;
}

const unquote = (value) => (value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value);
const comparable = (a, b) => (Number.isNaN(Date.parse(a)) || Number.isNaN(Date.parse(b)) || /^\d+$/.test(a) ? [Number(a), Number(b)] : [Date.parse(a), Date.parse(b)]);

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Шаблон ilike → RegExp: % и * — любая строка, _ — один символ, \x — буквально x. */
function ilikeRegExp(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "\\" && i + 1 < pattern.length) source += escapeRegExp(pattern[(i += 1)]);
    else if (char === "%" || char === "*") source += ".*";
    else if (char === "_") source += ".";
    else source += escapeRegExp(char);
  }
  return new RegExp(`^${source}$`, "iu");
}

/** Условие PostgREST "op.value" для одной колонки: eq, neq, lt, gt, is, in, ilike. */
function condition(row, column, filter) {
  const dot = filter.indexOf(".");
  const op = filter.slice(0, dot);
  const value = unquote(filter.slice(dot + 1));
  const cell = row[column];
  switch (op) {
    case "eq":
      return String(cell) === value;
    case "neq":
      return String(cell) !== value;
    case "lt":
    case "gt": {
      if (cell == null) return false;
      const [a, b] = comparable(String(cell), value);
      return op === "lt" ? a < b : a > b;
    }
    case "is":
      return value === "null" ? cell == null : String(cell) === value;
    case "in":
      return splitTopLevel(value.replace(/^\(|\)$/g, "")).map(unquote).includes(String(cell));
    case "ilike":
      return ilikeRegExp(value).test(String(cell));
    default:
      return true;
  }
}

/** Логическое выражение or(...)/and(...) из параметра or=(…): элементы — "column.op.value" или вложенные группы. */
function logic(row, kind, inner) {
  const results = splitTopLevel(inner).map((part) => {
    const group = part.match(/^(or|and)\((.*)\)$/);
    if (group) return logic(row, group[1], group[2]);
    const dot = part.indexOf(".");
    return condition(row, part.slice(0, dot), part.slice(dot + 1));
  });
  return kind === "or" ? results.some(Boolean) : results.every(Boolean);
}

/** Фильтры запроса PostgREST (column=op.value, or=(…), and=(…)). */
function matches(row, params) {
  for (const [column, filter] of params) {
    if (["select", "limit", "order", "offset", "on_conflict", "columns"].includes(column)) continue;
    if (column === "or" || column === "and") {
      if (!logic(row, column, filter.replace(/^\(|\)$/g, ""))) return false;
    } else if (!condition(row, column, filter)) return false;
  }
  return true;
}

/** order=a.desc,b.asc */
function sortRows(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map((part) => {
    const [column, direction] = part.split(".");
    return { column, sign: direction === "desc" ? -1 : 1 };
  });
  return [...rows].sort((x, y) => {
    for (const { column, sign } of keys) {
      const [a, b] = comparable(String(x[column]), String(y[column]));
      // Текстовые колонки (ник, роль) — по алфавиту.
      if (Number.isNaN(a) || Number.isNaN(b)) {
        const order = String(x[column]).localeCompare(String(y[column]));
        if (order !== 0) return order * sign;
      } else if (a !== b) return (a < b ? -1 : 1) * sign;
    }
    return 0;
  });
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
const LICENSES = ["none", "own", "licensed", "open_license"];
const EPISODE_COLUMNS = ["anilist_id", "number", "title", "duration_sec", "license_status", "hls_url", "attribution", "attribution_url"];
const SUBTITLE_COLUMNS = ["episode_id", "lang", "label", "url", "is_default"];
let episodeSeq = 1000;
let subtitleSeq = 1000;
const isAdminUser = (user) => profiles.get(user?.id)?.role === "admin";
const denied = (res, table) => send(res, 403, { code: "42501", message: `permission denied for table ${table}`, details: null, hint: null });

/** Проверки таблицы episodes (упрощённо, как check-ограничения миграции серий). */
function episodeError(row) {
  if (!Number.isSafeInteger(row.anilist_id) || row.anilist_id < 1) return "23514";
  if (!Number.isSafeInteger(row.number) || row.number < 1) return "23514";
  if (!LICENSES.includes(row.license_status)) return "23514";
  if (row.duration_sec != null && !(Number.isSafeInteger(row.duration_sec) && row.duration_sec > 0)) return "23514";
  if (row.license_status !== "none" && !row.hls_url) return "23514";
  if (EPISODES.some((e) => e.id !== row.id && e.anilist_id === row.anilist_id && e.number === row.number)) return "23505";
  return null;
}

function subtitleError(row) {
  if (!EPISODES.some((e) => e.id === row.episode_id)) return "23503";
  if (typeof row.lang !== "string" || !row.lang || !row.label || !row.url) return "23514";
  if (SUBTITLES.some((s) => s.id !== row.id && s.episode_id === row.episode_id && s.lang === row.lang)) return "23505";
  return null;
}

const constraintError = (res, code) =>
  send(res, code === "23505" ? 409 : 400, {
    code,
    message: code === "23505" ? "duplicate key value violates unique constraint" : "violates constraint",
    details: null,
    hint: null,
  });

/**
 * Серии и субтитры (миграция 20261110153346_admin): читать черновики (none) и менять может только admin;
 * остальным — как раньше, только серии с правами. Выход серии с правами рассылает уведомления (триггеры episodes).
 */
async function handleCatalogTable(req, res, url, table) {
  const user = userByToken(req);
  const admin = isAdminUser(user);
  const isEpisodes = table === "episodes";
  const store = isEpisodes ? EPISODES : SUBTITLES;
  const published = new Set(EPISODES.filter((e) => e.license_status !== "none").map((e) => e.id));
  const readable = (row) => admin || published.has(isEpisodes ? row.id : row.episode_id);
  if (req.method === "GET") return handleReadOnly(req, res, url, store.filter(readable));
  if (!admin) return denied(res, table);

  const params = [...url.searchParams.entries()];
  const columns = isEpisodes ? EPISODE_COLUMNS : SUBTITLE_COLUMNS;
  const validate = isEpisodes ? episodeError : subtitleError;

  if (req.method === "POST") {
    const item = await readJson(req);
    if (Array.isArray(item) || Object.keys(item).some((key) => !columns.includes(key))) return denied(res, table);
    const row = isEpisodes
      ? { id: (episodeSeq += 1), title: null, duration_sec: null, license_status: "none", hls_url: null, attribution: null, attribution_url: null, ...item }
      : { id: (subtitleSeq += 1), is_default: false, ...item };
    const code = validate(row);
    if (code) return constraintError(res, code);
    store.push(row);
    if (isEpisodes && row.license_status !== "none") releaseEpisode({ anilist_id: row.anilist_id, number: row.number });
    return respondRows(req, res, url, 201, [row]);
  }

  if (req.method === "PATCH") {
    const patch = await readJson(req);
    const fixed = isEpisodes ? "anilist_id" : "episode_id";
    if (Object.keys(patch).some((key) => !columns.includes(key) || key === fixed)) return denied(res, table);
    const targets = store.filter((row) => matches(row, params));
    for (const row of targets) {
      const code = validate({ ...row, ...patch });
      if (code) return constraintError(res, code);
    }
    for (const row of targets) {
      const wasDraft = isEpisodes && row.license_status === "none";
      Object.assign(row, patch);
      if (wasDraft && row.license_status !== "none") releaseEpisode({ anilist_id: row.anilist_id, number: row.number });
    }
    return respondRows(req, res, url, 200, targets);
  }

  if (req.method === "DELETE") {
    const targets = store.filter((row) => matches(row, params));
    for (const row of targets) {
      store.splice(store.indexOf(row), 1);
      // on delete cascade: субтитры уходят вместе с серией.
      if (isEpisodes) for (const sub of SUBTITLES.filter((s) => s.episode_id === row.id)) SUBTITLES.splice(SUBTITLES.indexOf(sub), 1);
    }
    return respondRows(req, res, url, 200, targets);
  }
  return send(res, 405, { message: "method not allowed in mock" });
}

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

/**
 * Комментарии (миграции 20261103102438, 20261103105041 — ADR-025), упрощённо: клиенту — insert, update (body),
 * delete (мягкий); ветка в один уровень, флуд 5 в минуту, бан, жалобы. Коды — как у PostgREST (PT429 → 429 …).
 * Настоящую логику базы проверяет npm run rls:check, мок повторяет контракт.
 */
const comments = new Map();
const commentReports = [];
const userBans = [];
let commentSeq = 0;
let lastCommentTime = 0;
const COMMENT_INSERT = ["anilist_id", "episode_id", "parent_id", "reply_to_user_id", "body", "is_spoiler", "anime_title", "anime_cover_url"];
const REPORT_REASONS = ["spam", "offensive", "spoiler", "other"];

const pgError = (res, httpStatus, code, message, details = null) => send(res, httpStatus, { code, message, details, hint: null });
const isModerator = (user) => ["moderator", "admin"].includes(profiles.get(user?.id)?.role);
const activeBan = (userId) =>
  userBans.find((ban) => ban.user_id === userId && !ban.revoked_at && (!ban.expires_at || Date.parse(ban.expires_at) > Date.now()));
const visibleTo = (user) => (row) => row.status !== "hidden" || isModerator(user);
/** Строго растущее время создания — keyset по created_at в тестах не зависит от совпадений. */
function nextCommentTime() {
  lastCommentTime = Math.max(Date.now(), lastCommentTime + 1);
  return new Date(lastCommentTime).toISOString();
}
function changeReplyCount(rootId, delta) {
  const root = comments.get(rootId);
  if (root) root.reply_count = Math.max(root.reply_count + delta, 0);
}

function respondRows(req, res, url, status, rows) {
  const prefer = req.headers.prefer ?? "";
  if (req.method !== "GET" && !prefer.includes("return=representation")) return send(res, status === 200 ? 204 : status);
  return sendRows(req, res, status, rows.map((row) => pick(row, url.searchParams.get("select"))));
}

async function handleComments(req, res, url) {
  const user = userByToken(req);
  const params = [...url.searchParams.entries()];

  if (req.method === "GET") {
    const rows = sortRows([...comments.values()].filter(visibleTo(user)).filter((row) => matches(row, params)), url.searchParams.get("order"));
    const select = url.searchParams.get("select");
    // Встраивание по внешнему ключу на себя: root:parent_id(status) — корень ветки; скрытый RLS корень → null.
    const embeds = (select ?? "").split(",").flatMap((part) => {
      const embed = part.trim().match(/^(\w+):(\w+)\(([^)]*)\)$/);
      return embed ? [{ alias: embed[1], key: embed[2], columns: embed[3] }] : [];
    });
    const plain = (select ?? "*")
      .split(",")
      .filter((part) => !part.includes("("))
      .join(",");
    const shape = (row) => {
      const out = { ...pick(row, plain) };
      for (const { alias, key, columns } of embeds) {
        const target = row[key] == null ? undefined : comments.get(row[key]);
        out[alias] = target && visibleTo(user)(target) ? pick(target, columns) : null;
      }
      return out;
    };
    return sendRows(req, res, 200, rows.slice(0, Number(url.searchParams.get("limit") ?? Infinity)).map(shape));
  }
  if (!user) return pgError(res, 401, "42501", "permission denied for table comments");

  if (req.method === "POST") {
    const item = await readJson(req);
    if (Object.keys(item).some((key) => !COMMENT_INSERT.includes(key))) return pgError(res, 403, "42501", "permission denied for table comments");
    if (item.parent_id != null) {
      const parent = comments.get(item.parent_id);
      if (!parent || parent.parent_id !== null || parent.status !== "visible" || parent.anilist_id !== item.anilist_id || (parent.episode_id ?? null) !== (item.episode_id ?? null)) {
        return pgError(res, 422, "PT422", "invalid_thread");
      }
      const inThread = [...comments.values()].some((row) => row.parent_id === parent.id && row.user_id === item.reply_to_user_id);
      if (item.reply_to_user_id && item.reply_to_user_id !== parent.user_id && !inThread) return pgError(res, 422, "PT422", "invalid_reply_to");
    } else if (item.reply_to_user_id) return pgError(res, 422, "PT422", "invalid_reply_to");
    const ban = activeBan(user.id);
    if (ban) return pgError(res, 403, "PT403", "banned", ban.expires_at ?? "forever");
    const minuteAgo = Date.now() - 60_000;
    if ([...comments.values()].filter((row) => row.user_id === user.id && Date.parse(row.created_at) > minuteAgo).length >= 5) {
      return pgError(res, 429, "PT429", "rate_limited");
    }
    if (item.episode_id != null) {
      const episode = EPISODES.find((e) => e.id === item.episode_id && e.license_status !== "none");
      if (!episode || episode.anilist_id !== item.anilist_id) return pgError(res, 403, "42501", "new row violates row-level security policy");
    }
    const body = typeof item.body === "string" ? item.body.trim() : "";
    if (body.length < 1 || body.length > 2000) return pgError(res, 400, "23514", "comments_body_length");
    const row = {
      id: (commentSeq += 1),
      user_id: user.id,
      anilist_id: item.anilist_id,
      episode_id: item.episode_id ?? null,
      parent_id: item.parent_id ?? null,
      reply_to_user_id: item.reply_to_user_id ?? null,
      body: item.body,
      is_spoiler: Boolean(item.is_spoiler),
      status: "visible",
      reply_count: 0,
      anime_title: item.anime_title ?? null,
      anime_cover_url: item.anime_cover_url ?? null,
      created_at: nextCommentTime(),
      edited_at: null,
    };
    comments.set(row.id, row);
    if (row.parent_id) {
      changeReplyCount(row.parent_id, 1);
      notifyReply(row);
    }
    return respondRows(req, res, url, 201, [row]);
  }

  // RLS update/delete: только свой видимый комментарий.
  const own = [...comments.values()].filter((row) => row.user_id === user.id && row.status === "visible" && matches(row, params));
  if (req.method === "PATCH") {
    const patch = await readJson(req);
    if (Object.keys(patch).some((key) => key !== "body")) return pgError(res, 403, "42501", "permission denied for table comments");
    const body = typeof patch.body === "string" ? patch.body.trim() : "";
    if (body.length < 1 || body.length > 2000) return pgError(res, 400, "23514", "comments_body_length");
    for (const row of own) Object.assign(row, { body: patch.body, edited_at: new Date().toISOString() });
    return respondRows(req, res, url, 200, own);
  }
  if (req.method === "DELETE") {
    for (const row of own) {
      Object.assign(row, { status: "deleted", body: null, is_spoiler: false });
      if (row.parent_id) changeReplyCount(row.parent_id, -1);
    }
    return respondRows(req, res, url, 200, []);
  }
  return send(res, 405, { message: "method not allowed in mock" });
}

async function handleReplyPreviews(req, res) {
  const user = userByToken(req);
  const { root_ids: rootIds = [], per_root: perRoot } = await readJson(req);
  if (rootIds.length > 20) return pgError(res, 422, "PT422", "too_many_roots");
  const limit = Math.min(Math.max(perRoot ?? 3, 1), 20);
  const rows = rootIds.flatMap((rootId) =>
    sortRows(
      [...comments.values()].filter((row) => row.parent_id === rootId && row.status !== "deleted").filter(visibleTo(user)),
      "created_at.asc,id.asc",
    ).slice(0, limit),
  );
  return send(res, 200, rows);
}

async function handleReports(req, res, url) {
  const user = userByToken(req);
  if (!user) return pgError(res, 401, "42501", "permission denied for table comment_reports");
  if (req.method === "GET") {
    const rows = commentReports.filter((row) => (row.reporter_id === user.id || isModerator(user)) && matches(row, [...url.searchParams.entries()]));
    return sendRows(req, res, 200, rows.map((row) => pick(row, url.searchParams.get("select"))));
  }
  if (req.method !== "POST") return pgError(res, 403, "42501", "permission denied for table comment_reports");
  const item = await readJson(req);
  const ban = activeBan(user.id);
  if (ban) return pgError(res, 403, "PT403", "banned", ban.expires_at ?? "forever");
  const target = comments.get(item.comment_id);
  if (!target || target.status !== "visible" || target.user_id === user.id) return pgError(res, 422, "PT422", "invalid_report");
  if (!REPORT_REASONS.includes(item.reason)) return pgError(res, 400, "23514", "comment_reports_reason_check");
  if (commentReports.some((row) => row.comment_id === item.comment_id && row.reporter_id === user.id)) {
    return pgError(res, 409, "23505", "duplicate key value violates unique constraint");
  }
  const row = {
    id: commentReports.length + 1,
    comment_id: item.comment_id,
    reporter_id: user.id,
    reason: item.reason,
    details: item.details ?? null,
    status: "open",
    resolved_by: null,
    resolved_at: null,
    created_at: new Date().toISOString(),
  };
  commentReports.push(row);
  return respondRows(req, res, url, 201, [row]);
}

/**
 * Действия модератора (moderation_actions): вставка — команда, эффект применяет «триггер» (как private.moderation_apply).
 * Только модератор; недопустимое действие — PT422.
 */
const moderationActions = [];
const BAN_DAYS = { "1d": 1, "7d": 7, "30d": 30 };

async function handleModerationActions(req, res, url) {
  const user = userByToken(req);
  if (!user || req.method !== "POST") return pgError(res, 401, "42501", "permission denied for table moderation_actions");
  if (!isModerator(user)) return pgError(res, 403, "42501", "not_moderator");
  const item = await readJson(req);
  const now = new Date().toISOString();
  const resolveReports = (commentId, status) => {
    let changed = 0;
    for (const report of commentReports) {
      if (report.comment_id === commentId && report.status === "open") {
        Object.assign(report, { status, resolved_by: user.id, resolved_at: now });
        changed += 1;
      }
    }
    return changed;
  };
  const target = item.comment_id != null ? comments.get(item.comment_id) : undefined;
  if (["hide", "restore", "dismiss_reports"].includes(item.action) && !target) return pgError(res, 422, "PT422", "comment_not_found");
  switch (item.action) {
    case "hide":
      if (target.status !== "visible") return pgError(res, 422, "PT422", "not_visible");
      target.status = "hidden";
      resolveReports(target.id, "resolved");
      break;
    case "restore":
      if (target.status !== "hidden") return pgError(res, 422, "PT422", "not_hidden");
      target.status = "visible";
      break;
    case "dismiss_reports":
      if (resolveReports(target.id, "dismissed") === 0) return pgError(res, 422, "PT422", "no_open_reports");
      break;
    case "ban": {
      const role = profiles.get(item.target_user_id)?.role;
      if (role !== "user" || item.target_user_id === user.id || !(item.ban_duration in BAN_DAYS || item.ban_duration === "forever")) {
        return pgError(res, 422, "PT422", "invalid_ban_target");
      }
      const days = BAN_DAYS[item.ban_duration];
      userBans.push({
        id: userBans.length + 1,
        user_id: item.target_user_id,
        moderator_id: user.id,
        reason: item.reason ?? null,
        expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
        revoked_at: null,
        revoked_by: null,
        created_at: now,
      });
      break;
    }
    case "unban": {
      const active = userBans.filter(
        (ban) => ban.user_id === item.target_user_id && !ban.revoked_at && (!ban.expires_at || Date.parse(ban.expires_at) > Date.now()),
      );
      if (active.length === 0) return pgError(res, 422, "PT422", "no_active_ban");
      for (const ban of active) Object.assign(ban, { revoked_at: now, revoked_by: user.id });
      break;
    }
    default:
      return pgError(res, 422, "PT422", "unknown_action");
  }
  const row = { id: moderationActions.length + 1, moderator_id: user.id, ...item, target_user_id: item.target_user_id ?? target?.user_id ?? null, created_at: now };
  moderationActions.push(row);
  return respondRows(req, res, url, 201, [row]);
}

function handleBans(req, res, url) {
  const user = userByToken(req);
  if (!user || req.method !== "GET") return pgError(res, 401, "42501", "permission denied for table user_bans");
  const rows = userBans.filter((row) => (row.user_id === user.id || isModerator(user)) && matches(row, [...url.searchParams.entries()]));
  return sendRows(req, res, 200, rows.map((row) => pick(row, url.searchParams.get("select"))));
}

/**
 * Уведомления (миграции PR 5b-1, ADR-026), упрощённо. Клиенту — select своих и update только read_at;
 * insert/delete нет — строки создают «триггеры»: notifyReply (ответ в ветке) и POST /__test/episode-released
 * (выход серии — только в моке; в базе это триггеры на episodes). Нет строки notification_prefs — всё включено.
 */
const notifications = [];
/** user_id → { user_id, reply, new_episode, updated_at } */
const notificationPrefs = new Map();
let notificationSeq = 0;
const COVER_PREFIX = "https://s4.anilist.co/file/anilistcdn/";
const snapshotCover = (url) => (typeof url === "string" && url.startsWith(COVER_PREFIX) && url.length <= 500 ? url : null);
const wants = (userId, kind) => notificationPrefs.get(userId)?.[kind] !== false;

/** Как триггер на comments: автор корня и reply_to, без повторов и без самого автора ответа. */
function notifyReply(reply) {
  const root = comments.get(reply.parent_id);
  if (!root) return;
  const episode = EPISODES.find((e) => e.id === reply.episode_id);
  for (const userId of new Set([root.user_id, reply.reply_to_user_id].filter(Boolean))) {
    if (userId === reply.user_id || !wants(userId, "reply")) continue;
    // Снимок тайтла — из комментария самого получателя в этой ветке (корень или его последний ответ), §6.3.
    const own = [root, ...[...comments.values()].filter((row) => row.parent_id === root.id && row.id !== reply.id)]
      .filter((row) => row.user_id === userId)
      .at(-1);
    notifications.push({
      id: (notificationSeq += 1),
      user_id: userId,
      type: "reply",
      anilist_id: reply.anilist_id,
      episode_number: episode?.number ?? null,
      comment_id: reply.id,
      actor_id: reply.user_id,
      title: own?.anime_title ?? null,
      cover_url: own ? snapshotCover(own.anime_cover_url) : null,
      created_at: nextCommentTime(),
      read_at: null,
    });
  }
}

/**
 * Как episodes_notify_insert/update: получатели — у кого тайтл в «Смотрю»/«Хочу посмотреть» и new_episode не выключен;
 * непрочитанное по тайтлу одно (номер — наибольший, время — сейчас), после прочтения — новое (повторный выход серии).
 * emails — изоляция тестов на общем моке: уведомить только этих пользователей (в базе такого параметра нет).
 */
function releaseEpisode({ anilist_id: animeId, number, emails }) {
  if (!Number.isSafeInteger(animeId) || !Number.isSafeInteger(number)) return { error: "anilist_id и number — целые" };
  const only = Array.isArray(emails) ? new Set(emails.map((email) => users.get(email)?.id).filter(Boolean)) : null;
  let notified = 0;
  for (const entry of animeList.values()) {
    if (entry.anilist_id !== animeId || !["watching", "planned"].includes(entry.status)) continue;
    if ((only && !only.has(entry.user_id)) || !wants(entry.user_id, "new_episode")) continue;
    const unread = notifications.find((n) => n.user_id === entry.user_id && n.anilist_id === animeId && n.type === "new_episode" && n.read_at === null);
    if (unread) Object.assign(unread, { episode_number: Math.max(unread.episode_number, number), created_at: nextCommentTime() });
    else {
      notifications.push({
        id: (notificationSeq += 1),
        user_id: entry.user_id,
        type: "new_episode",
        anilist_id: animeId,
        episode_number: number,
        comment_id: null,
        actor_id: null,
        title: entry.title ?? null,
        cover_url: snapshotCover(entry.cover_url),
        created_at: nextCommentTime(),
        read_at: null,
      });
    }
    notified += 1;
  }
  return { notified };
}

async function handleNotifications(req, res, url) {
  const user = userByToken(req);
  if (!user) return pgError(res, 401, "42501", "permission denied for table notifications");
  const params = [...url.searchParams.entries()];
  const own = () => notifications.filter((row) => row.user_id === user.id && matches(row, params));

  if (req.method === "GET" || req.method === "HEAD") {
    const rows = sortRows(own(), url.searchParams.get("order"));
    const limited = rows.slice(0, Number(url.searchParams.get("limit") ?? Infinity));
    // count=exact (select("id", { count: "exact", head: true })) — число в Content-Range, как у PostgREST.
    const counted = (req.headers.prefer ?? "").includes("count=exact") ? { "Content-Range": `${limited.length ? `0-${limited.length - 1}` : "*"}/${rows.length}` } : {};
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "X-Supabase-Api-Version": API_VERSION, ...counted });
      return res.end();
    }
    return send(res, 200, limited.map((row) => pick(row, url.searchParams.get("select"))), counted);
  }
  if (req.method === "PATCH") {
    const patch = await readJson(req);
    // Права на уровне колонок: клиенту можно менять только read_at.
    if (Object.keys(patch).some((key) => key !== "read_at")) return pgError(res, 403, "42501", "permission denied for table notifications");
    const changed = own();
    for (const row of changed) row.read_at = patch.read_at;
    return respondRows(req, res, url, 200, changed);
  }
  return pgError(res, 403, "42501", "permission denied for table notifications");
}

async function handleNotificationPrefs(req, res, url) {
  const user = userByToken(req);
  if (!user) return pgError(res, 401, "42501", "permission denied for table notification_prefs");
  if (req.method === "GET") {
    const rows = [...notificationPrefs.values()].filter((row) => row.user_id === user.id && matches(row, [...url.searchParams.entries()]));
    return sendRows(req, res, 200, rows.map((row) => pick(row, url.searchParams.get("select"))));
  }
  if (req.method === "POST" || req.method === "PATCH") {
    const body = await readJson(req);
    const item = req.method === "PATCH" ? { ...notificationPrefs.get(user.id), ...body, user_id: user.id } : body;
    // RLS with check: только своя строка.
    if (item.user_id !== user.id) return pgError(res, 403, "42501", "new row violates row-level security policy");
    const row = {
      user_id: user.id,
      reply: item.reply ?? notificationPrefs.get(user.id)?.reply ?? true,
      new_episode: item.new_episode ?? notificationPrefs.get(user.id)?.new_episode ?? true,
      updated_at: new Date().toISOString(),
    };
    notificationPrefs.set(user.id, row);
    return respondRows(req, res, url, 201, [row]);
  }
  return pgError(res, 403, "42501", "permission denied for table notification_prefs");
}

/** admin_actions (миграция 20261110153346_admin): журнал видит и пишет только admin; эффект — как private.admin_apply. */
const adminActions = [];

async function handleAdminActions(req, res, url) {
  const user = userByToken(req);
  if (!user) return pgError(res, 401, "42501", "permission denied for table admin_actions");
  if (req.method === "GET") {
    const rows = isAdminUser(user) ? adminActions.filter((row) => matches(row, [...url.searchParams.entries()])) : [];
    const limit = Number(url.searchParams.get("limit") ?? Infinity);
    const sorted = sortRows(rows, url.searchParams.get("order")).slice(0, limit);
    return sendRows(req, res, 200, sorted.map((row) => pick(row, url.searchParams.get("select"))));
  }
  if (req.method !== "POST") return pgError(res, 403, "42501", "permission denied for table admin_actions");
  const item = await readJson(req);
  if (Object.keys(item).some((key) => !["action", "target_user_id", "new_role"].includes(key))) {
    return pgError(res, 403, "42501", "permission denied for table admin_actions");
  }
  if (!isAdminUser(user)) return pgError(res, 403, "42501", "not_admin");
  if (item.action !== "set_role") return pgError(res, 422, "PT422", "unknown_action");
  if (!["user", "moderator", "admin"].includes(item.new_role)) return pgError(res, 422, "PT422", "invalid_role_change");
  if (item.target_user_id === user.id) return pgError(res, 422, "PT422", "own_role");
  const target = profiles.get(item.target_user_id);
  if (!target) return pgError(res, 422, "PT422", "user_not_found");
  if (target.role === item.new_role) return pgError(res, 422, "PT422", "role_unchanged");
  const row = {
    id: adminActions.length + 1,
    admin_id: user.id,
    action: "set_role",
    target_user_id: target.id,
    old_role: target.role,
    new_role: item.new_role,
    created_at: nextCommentTime(),
  };
  target.role = item.new_role;
  adminActions.push(row);
  return respondRows(req, res, url, 201, [row]);
}

async function handleRest(req, res, path, url) {
  if (path === "/rest/v1/admin_actions") return handleAdminActions(req, res, url);
  if (path === "/rest/v1/notifications") return handleNotifications(req, res, url);
  if (path === "/rest/v1/notification_prefs") return handleNotificationPrefs(req, res, url);
  if (path === "/rest/v1/comments") return handleComments(req, res, url);
  if (path === "/rest/v1/rpc/comment_reply_previews") return handleReplyPreviews(req, res);
  if (path === "/rest/v1/comment_reports") return handleReports(req, res, url);
  if (path === "/rest/v1/user_bans") return handleBans(req, res, url);
  if (path === "/rest/v1/moderation_actions") return handleModerationActions(req, res, url);
  if (path === "/rest/v1/watch_progress") return handleProgress(req, res, url);
  if (path === "/rest/v1/episodes") return handleCatalogTable(req, res, url, "episodes");
  if (path === "/rest/v1/subtitles") return handleCatalogTable(req, res, url, "subtitles");
  if (path === "/rest/v1/anime_list") return handleAnimeList(req, res, url);
  if (path === "/rest/v1/anime_rating_stats") return handleRatingStats(req, res, url);
  if (path !== "/rest/v1/profiles") return send(res, 404, { code: "PGRST205", message: "not in mock" });

  if (req.method === "GET") {
    const params = [...url.searchParams.entries()];
    const limit = Number(url.searchParams.get("limit") ?? Infinity);
    const rows = sortRows(
      [...profiles.values()].filter((row) => matches(row, params)),
      url.searchParams.get("order"),
    )
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

// Модератор для E2E (роль в базе ставит владелец SQL-запросом — DEVELOPMENT.md).
const MODERATOR = { email: "moderator@e2e.test", password: "Sakura-2026!", username: "moderator_e2e" };
{
  const moderator = {
    id: randomUUID(),
    email: MODERATOR.email,
    password: MODERATOR.password,
    metadata: { username: MODERATOR.username },
    confirmed: true,
    created_at: new Date().toISOString(),
  };
  users.set(moderator.email, moderator);
  createProfile(moderator);
  profiles.get(moderator.id).role = "moderator";
}

// Администратор для E2E (первого администратора в базе назначает владелец — DEVELOPMENT.md).
const ADMIN = { email: "admin@e2e.test", password: "Sakura-2026!", username: "admin_e2e" };
{
  const admin = {
    id: randomUUID(),
    email: ADMIN.email,
    password: ADMIN.password,
    metadata: { username: ADMIN.username },
    confirmed: true,
    created_at: new Date().toISOString(),
  };
  users.set(admin.email, admin);
  createProfile(admin);
  profiles.get(admin.id).role = "admin";
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  try {
    if (path === "/health") return send(res, 200, { ok: true });
    // Тестовый вход «серия вышла» — только в моке (в приложении такого маршрута нет).
    if (req.method === "POST" && path === "/__test/episode-released") {
      const result = releaseEpisode(await readJson(req));
      return send(res, result.error ? 400 : 200, result);
    }
    if (path.startsWith("/auth/v1/")) return await handleAuth(req, res, path, url);
    if (path.startsWith("/rest/v1/")) return await handleRest(req, res, path, url);
    if (path.startsWith("/storage/v1/")) return await handleStorage(req, res, path);
    return send(res, 404, { message: "not found" });
  } catch (error) {
    console.error("[mock-supabase]", error);
    return send(res, 500, { message: "mock error" });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`mock Supabase on http://127.0.0.1:${PORT}`));
