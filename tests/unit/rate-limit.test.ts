import { describe, expect, it } from "vitest";

import { getClientIp } from "@/lib/rate-limit/catalog";
import { createMemoryRateLimiter } from "@/lib/rate-limit/memory";
import { retryAfterSeconds } from "@/lib/rate-limit/types";

const clock = (start = 1_000_000) => {
  let time = start;
  return { now: () => time, advance: (ms: number) => (time += ms) };
};

describe("createMemoryRateLimiter", () => {
  it("пропускает limit запросов за окно и отклоняет следующий", async () => {
    const { now } = clock();
    const limiter = createMemoryRateLimiter({ limit: 3, windowMs: 60_000, now });

    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.limit("ip"));

    expect(results.map((result) => result.success)).toEqual([true, true, true, false]);
    expect(results.map((result) => result.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3]).toMatchObject({ limit: 3, reset: 1_060_000 });
  });

  it("сбрасывает счётчик после окончания окна", async () => {
    const { now, advance } = clock();
    const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1000, now });

    expect((await limiter.limit("ip")).success).toBe(true);
    expect((await limiter.limit("ip")).success).toBe(false);
    advance(1000);
    expect((await limiter.limit("ip")).success).toBe(true);
  });

  it("считает ключи независимо", async () => {
    const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1000, now: clock().now });

    expect((await limiter.limit("a")).success).toBe(true);
    expect((await limiter.limit("b")).success).toBe(true);
    expect((await limiter.limit("a")).success).toBe(false);
  });

  it("вычищает истёкшие окна при переполнении, не теряя активные", async () => {
    const { now, advance } = clock();
    const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1000, now, maxKeys: 2 });

    await limiter.limit("old");
    advance(500);
    await limiter.limit("active");
    advance(600); // окно "old" истекло, "active" ещё нет
    await limiter.limit("new");

    expect((await limiter.limit("active")).success).toBe(false);
  });
});

describe("retryAfterSeconds", () => {
  it("округляет вверх и не бывает меньше секунды", () => {
    const result = { success: false, limit: 1, remaining: 0, reset: 10_500 };
    expect(retryAfterSeconds(result, 9_000)).toBe(2);
    expect(retryAfterSeconds(result, 10_499)).toBe(1);
    expect(retryAfterSeconds(result, 20_000)).toBe(1);
  });
});

describe("getClientIp", () => {
  it("берёт первый адрес из x-forwarded-for, затем x-real-ip", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(getClientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
