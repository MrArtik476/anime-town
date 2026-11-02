/**
 * Ручной запуск фонового заполнения машинных переводов: `npm run translate [-- --limit N]`.
 *
 * Запускает тот же `runTranslationBackfill`, что и Edge Function `translate-cron` (по расписанию Supabase Cron,
 * ADR-024), и пишет переводы прямо в Supabase (`anime_localizations`, service role). Запуск отмечается
 * в журнале `translation_runs` (trigger = manual) и не начнётся, пока идёт другой. Переменные — из `.env.local`.
 *
 * Вывод — отчёт JSON без текстов и ключей; при `$GITHUB_STEP_SUMMARY` ещё и сводка (workflow_dispatch).
 * Код выхода: 0 — готово (в том числе исчерпанная квота и «уже идёт другой запуск»), 1 — сбой настройки
 * или базы, 2 — неверные аргументы.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import {
  formatBackfillSummary,
  isBackfillFailure,
  MAX_BACKFILL_LIMIT,
  parseBackfillArgs,
} from "@/lib/localization/backfill-run";

const USAGE = `Использование: npm run translate -- [--limit N]   (N от 1 до ${MAX_BACKFILL_LIMIT}, по умолчанию — все кандидаты)`;

/**
 * Переменные из .env.local, как у `next dev`; уже заданные в окружении (секреты CI) не перезаписываются.
 * В E2E (ANIME_TOWN_E2E=1) файл не читается: тест работает только с моками и фиктивными ключами.
 */
function loadEnvLocal(file = ".env.local") {
  if (process.env.ANIME_TOWN_E2E === "1" || !existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    process.env[key] ??= value;
  }
}

async function main(): Promise<number> {
  const args = parseBackfillArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(`Ошибка: ${args.error}\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  loadEnvLocal();
  // Модули читают окружение при вызове, но импорт после загрузки .env.local надёжнее.
  const { runTranslationBackfill } = await import("@/lib/localization/backfill");
  const { getRunJournal, runJournaledBackfill } = await import("@/lib/localization/runs");

  const run = await runJournaledBackfill({
    journal: getRunJournal(),
    trigger: "manual",
    backfill: () => runTranslationBackfill({ limit: args.limit }),
  });
  if (run.busy) {
    console.error("[translator] уже идёт другой запуск (translation_runs) — пропуск");
    return 0;
  }
  const { report } = run;
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatBackfillSummary(report));

  if (isBackfillFailure(report)) {
    console.error(`[translator] заполнение остановлено: ${report.stopped}`);
    return 1;
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Сбой AniList или неожиданная ошибка: следующий запуск повторит работу (она идемпотентна).
    console.error("[translator] backfill failed", error);
    process.exitCode = 1;
  },
);
