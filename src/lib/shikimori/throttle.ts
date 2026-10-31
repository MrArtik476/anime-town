type WindowLimit = { count: number; windowMs: number };

type ThrottleOptions = {
  limits: WindowLimit[];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type Throttle = {
  /**
   * Занимает слот для запроса и ждёт его наступления.
   * Если ждать дольше maxWaitMs — слот не занимается и возвращается false: вызывающий обойдётся без запроса.
   */
  acquire(maxWaitMs: number): Promise<boolean>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Исходящий ограничитель частоты на процесс: несколько окон сразу (например, 4 в секунду и 80 в минуту).
 * Слоты выдаются по порядку, поэтому параллельные запросы выстраиваются в очередь, а не превышают лимит.
 */
export function createThrottle({ limits, now = Date.now, sleep = defaultSleep }: ThrottleOptions): Throttle {
  const slots: number[] = [];
  const longestWindow = Math.max(...limits.map((limit) => limit.windowMs));

  return {
    async acquire(maxWaitMs: number): Promise<boolean> {
      const time = now();
      while (slots.length && slots[0] <= time - longestWindow) slots.shift();

      let at = Math.max(time, slots.at(-1) ?? time);
      for (const { count, windowMs } of limits) {
        if (slots.length >= count) at = Math.max(at, slots[slots.length - count] + windowMs);
      }

      const wait = at - time;
      if (wait > maxWaitMs) return false;
      slots.push(at);
      if (wait > 0) await sleep(wait);
      return true;
    },
  };
}
