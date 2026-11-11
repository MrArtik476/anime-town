// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CATALOG_RATE_LIMIT } from "@/lib/rate-limit/catalog";
import { config, proxy } from "@/proxy";

const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": "192.0.2.77", ...headers } });

const passed = (response: Response) => response.headers.get("x-middleware-next") === "1";

afterEach(() => vi.unstubAllEnvs());

describe("proxy: страницы аккаунта", () => {
  // Supabase в unit-тестах не настроен → пользователя нет (гость).
  it.each(["/account", "/account/settings", "/auth/update-password", "/notifications"])("гость на %s → /login?next=…", async (path) => {
    const response = await proxy(request(`${path}?tab=1`));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(`${path}?tab=1`);
  });

  it.each(["/", "/login", "/register", "/anime/1", "/accounting"])("%s открыт гостю", async (path) => {
    expect(passed(await proxy(request(path)))).toBe(true);
  });

  it("значения-заглушки Supabase считаются «не настроен» — без сетевых запросов", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://<project-ref>.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_xxx");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(passed(await proxy(request("/")))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("proxy: лимит каталога и prefetch", () => {
  it("prefetch каталога с фильтрами не расходует лимит", async () => {
    const headers = { "next-router-prefetch": "1", "x-forwarded-for": "192.0.2.200" };
    for (let i = 0; i < CATALOG_RATE_LIMIT.limit + 3; i++) {
      expect(passed(await proxy(request("/catalog?genre=Action", headers)))).toBe(true);
    }
    expect(passed(await proxy(request("/catalog?genre=Action", { purpose: "prefetch", "x-forwarded-for": "192.0.2.200" })))).toBe(true);
  });

  it("matcher пропускает статику и картинки", () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test("/account")).toBe(true);
    expect(pattern.test("/catalog")).toBe(true);
    expect(pattern.test("/_next/static/chunks/app.js")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
    expect(pattern.test("/posters/a.webp")).toBe(false);
  });
});
