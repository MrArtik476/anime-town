// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BAN_DURATIONS, commentHref, groupReports, latestExpiry, parseBanDuration, parseBanReason } from "@/features/moderation/model";

/** Поддельный клиент Supabase: записывает вставки, ответы select задаются очередью. */
const db = vi.hoisted(() => ({
  inserts: [] as { table: string; row: unknown }[],
  insertError: null as { code: string; details?: string } | null,
  selects: [] as unknown[],
  deletes: 0,
  role: "moderator" as string | null,
  userId: "me",
}));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv: () => ({ url: "x", publishableKey: "y" }) }));
vi.mock("@/features/auth/session", () => ({
  getCurrentUser: async () => (db.role === null ? null : { id: db.userId, email: null }),
  getCurrentProfile: async () =>
    db.role === null ? null : { user: { id: db.userId, email: null }, profile: { id: db.userId, role: db.role } },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: db.selects.shift() ?? null, error: null }),
        delete: () => {
          db.deletes += 1;
          return { eq: async () => ({ error: null }) };
        },
        insert: async (row: unknown) => {
          db.inserts.push({ table, row });
          return { error: db.insertError };
        },
      };
      return chain;
    },
  }),
}));

const { banUser, dismissReports, hideComment, restoreComment, unbanUser } = await import("@/features/moderation/actions");
const { deleteComment } = await import("@/features/comments/actions");

const TARGET = "0b9e3f43-6a4e-4d4c-9a40-7c1f3e2a1b55";

beforeEach(() => {
  db.inserts = [];
  db.insertError = null;
  db.selects = [];
  db.deletes = 0;
  db.role = "moderator";
});

describe("parseBanDuration / parseBanReason", () => {
  it("сроки — только 1d, 7d, 30d, forever", () => {
    expect(parseBanDuration("7d")).toBe("7d");
    expect(BAN_DURATIONS.map(parseBanDuration)).toEqual(["1d", "7d", "30d", "forever"]);
    expect(parseBanDuration("2d")).toBeNull();
    expect(parseBanDuration(7)).toBeNull();
  });

  it("причина необязательна, обрезается, ≤ 500", () => {
    expect(parseBanReason(undefined)).toBeNull();
    expect(parseBanReason("   ")).toBeNull();
    expect(parseBanReason("  спам ")).toBe("спам");
    expect(parseBanReason("x".repeat(501))).toBeUndefined();
    expect(parseBanReason(5)).toBeUndefined();
  });
});

describe("действия модератора — одна вставка в moderation_actions", () => {
  it("без роли модератора — «Недостаточно прав» без обращения к базе", async () => {
    db.role = "user";
    expect(await hideComment(5)).toEqual({ ok: false, message: "Недостаточно прав" });
    db.role = null;
    expect(await unbanUser(TARGET)).toEqual({ ok: false, message: "Недостаточно прав" });
    expect(db.inserts).toEqual([]);
  });

  it("скрыть, вернуть, отклонить жалобы", async () => {
    expect(await hideComment(5)).toEqual({ ok: true });
    expect(await restoreComment(5)).toEqual({ ok: true });
    expect(await dismissReports(5)).toEqual({ ok: true });
    expect(db.inserts).toEqual([
      { table: "moderation_actions", row: { action: "hide", comment_id: 5 } },
      { table: "moderation_actions", row: { action: "restore", comment_id: 5 } },
      { table: "moderation_actions", row: { action: "dismiss_reports", comment_id: 5 } },
    ]);
  });

  it("бан передаёт срок, а не дату окончания: её считает база", async () => {
    expect(await banUser(TARGET, "7d", " флуд ")).toEqual({ ok: true });
    expect(db.inserts[0].row).toEqual({ action: "ban", target_user_id: TARGET, ban_duration: "7d", reason: "флуд" });
    expect(db.inserts[0].row).not.toHaveProperty("expires_at");
  });

  it("снять бан", async () => {
    expect(await unbanUser(TARGET)).toEqual({ ok: true });
    expect(db.inserts[0].row).toEqual({ action: "unban", target_user_id: TARGET });
  });

  it("неверные данные не доходят до базы", async () => {
    expect(await hideComment("5")).toEqual({ ok: false, message: "Неверные данные" });
    expect(await banUser("not-a-uuid", "7d")).toEqual({ ok: false, message: "Неверные данные" });
    expect(await banUser(TARGET, "2d")).toEqual({ ok: false, message: "Неверные данные" });
    expect(db.inserts).toEqual([]);
  });

  it("PT422 от базы → «Это действие недоступно»", async () => {
    db.insertError = { code: "PT422" };
    expect(await banUser(TARGET, "forever")).toEqual({ ok: false, message: "Это действие недоступно" });
  });
});

describe("deleteComment — только свой видимый комментарий", () => {
  it("несуществующий — «Это действие недоступно», DELETE не отправляется", async () => {
    expect(await deleteComment(404)).toEqual({ ok: false, message: "Это действие недоступно" });
    expect(db.deletes).toBe(0);
  });

  it("чужой или скрытый — «Это действие недоступно»", async () => {
    db.selects = [{ user_id: "other", status: "visible" }];
    expect(await deleteComment(5)).toEqual({ ok: false, message: "Это действие недоступно" });
    db.selects = [{ user_id: "me", status: "hidden" }];
    expect(await deleteComment(5)).toEqual({ ok: false, message: "Это действие недоступно" });
    expect(db.deletes).toBe(0);
  });

  it("свой видимый — удалён", async () => {
    db.selects = [{ user_id: "me", status: "visible" }, { status: "deleted" }];
    expect(await deleteComment(5)).toEqual({ ok: true });
    expect(db.deletes).toBe(1);
  });
});

describe("жалобы и баны для /moderation", () => {
  it("ссылка на комментарий тайтла и серии", () => {
    expect(commentHref(1, null, 5)).toBe("/anime/1#comment-5");
    expect(commentHref(1, 2, 5)).toBe("/anime/1/watch/2#comment-5");
  });

  it("жалобы группируются по комментарию: счётчики по причинам, пояснения, первая жалоба", () => {
    const groups = groupReports([
      { id: 1, comment_id: 7, reason: "spam", details: null, created_at: "2026-11-03T10:00:00Z" },
      { id: 2, comment_id: 8, reason: "other", details: "мат", created_at: "2026-11-03T10:01:00Z" },
      { id: 3, comment_id: 7, reason: "spam", details: "реклама", created_at: "2026-11-03T10:02:00Z" },
      { id: 4, comment_id: 7, reason: "offensive", details: null, created_at: "2026-11-03T10:03:00Z" },
    ]);
    expect(groups).toEqual([
      { commentId: 7, counts: { spam: 2, offensive: 1, spoiler: 0, other: 0 }, details: ["реклама"], firstReportedAt: "2026-11-03T10:00:00Z" },
      { commentId: 8, counts: { spam: 0, offensive: 0, spoiler: 0, other: 1 }, details: ["мат"], firstReportedAt: "2026-11-03T10:01:00Z" },
    ]);
  });

  it("срок действующего бана: «навсегда» важнее даты, иначе самая поздняя", () => {
    expect(latestExpiry(["2026-11-04T00:00:00Z", "2026-12-01T00:00:00Z"])).toBe("2026-12-01T00:00:00Z");
    expect(latestExpiry(["2026-11-04T00:00:00Z", null])).toBeNull();
  });
});
