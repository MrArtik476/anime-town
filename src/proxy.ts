import { type NextRequest, NextResponse } from "next/server";

import { isProtectedPath } from "@/features/auth/validation";
import { hasAnyFilter, parseCatalogParams } from "@/lib/anime/catalog-params";
import { getCatalogRateLimiter, getClientIp } from "@/lib/rate-limit/catalog";
import { rateLimitedHtml, rateLimitedJson } from "@/lib/rate-limit/responses";
import { retryAfterSeconds } from "@/lib/rate-limit/types";
import { updateSession, withSessionCookies } from "@/lib/supabase/proxy";

const CATALOG_API_PATH = "/api/catalog";

function isPrefetch(request: NextRequest): boolean {
  return request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch";
}

/**
 * Защита лимита AniList: ограничение частоты по IP для запросов каталога, которые могут дойти до AniList.
 * Проверка идёт здесь, а не на странице: страница каталога отдаётся потоком, и после начала
 * отрисовки статус ответа уже не поменять — а proxy успевает ответить настоящим 429.
 * Prefetch отдаёт только статическую оболочку и в AniList не ходит — в лимит не считается.
 */
async function limitCatalog(request: NextRequest): Promise<Response | null> {
  const { pathname, searchParams } = request.nextUrl;
  const isApi = pathname === CATALOG_API_PATH;
  if (!isApi && (pathname !== "/catalog" || isPrefetch(request))) return null;

  // Каталог без фильтров — одна общая запись кэша для всех, его не ограничиваем.
  if (!isApi && !hasAnyFilter(parseCatalogParams(searchParams, new Date().getUTCFullYear() + 1))) return null;

  const result = await getCatalogRateLimiter().limit(`catalog:${getClientIp(request.headers)}`);
  if (result.success) return null;

  const retryAfter = retryAfterSeconds(result);
  return isApi ? rateLimitedJson(retryAfter) : rateLimitedHtml(retryAfter);
}

/**
 * 1. Лимит каталога по IP (429 до начала отрисовки).
 * 2. Обновление сессии Supabase (cookies) на каждой странице.
 * 3. Гость на странице аккаунта → /login?next=… (вторая проверка — на самой странице и в RLS).
 */
export async function proxy(request: NextRequest) {
  const limited = await limitCatalog(request);
  if (limited) return limited;

  const { response, userId } = await updateSession(request);

  const { pathname, search } = request.nextUrl;
  if (!userId && isProtectedPath(pathname)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return withSessionCookies(NextResponse.redirect(login), response);
  }
  return response;
}

export const config = {
  // Все маршруты, кроме статики Next.js и файлов изображений.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
