import type { Translator, TranslatorUsage } from "./translator";

/** Свой запас под лимитом DeepL Free (500 000 символов в месяц): тратим не больше этого. */
export const DEFAULT_MONTHLY_CHAR_LIMIT = 450_000;
/** Сколько символов тратить за один запуск фонового заполнения (≈ месячный предел / 30). */
export const DEFAULT_RUN_CHAR_LIMIT = 15_000;
/** /v2/usage кэшируется на несколько минут: между пачками одного запуска остаток считаем сами. */
export const USAGE_CACHE_MS = 5 * 60 * 1000;

type Env = Record<string, string | undefined>;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** TRANSLATE_MONTHLY_CHAR_LIMIT, по умолчанию 450 000. */
export function monthlyCharLimit(env: Env = process.env): number {
  return positiveInt(env.TRANSLATE_MONTHLY_CHAR_LIMIT, DEFAULT_MONTHLY_CHAR_LIMIT);
}

/** TRANSLATE_RUN_CHAR_LIMIT, по умолчанию 15 000. */
export function runCharLimit(env: Env = process.env): number {
  return positiveInt(env.TRANSLATE_RUN_CHAR_LIMIT, DEFAULT_RUN_CHAR_LIMIT);
}

/** Сколько ещё можно потратить: меньший из лимитов (свой и провайдера) минус израсходованное. */
export function remainingBudget(usage: TranslatorUsage, ownLimit: number): number {
  return Math.max(0, Math.min(ownLimit, usage.limit) - usage.used);
}

type CachedUsage = { usage: TranslatorUsage; fetchedAt: number };

const holder = globalThis as typeof globalThis & { __animeTownTranslatorUsage?: Map<string, CachedUsage> };

/**
 * Остаток квоты провайдера с кэшем на USAGE_CACHE_MS. После перевода расход добавляется локально,
 * после ответа «квота исчерпана» остаток обнуляется — следующая пачка не уйдёт до новой проверки.
 */
export function createUsageTracker(
  translator: Translator,
  { now = Date.now, ttlMs = USAGE_CACHE_MS }: { now?: () => number; ttlMs?: number } = {},
) {
  holder.__animeTownTranslatorUsage ??= new Map();
  const cache = holder.__animeTownTranslatorUsage;

  return {
    /** Текущее использование; null — провайдер не сообщил (тогда переводить не рискуем). */
    async current(): Promise<TranslatorUsage | null> {
      const cached = cache.get(translator.name);
      if (cached && now() - cached.fetchedAt < ttlMs) return cached.usage;
      const usage = await translator.getUsage();
      if (usage) cache.set(translator.name, { usage, fetchedAt: now() });
      return usage;
    },
    record(billedCharacters: number) {
      const cached = cache.get(translator.name);
      if (cached) cached.usage = { ...cached.usage, used: cached.usage.used + billedCharacters };
    },
    markExhausted() {
      const cached = cache.get(translator.name);
      const limit = cached?.usage.limit ?? 0;
      cache.set(translator.name, { usage: { used: limit, limit }, fetchedAt: now() });
    },
    reset() {
      cache.delete(translator.name);
    },
  };
}

export type UsageTracker = ReturnType<typeof createUsageTracker>;
