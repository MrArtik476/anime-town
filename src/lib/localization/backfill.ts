import { anilistRequest } from "@/lib/anilist/client";
import { EXCLUDED_GENRES, TRANSLATION_CANDIDATES_QUERY } from "@/lib/anilist/queries";
import { cleanDescription } from "@/lib/anime/format";

import { chunkForTranslation } from "./batches";
import { createUsageTracker, monthlyCharLimit, remainingBudget, runCharLimit } from "./budget";
import { descriptionHash } from "./hash";
import { needsMachineTranslation, withMachineTranslation } from "./resolve";
import { loadLocalizations } from "./service";
import { getLocalizationStore } from "./store";
import { getTranslator, type Translator } from "./translator";
import { isTranslatorError, type TranslatorErrorCode } from "./translators/errors";
import type { LocalizationStore } from "./types";

/** Сколько трендовых и сколько популярных тайтлов AniList рассматривать за запуск (один запрос). */
export const CANDIDATES_PER_LIST = 50;

export type TranslationCandidate = { id: number; malId: number | null; description: string };

export type BackfillStopReason =
  | "no_translator"
  | "no_store"
  | "usage_unavailable"
  | "budget_exhausted"
  | TranslatorErrorCode
  | "store_error";

export type BackfillReport = {
  translator: string | null;
  candidates: number;
  pending: number;
  translated: number;
  characters: number;
  batches: number;
  skippedOversized: number;
  stopped: BackfillStopReason | null;
  /** Использование после запуска (по данным провайдера и учёту этого запуска). */
  usage: { used: number; limit: number; ownLimit: number } | null;
};

type BackfillOptions = {
  /** Не больше стольких тайтлов за запуск. */
  limit?: number;
  translator?: Translator | null;
  store?: LocalizationStore;
  fetchCandidates?: () => Promise<TranslationCandidate[]>;
  env?: Record<string, string | undefined>;
};

/** Трендовые, затем популярные тайтлы AniList с непустым английским описанием, без повторов. */
export async function fetchTranslationCandidates(): Promise<TranslationCandidate[]> {
  const data = await anilistRequest(TRANSLATION_CANDIDATES_QUERY, {
    perPage: CANDIDATES_PER_LIST,
    excludedGenres: EXCLUDED_GENRES,
  });
  const seen = new Set<number>();
  const candidates: TranslationCandidate[] = [];
  for (const media of [...data.trending.media, ...data.popular.media]) {
    const description = cleanDescription(media.description);
    if (!description || seen.has(media.id)) continue;
    seen.add(media.id);
    candidates.push({ id: media.id, malId: media.idMal && media.idMal > 0 ? media.idMal : null, description });
  }
  return candidates;
}

/**
 * Фоновое заполнение машинных переводов: по расписанию — Supabase Cron → Edge Function `translate-cron` (ADR-024),
 * вручную — `npm run translate` (scripts/translate-backfill.ts) или `GET /api/cron/translate`.
 * Порядок источников не меняется: сначала сверка с Shikimori, переводятся только тайтлы без его описания
 * и без перевода текущего английского текста. Перед каждой пачкой — проверка остатка квоты.
 * Идемпотентно: повторный или пропущенный запуск безопасен.
 */
export async function runTranslationBackfill(options: BackfillOptions = {}): Promise<BackfillReport> {
  const env = options.env ?? process.env;
  const translator = options.translator === undefined ? getTranslator(env) : options.translator;
  const report: BackfillReport = {
    translator: translator?.name ?? null,
    candidates: 0,
    pending: 0,
    translated: 0,
    characters: 0,
    batches: 0,
    skippedOversized: 0,
    stopped: null,
    usage: null,
  };
  if (!translator) return { ...report, stopped: "no_translator" };

  const store = options.store ?? getLocalizationStore();
  // Без базы перевод потеряется при перезапуске — символы тратить нельзя (кроме E2E с памятью процесса).
  if (store.kind !== "supabase" && env.ANIME_TOWN_E2E !== "1") return { ...report, stopped: "no_store" };

  const candidates = await (options.fetchCandidates ?? fetchTranslationCandidates)();
  report.candidates = candidates.length;

  // Сначала Shikimori: у кого там есть описание, машинный перевод не нужен.
  const { records } = await loadLocalizations(candidates, store);
  const pending = candidates
    .map((candidate) => ({ ...candidate, hash: descriptionHash(candidate.description), text: candidate.description }))
    .filter((candidate) => needsMachineTranslation(records.get(candidate.id), candidate.hash))
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  report.pending = pending.length;

  const ownLimit = monthlyCharLimit(env);
  const tracker = createUsageTracker(translator);
  if (!pending.length) {
    // Переводить нечего — но остаток квоты в отчёте нужен для наблюдения (/v2/usage кэшируется).
    const usage = await tracker.current().catch(() => null);
    return { ...report, usage: usage ? { ...usage, ownLimit } : null };
  }
  let runBudget = runCharLimit(env);

  const { batches, oversized } = chunkForTranslation(pending, translator.maxBatchTexts, translator.maxBatchBytes);
  report.skippedOversized = oversized.length;

  try {
    for (const batch of batches) {
      const usage = await tracker.current();
      if (!usage) {
        report.stopped = "usage_unavailable";
        break;
      }
      // Берём из пачки столько текстов, сколько помещается в остаток квоты и бюджет запуска.
      let allowance = Math.min(remainingBudget(usage, ownLimit), runBudget);
      const affordable = batch.filter((item) => {
        if (item.text.length > allowance) return false;
        allowance -= item.text.length;
        return true;
      });
      if (!affordable.length) {
        report.stopped = "budget_exhausted";
        break;
      }

      const result = await translator.translate(affordable.map((item) => item.text));
      tracker.record(result.billedCharacters);
      runBudget -= result.billedCharacters;
      report.characters += result.billedCharacters;
      report.batches++;

      const rows = affordable.map((item, index) =>
        withMachineTranslation(item.id, item.malId, records.get(item.id), result.texts[index], item.hash, translator.name),
      );
      try {
        await store.upsertMany(rows);
      } catch (error) {
        console.error("[translator] не удалось сохранить переводы", error);
        report.stopped = "store_error";
        break;
      }
      report.translated += rows.length;

      if (affordable.length < batch.length) {
        report.stopped = "budget_exhausted";
        break;
      }
    }
  } catch (error) {
    if (!isTranslatorError(error)) throw error;
    if (error.code === "QUOTA_EXCEEDED") tracker.markExhausted();
    // Сообщение без тела ответа и без ключа.
    console.error(`[translator] ${translator.name}: ${error.code} — ${error.message}`);
    report.stopped = error.code;
  }

  const usage = await tracker.current().catch(() => null);
  report.usage = usage ? { ...usage, ownLimit } : null;
  return report;
}
