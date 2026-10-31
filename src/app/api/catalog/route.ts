import type { NextRequest } from "next/server";

import { searchAnime } from "@/lib/anilist/api";
import type { DataErrorCode } from "@/lib/anilist/errors";
import { parseCatalogParams } from "@/lib/anime/catalog-params";

const MAX_CATALOG_API_PAGE = 100;

const STATUS_BY_CODE: Record<DataErrorCode, number> = {
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  NETWORK: 502,
  BAD_RESPONSE: 502,
  INVALID_PARAMS: 400,
};

/**
 * GET /api/catalog?q=&genre=&year=&season=&format=&status=&sort=&page=
 * Следующие страницы каталога для кнопки «Загрузить ещё». Браузер не ходит в AniList напрямую:
 * запросы идут через серверный кэш, а частоту по IP ограничивает proxy.ts.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") ?? "1");

  if (!Number.isInteger(page) || page < 1 || page > MAX_CATALOG_API_PAGE) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_PARAMS",
          retryAfter: null,
          message: `Параметр page должен быть целым числом от 1 до ${MAX_CATALOG_API_PAGE}.`,
        },
      },
      { status: STATUS_BY_CODE.INVALID_PARAMS },
    );
  }

  const filters = parseCatalogParams(params, new Date().getUTCFullYear() + 1);
  const result = await searchAnime(filters, page);

  if (!result.ok) {
    const headers: HeadersInit = result.error.retryAfter ? { "Retry-After": String(result.error.retryAfter) } : {};
    return Response.json(result, { status: STATUS_BY_CODE[result.error.code], headers });
  }
  return Response.json(result);
}
