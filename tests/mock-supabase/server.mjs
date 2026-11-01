// Мок Supabase для E2E: минимальный Auth (GoTrue) и Data API (PostgREST) для таблицы profiles.
// Приложение собирается с NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4040 и фиктивным publishable-ключом —
// настоящий проект в тестах не используется. Данные живут в памяти процесса.
//
// Поведение как у Supabase:
// - токены HS256 (подпись фиктивная): @supabase/ssr при getClaims() проверяет их через GET /auth/v1/user;
// - signup с адресом, содержащим «confirm», — без сессии (включено подтверждение почты);
// - профиль создаётся «триггером» при регистрации; занятый ник (без учёта регистра) → запасной user_xxxxxxxx;
// - PATCH profiles — только своя строка (как RLS) и 409 / 23505 при занятом нике;
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
    if (["select", "limit", "order", "offset"].includes(column)) continue;
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

async function handleRest(req, res, path, url) {
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
    return send(res, 404, { message: "not found" });
  } catch (error) {
    console.error("[mock-supabase]", error);
    return send(res, 500, { message: "mock error" });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`mock Supabase on http://127.0.0.1:${PORT}`));
