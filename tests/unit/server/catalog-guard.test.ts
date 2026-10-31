// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/catalog/route";
import { CATALOG_RATE_LIMIT } from "@/lib/rate-limit/catalog";
import { proxy } from "@/proxy";

const request = (path: string, ip = "203.0.113.10") =>
  new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });

/** Пропущенный proxy-запрос — NextResponse.next() с заголовком x-middleware-next. */
const passed = (response: Response) => response.headers.get("x-middleware-next") === "1";

const exhaust = async (path: string, ip?: string) => {
  for (let i = 0; i < CATALOG_RATE_LIMIT.limit; i++) {
    expect(passed(await proxy(request(path, ip)))).toBe(true);
  }
};

describe("proxy: лимит запросов каталога по IP", () => {
  beforeEach(() => {
    delete (globalThis as { __animeTownCatalogLimiter?: unknown }).__animeTownCatalogLimiter;
  });

  it("каталог без фильтров не ограничивается", async () => {
    for (let i = 0; i < CATALOG_RATE_LIMIT.limit + 5; i++) {
      expect(passed(await proxy(request("/catalog")))).toBe(true);
    }
  });

  it("страница с фильтрами после лимита — 429, Retry-After и русский HTML", async () => {
    await exhaust("/catalog?q=naruto");

    const response = await proxy(request("/catalog?genre=Action"));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain('lang="ru"');
    expect(html).toContain("Слишком много запросов");
    expect(html).toContain('href="/catalog"');
  });

  it("API после лимита — 429 с JSON { ok: false, code: RATE_LIMITED } и сообщением", async () => {
    await exhaust("/api/catalog?page=2");

    const response = await proxy(request("/api/catalog?page=3"));

    expect(response.status).toBe(429);
    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "RATE_LIMITED", retryAfter } });
    expect(body.error.message).toMatch(/Подождите \d+ с/);
  });

  it("страница и API делят один лимит, разные IP — независимы", async () => {
    await exhaust("/catalog?sort=trending", "198.51.100.1");

    expect((await proxy(request("/api/catalog?page=2", "198.51.100.1"))).status).toBe(429);
    expect(passed(await proxy(request("/api/catalog?page=2", "198.51.100.2")))).toBe(true);
  });
});

describe("GET /api/catalog: проверка параметров", () => {
  it.each(["0", "-1", "1.5", "abc", "101"])("page=%s — 400 INVALID_PARAMS с понятным текстом", async (page) => {
    const response = await GET(request(`/api/catalog?page=${page}`));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "INVALID_PARAMS", retryAfter: null } });
    expect(body.error.message).toContain("от 1 до 100");
  });
});
