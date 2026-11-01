import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

import { runTranslationBackfill } from "@/lib/localization/backfill";
import { parseBackfillLimit } from "@/lib/localization/backfill-run";

// Ручной запуск фонового заполнения (ADR-017): GET с заголовком Authorization: Bearer $CRON_SECRET.
// По расписанию заполнение запускает GitHub Actions скриптом `npm run translate` (тот же runTranslationBackfill).
export const maxDuration = 300;

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

  const parsed = parseBackfillLimit(request.nextUrl.searchParams.get("limit"));
  if (!parsed.ok) {
    return Response.json({ ok: false, error: "invalid_limit", message: parsed.message }, { status: 400 });
  }

  try {
    const report = await runTranslationBackfill({ limit: parsed.limit });
    // Страницы тайтлов кэшируются с переводом (`use cache`, тег localization) — новые переводы видны сразу.
    if (report.translated > 0) revalidateTag("localization", { expire: 0 });
    console.info("[translator] backfill", JSON.stringify(report));
    return Response.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Сбой AniList или неожиданная ошибка: сайт это не затрагивает, следующий запуск повторит работу.
    console.error("[translator] backfill failed", error);
    return Response.json({ ok: false, error: "backfill_failed" }, { status: 502 });
  }
}
