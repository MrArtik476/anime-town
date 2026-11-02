import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

import type { BackfillReport } from "./backfill";
import { isBackfillFailure, parseBackfillLimit } from "./backfill-run";

/**
 * Журнал запусков фонового заполнения (ADR-024): строка в `translation_runs` на каждый запуск.
 * Строка со статусом running — блокировка: второй одновременный запуск не начинается и DeepL не трогает.
 * Пишут Edge Function `translate-cron` (по расписанию pg_cron), `npm run translate` и `/api/cron/translate`.
 */

export type RunTrigger = "cron" | "manual";
export type RunStatus = "ok" | "stopped" | "failed";

/** Запуск, который висит в running дольше этого, считается оборвавшимся (функция живёт не больше 150 с). */
export const RUN_STALE_AFTER_SECONDS = 5 * 60;
/** Сколько символов ошибки сохранять (столбец error ограничен 500). */
const MAX_ERROR_LENGTH = 500;

export interface RunJournal {
  /** id нового запуска; null — уже идёт другой. */
  begin(trigger: RunTrigger): Promise<number | null>;
  finish(id: number, outcome: { status: RunStatus; report: BackfillReport | null; error: string | null }): Promise<void>;
}

export type JournaledRun =
  | { busy: true }
  | { busy: false; runId: number | null; status: RunStatus; report: BackfillReport };

/** ok — дошли до конца; stopped — штатная остановка (квота, бюджет запуска); failed — сбой настройки или базы. */
export function runStatus(report: BackfillReport): RunStatus {
  if (isBackfillFailure(report)) return "failed";
  return report.stopped ? "stopped" : "ok";
}

/** Сообщение ошибки для журнала: одна строка, без лишней длины. Тексты переводов и ключи сюда не попадают. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.replace(/\s+/g, " ").slice(0, MAX_ERROR_LENGTH);
}

/**
 * Заполнение под блокировкой журнала. Без журнала (E2E, память процесса) — просто запуск.
 * Исключение заполнения записывается как failed и пробрасывается дальше.
 */
export async function runJournaledBackfill({
  journal,
  trigger,
  backfill,
}: {
  journal: RunJournal | null;
  trigger: RunTrigger;
  backfill: () => Promise<BackfillReport>;
}): Promise<JournaledRun> {
  const runId = journal ? await journal.begin(trigger) : null;
  if (journal && runId === null) return { busy: true };

  const finish = async (outcome: Parameters<RunJournal["finish"]>[1]) => {
    if (!journal || runId === null) return;
    // Не удалось записать итог — строка станет abandoned через RUN_STALE_AFTER_SECONDS; запуск не роняем.
    await journal.finish(runId, outcome).catch((error: unknown) => {
      console.error("[translator] не удалось записать итог запуска", errorMessage(error));
    });
  };

  let report: BackfillReport;
  try {
    report = await backfill();
  } catch (error) {
    await finish({ status: "failed", report: null, error: errorMessage(error) });
    throw error;
  }
  const status = runStatus(report);
  await finish({ status, report, error: null });
  return { busy: false, runId, status, report };
}

type RunUpdate = Database["public"]["Tables"]["translation_runs"]["Update"];

export function createSupabaseRunJournal(client: SupabaseClient<Database>): RunJournal {
  return {
    async begin(trigger) {
      const { data, error } = await client.rpc("begin_translation_run", {
        p_trigger: trigger,
        p_stale_after_seconds: RUN_STALE_AFTER_SECONDS,
      });
      if (error) throw new Error(`translation_runs: ${error.message}`);
      return data ?? null;
    },
    async finish(id, { status, report, error }) {
      const update: RunUpdate = {
        status,
        finished_at: new Date().toISOString(),
        error,
        candidates: report?.candidates ?? null,
        pending: report?.pending ?? null,
        translated: report?.translated ?? null,
        characters: report?.characters ?? null,
        batches: report?.batches ?? null,
        skipped_oversized: report?.skippedOversized ?? null,
        stopped: report?.stopped ?? null,
        usage_used: report?.usage?.used ?? null,
        usage_limit: report?.usage?.limit ?? null,
        own_limit: report?.usage?.ownLimit ?? null,
      };
      const { error: dbError } = await client.from("translation_runs").update(update).eq("id", id);
      if (dbError) throw new Error(`translation_runs: ${dbError.message}`);
    },
  };
}

/** Журнал в Supabase для запусков из Node (скрипт, Route Handler); в E2E и без service role — null. */
export function getRunJournal(): RunJournal | null {
  if (process.env.ANIME_TOWN_E2E === "1") return null;
  const client = createAdminClient();
  return client ? createSupabaseRunJournal(client) : null;
}

export type SecretKeySource = "TRANSLATE_SUPABASE_SECRET_KEY" | "SUPABASE_SECRET_KEYS" | "SUPABASE_SERVICE_ROLE_KEY";

/**
 * Ключ базы с правами service role для Edge Function и откуда он взят (в лог — только источник).
 * Supabase подставляет SUPABASE_SECRET_KEYS (JSON, ключи sb_secret_ по имени, берётся default) и устаревший
 * SUPABASE_SERVICE_ROLE_KEY; TRANSLATE_SUPABASE_SECRET_KEY — ручная замена через секрет функции.
 */
export function supabaseSecretKey(
  env: Record<string, string | undefined>,
): { key: string; source: SecretKeySource } | null {
  const override = env.TRANSLATE_SUPABASE_SECRET_KEY?.trim();
  if (override) return { key: override, source: "TRANSLATE_SUPABASE_SECRET_KEY" };
  try {
    const keys: unknown = JSON.parse(env.SUPABASE_SECRET_KEYS ?? "null");
    const key = keys && typeof keys === "object" ? (keys as Record<string, unknown>).default : undefined;
    if (typeof key === "string" && key.trim()) return { key: key.trim(), source: "SUPABASE_SECRET_KEYS" };
  } catch {
    // Некорректный JSON — пробуем устаревший ключ ниже.
  }
  const legacy = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return legacy ? { key: legacy, source: "SUPABASE_SERVICE_ROLE_KEY" } : null;
}

/** Сравнение секрета за время, не зависящее от места первого расхождения. */
export function secretMatches(actual: string | null, expected: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(actual ?? "");
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let index = 0; index < b.length; index++) diff |= b[index] ^ (a[index] ?? 0);
  return diff === 0;
}

export const CRON_SECRET_HEADER = "x-cron-secret";

type CronRequestBody = { limit?: unknown; trigger?: unknown };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * Запрос к Edge Function `translate-cron`: POST с заголовком `x-cron-secret: $CRON_SECRET`
 * и телом `{ "trigger": "cron" | "manual", "limit": 1–100 }` (оба поля необязательны).
 * Ответ — только счётчики и причина остановки, без текстов и ключей.
 * 401 — нет или неверный секрет (и когда CRON_SECRET не задан), 405 — не POST, 400 — неверное тело,
 * 409 — уже идёт другой запуск, 500 — запуск завершился сбоем настройки или базы, 502 — исключение.
 */
export async function handleTranslateCronRequest(
  request: Request,
  deps: {
    secret: string | undefined;
    journal: RunJournal | null;
    backfill: (options: { limit: number | undefined }) => Promise<BackfillReport>;
  },
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST" });

  const secret = deps.secret?.trim();
  if (!secret) console.error("[translator] CRON_SECRET не задан — вызовы translate-cron отклоняются");
  if (!secret || !secretMatches(request.headers.get(CRON_SECRET_HEADER), secret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: CronRequestBody = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as CronRequestBody;
    } catch {
      return json({ ok: false, error: "invalid_body", message: "тело — JSON-объект" }, 400);
    }
  }
  if (body.trigger !== undefined && body.trigger !== "cron" && body.trigger !== "manual") {
    return json({ ok: false, error: "invalid_body", message: "trigger — cron или manual" }, 400);
  }
  const trigger: RunTrigger = body.trigger ?? "cron";
  const limit = parseBackfillLimit(body.limit === undefined || body.limit === null ? null : String(body.limit));
  if (!limit.ok) return json({ ok: false, error: "invalid_limit", message: limit.message }, 400);

  try {
    const run = await runJournaledBackfill({
      journal: deps.journal,
      trigger,
      backfill: () => deps.backfill({ limit: limit.limit }),
    });
    if (run.busy) {
      console.warn("[translator] translate-cron: уже идёт другой запуск — пропуск");
      return json({ ok: false, error: "already_running" }, 409);
    }
    console.info("[translator] translate-cron", JSON.stringify({ runId: run.runId, trigger, status: run.status, ...run.report }));
    return json({ ok: run.status !== "failed", runId: run.runId, status: run.status, report: run.report }, run.status === "failed" ? 500 : 200);
  } catch (error) {
    // Сбой AniList, журнала или неожиданная ошибка: следующий запуск повторит работу (она идемпотентна).
    console.error("[translator] translate-cron failed", errorMessage(error));
    return json({ ok: false, error: "backfill_failed" }, 502);
  }
}
