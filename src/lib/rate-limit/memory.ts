import type { RateLimiter, RateLimitResult } from "./types";

type MemoryRateLimiterOptions = {
  /** Запросов за окно. */
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Сколько ключей держать, прежде чем вычищать истёкшие окна. */
  maxKeys?: number;
};

type Window = { count: number; reset: number };

/**
 * Фиксированное окно в памяти процесса. Подходит для одного сервера и разработки;
 * на нескольких экземплярах приложения у каждого свой счётчик — для общего нужна внешняя реализация RateLimiter.
 */
export function createMemoryRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxKeys = 10_000,
}: MemoryRateLimiterOptions): RateLimiter {
  const windows = new Map<string, Window>();

  const sweep = (time: number) => {
    for (const [key, window] of windows) {
      if (window.reset <= time) windows.delete(key);
    }
  };

  return {
    async limit(key: string): Promise<RateLimitResult> {
      const time = now();
      let window = windows.get(key);

      if (!window || window.reset <= time) {
        if (windows.size >= maxKeys) sweep(time);
        window = { count: 0, reset: time + windowMs };
        windows.set(key, window);
      }

      window.count++;
      const success = window.count <= limit;
      return { success, limit, remaining: Math.max(0, limit - window.count), reset: window.reset };
    },
  };
}
