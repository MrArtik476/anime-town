/**
 * Ограничитель частоты запросов. Форма совпадает с `@upstash/ratelimit` (`limit(key)` → `{ success, reset }`),
 * поэтому in-memory реализацию можно заменить общей (Upstash, Supabase) без переписывания вызовов.
 */
export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

export type RateLimitResult = {
  success: boolean;
  /** Сколько запросов разрешено за окно. */
  limit: number;
  /** Сколько запросов осталось в текущем окне. */
  remaining: number;
  /** Когда окно сбросится — Unix-время в миллисекундах. */
  reset: number;
};

/** Значение заголовка Retry-After в секундах: не меньше 1, чтобы клиент не повторил запрос мгновенно. */
export function retryAfterSeconds(result: RateLimitResult, now = Date.now()): number {
  return Math.max(1, Math.ceil((result.reset - now) / 1000));
}
