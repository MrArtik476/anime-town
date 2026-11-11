// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { markAllRead, markRead } from "@/features/notifications/actions";

const db = vi.hoisted(() => ({ calls: [] as { call: string; args: unknown[] }[] }));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv: () => ({ url: "x", publishableKey: "y" }) }));
vi.mock("@/features/auth/session", () => ({ getCurrentUser: async () => ({ id: "me", email: null }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["update", "eq", "is"]) {
        chain[m] = (...args: unknown[]) => {
          db.calls.push({ call: `${table}.${m}`, args });
          return chain;
        };
      }
      chain.then = (resolve: (r: { error: null }) => unknown) => resolve({ error: null });
      return chain;
    },
  }),
}));

beforeEach(() => {
  db.calls = [];
});

const filters = () => db.calls.filter((c) => c.call !== "notifications.update").map((c) => [c.call, ...c.args]);

describe("markRead / markAllRead — фильтры записи", () => {
  it("markRead: своё (user_id — поверх RLS) и только непрочитанное", async () => {
    expect(await markRead(5)).toEqual({ ok: true });
    expect(filters()).toEqual([
      ["notifications.eq", "id", 5],
      ["notifications.eq", "user_id", "me"],
      ["notifications.is", "read_at", null],
    ]);
  });

  it("markRead: неверный id — запроса нет", async () => {
    expect(await markRead("5")).toEqual({ ok: false, message: "Неверные данные" });
    expect(db.calls).toEqual([]);
  });

  it("markAllRead: свои непрочитанные", async () => {
    expect(await markAllRead()).toEqual({ ok: true });
    expect(filters()).toEqual([
      ["notifications.eq", "user_id", "me"],
      ["notifications.is", "read_at", null],
    ]);
  });
});
