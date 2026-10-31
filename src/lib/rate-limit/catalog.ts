import { createMemoryRateLimiter } from "./memory";
import type { RateLimiter } from "./types";

/**
 * Лимит на запросы каталога, которые могут дойти до AniList (поиск, фильтры, «Загрузить ещё»).
 * AniList разрешает ~30 запросов в минуту на весь сервер; кэш снимает повторы, лимит — всплески одного клиента.
 */
export const CATALOG_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;

const holder = globalThis as typeof globalThis & { __animeTownCatalogLimiter?: RateLimiter };

/** Один экземпляр на процесс (globalThis переживает перезагрузку модулей в dev). */
export function getCatalogRateLimiter(): RateLimiter {
  holder.__animeTownCatalogLimiter ??= createMemoryRateLimiter(CATALOG_RATE_LIMIT);
  return holder.__animeTownCatalogLimiter;
}

/**
 * IP клиента. На Vercel `x-forwarded-for` выставляет платформа (первый адрес — клиент);
 * при собственном хостинге заголовок должен приходить от доверенного обратного прокси.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
