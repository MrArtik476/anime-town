import { type NextRequest, NextResponse } from "next/server";

import { hasAnyFilter, parseCatalogParams } from "@/lib/anime/catalog-params";
import { getCatalogRateLimiter, getClientIp } from "@/lib/rate-limit/catalog";
import { rateLimitedHtml, rateLimitedJson } from "@/lib/rate-limit/responses";
import { retryAfterSeconds } from "@/lib/rate-limit/types";

const CATALOG_API_PATH = "/api/catalog";

/**
 * Защита лимита AniList: ограничение частоты по IP для запросов каталога, которые могут дойти до AniList.
 * Проверка идёт здесь, а не на странице: страница каталога отдаётся потоком, и после начала
 * отрисовки статус ответа уже не поменять — а proxy успевает ответить настоящим 429.
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isApi = pathname === CATALOG_API_PATH;

  // Каталог без фильтров — одна общая запись кэша для всех, его не ограничиваем.
  if (!isApi && !hasAnyFilter(parseCatalogParams(searchParams, new Date().getUTCFullYear() + 1))) {
    return NextResponse.next();
  }

  const result = await getCatalogRateLimiter().limit(`catalog:${getClientIp(request.headers)}`);
  if (result.success) return NextResponse.next();

  const retryAfter = retryAfterSeconds(result);
  return isApi ? rateLimitedJson(retryAfter) : rateLimitedHtml(retryAfter);
}

export const config = {
  matcher: [
    // Prefetch отдаёт только статическую оболочку и в AniList не ходит — в лимит не считается.
    {
      source: "/catalog",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    "/api/catalog",
  ],
};
