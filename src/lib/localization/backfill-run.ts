import type { BackfillReport, BackfillStopReason } from "./backfill";

/**
 * Общее для двух способов запуска фонового заполнения: Route Handler `/api/cron/translate` (ручной запуск)
 * и скрипт `npm run translate` (GitHub Actions по расписанию, локально). Сама работа — `runTranslationBackfill`.
 */

/** Больше 100 кандидатов за запуск не бывает (50 трендовых + 50 популярных). */
export const MAX_BACKFILL_LIMIT = 100;

export type LimitParseResult = { ok: true; limit: number | undefined } | { ok: false; message: string };

/** `limit` из строки запроса или аргумента CLI. Пусто — без ограничения. */
export function parseBackfillLimit(raw: string | null | undefined): LimitParseResult {
  if (raw === null || raw === undefined || raw.trim() === "") return { ok: true, limit: undefined };
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BACKFILL_LIMIT) {
    return { ok: false, message: `limit должен быть целым числом от 1 до ${MAX_BACKFILL_LIMIT}` };
  }
  return { ok: true, limit };
}

export type BackfillArgs = { help: true } | { help: false; limit: number | undefined } | { error: string };

/** Аргументы `npm run translate -- [--limit N | --limit=N] [--help]`. */
export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  let rawLimit: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--limit") {
      rawLimit = argv[++index];
      if (rawLimit === undefined) return { error: "после --limit нужно число" };
    } else if (arg.startsWith("--limit=")) {
      rawLimit = arg.slice("--limit=".length);
    } else {
      return { error: `неизвестный аргумент «${arg}»` };
    }
  }
  const parsed = parseBackfillLimit(rawLimit);
  return parsed.ok ? { help: false, limit: parsed.limit } : { error: parsed.message };
}

/**
 * Причины остановки, при которых запуск считается неудачным: настройка неверна или база недоступна —
 * без вмешательства следующий запуск тоже ничего не сделает. Исчерпанная квота и временные сбои
 * провайдера — штатная ситуация: следующий запуск продолжит.
 */
const FAILURES: ReadonlySet<BackfillStopReason> = new Set<BackfillStopReason>([
  "no_translator",
  "no_store",
  "usage_unavailable",
  "AUTH",
  "store_error",
]);

export function isBackfillFailure(report: BackfillReport): boolean {
  return report.stopped !== null && FAILURES.has(report.stopped);
}

const formatNumber = (value: number) => value.toLocaleString("ru-RU");

/** Сводка в Markdown для GitHub Actions (`$GITHUB_STEP_SUMMARY`): только счётчики, без текстов и ключей. */
export function formatBackfillSummary(report: BackfillReport): string {
  const usage = report.usage;
  // Расход до запуска = после минус учтённые символы этого запуска.
  const usageLine = usage
    ? `${formatNumber(usage.used - report.characters)} → ${formatNumber(usage.used)} из ${formatNumber(usage.limit)} (свой предел ${formatNumber(usage.ownLimit)})`
    : "нет данных";
  const rows: [string, string][] = [
    ["Переводчик", report.translator ?? "не настроен"],
    ["Кандидаты", String(report.candidates)],
    ["Нужен перевод", String(report.pending)],
    ["Переведено", String(report.translated)],
    ["Символов за запуск", formatNumber(report.characters)],
    ["Пачек", String(report.batches)],
    ["Пропущено (слишком длинные)", String(report.skippedOversized)],
    ["Расход символов: до → после", usageLine],
    ["Остановка", report.stopped ?? "—"],
  ];
  return [
    `### Машинный перевод: ${isBackfillFailure(report) ? "❌ сбой" : "✅ готово"}`,
    "",
    "| Показатель | Значение |",
    "|---|---|",
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
    "",
  ].join("\n");
}
