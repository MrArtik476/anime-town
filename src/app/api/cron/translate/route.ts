import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { runTranslationBackfill } from "@/lib/localization/backfill";

// Vercel Cron (vercel.json) раз в сутки вызывает GET с заголовком Authorization: Bearer $CRON_SECRET.
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
export const maxDuration = 300;

const MAX_LIMIT = 100;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * GET /api/cron/translate?limit=N — фоновое заполнение машинных переводов для трендовых и популярных тайтлов.
 * Отчёт — только счётчики и причина остановки, без текстов и ключей.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)) {
    return Response.json(
      { ok: false, error: "invalid_limit", message: `limit должен быть целым числом от 1 до ${MAX_LIMIT}` },
      { status: 400 },
    );
  }

  try {
    const report = await runTranslationBackfill({ limit });
    console.info("[translator] backfill", JSON.stringify(report));
    return Response.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Сбой AniList или неожиданная ошибка: сайт это не затрагивает, следующий запуск повторит работу.
    console.error("[translator] backfill failed", error);
    return Response.json({ ok: false, error: "backfill_failed" }, { status: 502 });
  }
}
