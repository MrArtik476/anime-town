// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { decodeCursor } from "@/features/comments/model";
import { parseLogFilters } from "@/features/moderation/admin-model";
import { getAllBans, getAllReports, getModerationLog } from "@/features/moderation/admin-queries";

type Res = { data: unknown; error: { code: string } | null };
const db = vi.hoisted(() => ({
  queried: [] as string[],
  /** Вызовы фильтров: "таблица.метод" → аргументы. */
  calls: [] as { call: string; args: unknown[] }[],
  /** Очередь ответов по таблице: каждый запрос берёт следующий, последний повторяется. */
  results: {} as Record<string, Res[]>,
}));

vi.mock("@/lib/supabase/env", () => ({
  getSupabaseEnv: () => ({ url: "x", publishableKey: "y" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      db.queried.push(table);
      const queue = db.results[table] ?? [];
      const result = queue.length > 1 ? queue.shift()! : (queue[0] ?? { data: [], error: null });
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "or", "in", "ilike", "gte", "lt", "order", "limit"]) {
        chain[m] = (...args: unknown[]) => {
          db.calls.push({ call: `${table}.${m}`, args });
          return chain;
        };
      }
      chain.then = (resolve: (r: Res) => unknown) => resolve(result);
      return chain;
    },
  }),
}));

const ok = (data: unknown): Res => ({ data, error: null });
const calls = (name: string) => db.calls.filter((item) => item.call === name).map((item) => item.args);
const at = (minute: number) => `2026-11-03T10:${String(minute).padStart(2, "0")}:00+00:00`;
const noFilters = parseLogFilters({});

const action = (patch: Record<string, unknown>) => ({
  id: 1,
  action: "hide",
  moderator_id: "mod",
  target_user_id: "author",
  comment_id: 7,
  ban_duration: null,
  reason: null,
  created_at: at(0),
  ...patch,
});

const PROFILES = [
  { id: "mod", username: "moder" },
  { id: "author", username: "writer" },
  { id: "admin", username: "boss" },
];

beforeEach(() => {
  db.queried = [];
  db.calls = [];
  db.results = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getModerationLog", () => {
  it("строка журнала: ники, ссылка на комментарий серии, срок и причина бана", async () => {
    db.results = {
      moderation_actions: [
        ok([
          action({
            id: 2,
            action: "ban",
            comment_id: null,
            ban_duration: "7d",
            reason: "спам",
            created_at: at(5),
          }),
          action({ id: 1, comment_id: 7 }),
        ]),
      ],
      profiles: [ok(PROFILES)],
      comments: [ok([{ id: 7, anilist_id: 21, episode_id: 3 }])],
      episodes: [ok([{ id: 3, number: 12 }])],
    };
    const page = await getModerationLog(noFilters, null);
    expect(page.failed).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      {
        id: 2,
        action: "ban",
        moderator: "moder",
        target: "writer",
        commentHref: null,
        banDuration: "7d",
        reason: "спам",
        createdAt: at(5),
      },
      {
        id: 1,
        action: "hide",
        moderator: "moder",
        target: "writer",
        commentHref: "/anime/21/watch/12#comment-7",
        banDuration: null,
        reason: null,
        createdAt: at(0),
      },
    ]);
  });

  it("ники всей страницы читаются одним запросом profiles", async () => {
    db.results = {
      moderation_actions: [ok([action({ id: 2, comment_id: null }), action({ id: 1, comment_id: null, moderator_id: "admin" })])],
      profiles: [ok(PROFILES)],
    };
    await getModerationLog(noFilters, null);
    expect(db.queried.filter((table) => table === "profiles")).toHaveLength(1);
    expect(db.queried).not.toContain("comments");
  });

  it("удалённые пользователь и комментарий — «удалён» и без ссылки", async () => {
    db.results = {
      moderation_actions: [
        ok([
          action({
            moderator_id: null,
            target_user_id: "gone",
            comment_id: 99,
          }),
        ]),
      ],
      profiles: [ok([])],
      comments: [ok([])],
    };
    const [entry] = (await getModerationLog(noFilters, null)).items;
    expect(entry).toMatchObject({
      moderator: "удалён",
      target: "удалён",
      commentHref: null,
    });
  });

  it("21-я строка даёт курсор и не попадает на страницу", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => action({ id: 100 - index, comment_id: null, created_at: at(59 - index) }));
    db.results = { moderation_actions: [ok(rows)], profiles: [ok(PROFILES)] };
    const page = await getModerationLog(noFilters, null);
    expect(page.items).toHaveLength(20);
    expect(decodeCursor(page.nextCursor)).toEqual({
      createdAt: at(40),
      id: 81,
    });
    expect(calls("moderation_actions.limit")).toEqual([[21]]);
  });

  it("ник модератора не найден — журнал не читается", async () => {
    db.results = { profiles: [ok([])] };
    const page = await getModerationLog(parseLogFilters({ moderator: "nobody_1" }), null);
    expect(page).toEqual({
      items: [],
      nextCursor: null,
      failed: false,
      unknownUser: "nobody_1",
    });
    expect(db.queried).not.toContain("moderation_actions");
    expect(calls("profiles.ilike")).toEqual([["username", "nobody\\_1"]]);
  });

  it("фильтры и курсор уходят в запрос", async () => {
    db.results = {
      profiles: [ok([{ id: "mod", username: "moder" }]), ok([{ id: "author", username: "writer" }]), ok(PROFILES)],
      moderation_actions: [ok([])],
    };
    const filters = parseLogFilters({
      moderator: "moder",
      target: "writer",
      action: "ban",
      from: "2026-11-01",
      to: "2026-11-03",
    });
    const cursor = btoa(`${at(5)}|9`)
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    await getModerationLog(filters, cursor);
    expect(calls("moderation_actions.eq")).toEqual([
      ["moderator_id", "mod"],
      ["target_user_id", "author"],
      ["action", "ban"],
    ]);
    expect(calls("moderation_actions.gte")).toEqual([["created_at", "2026-11-01T00:00:00+03:00"]]);
    expect(calls("moderation_actions.lt")).toEqual([["created_at", "2026-11-04T00:00:00+03:00"]]);
    expect(calls("moderation_actions.or")).toEqual([[`created_at.lt."${at(5)}",and(created_at.eq."${at(5)}",id.lt.9)`]]);
  });

  it("ошибка базы — failed", async () => {
    db.results = {
      moderation_actions: [{ data: null, error: { code: "42501" } }],
    };
    expect(await getModerationLog(noFilters, null)).toEqual({
      items: [],
      nextCursor: null,
      failed: true,
    });
  });
});

describe("getAllReports", () => {
  const report = (patch: Record<string, unknown>) => ({
    id: 1,
    comment_id: 7,
    reporter_id: "author",
    reason: "spam",
    details: null,
    status: "open",
    resolved_by: null,
    resolved_at: null,
    created_at: at(0),
    ...patch,
  });

  it("жалоба с исходом: кто закрыл, текст и автор комментария, ссылка", async () => {
    db.results = {
      comment_reports: [
        ok([
          report({
            status: "resolved",
            resolved_by: "mod",
            resolved_at: at(9),
            details: "реклама",
          }),
        ]),
      ],
      comments: [
        ok([
          {
            id: 7,
            anilist_id: 21,
            episode_id: null,
            user_id: "admin",
            body: "купи слона",
            status: "hidden",
          },
        ]),
      ],
      profiles: [ok(PROFILES)],
    };
    const page = await getAllReports(null, null);
    expect(page.items).toEqual([
      {
        id: 1,
        reason: "spam",
        details: "реклама",
        status: "resolved",
        reporter: "writer",
        resolvedBy: "moder",
        resolvedAt: at(9),
        createdAt: at(0),
        commentBody: "купи слона",
        commentAuthor: "boss",
        commentHref: "/anime/21#comment-7",
      },
    ]);
    expect(calls("comment_reports.eq")).toEqual([]);
  });

  it("фильтр по статусу уходит в запрос; открытая жалоба — без закрывшего", async () => {
    db.results = {
      comment_reports: [ok([report({})])],
      comments: [
        ok([
          {
            id: 7,
            anilist_id: 21,
            episode_id: null,
            user_id: "admin",
            body: null,
            status: "deleted",
          },
        ]),
      ],
      profiles: [ok(PROFILES)],
    };
    const [entry] = (await getAllReports("open", null)).items;
    expect(calls("comment_reports.eq")).toEqual([["status", "open"]]);
    expect(entry).toMatchObject({
      status: "open",
      resolvedBy: null,
      resolvedAt: null,
      commentBody: null,
    });
  });

  it("ошибка базы — failed", async () => {
    db.results = { comment_reports: [{ data: null, error: { code: "500" } }] };
    expect((await getAllReports(null, null)).failed).toBe(true);
  });
});

describe("getAllBans", () => {
  const now = new Date("2026-11-12T12:00:00.000Z");
  const ban = (patch: Record<string, unknown>) => ({
    id: 1,
    user_id: "author",
    moderator_id: "mod",
    reason: null,
    expires_at: null,
    revoked_at: null,
    revoked_by: null,
    created_at: at(0),
    ...patch,
  });

  it("состояние бана и ники: действует, истёк, снят администратором", async () => {
    db.results = {
      user_bans: [
        ok([
          ban({ id: 3, reason: "флуд" }),
          ban({ id: 2, expires_at: "2026-11-10T00:00:00+00:00" }),
          ban({
            id: 1,
            revoked_at: "2026-11-05T00:00:00+00:00",
            revoked_by: "admin",
          }),
        ]),
      ],
      profiles: [ok(PROFILES)],
    };
    const page = await getAllBans("all", null, now);
    expect(page.items.map((item) => [item.id, item.state, item.revokedBy])).toEqual([
      [3, "active", null],
      [2, "expired", null],
      [1, "revoked", "boss"],
    ]);
    expect(page.items[0]).toMatchObject({
      userId: "author",
      username: "writer",
      moderator: "moder",
      reason: "флуд",
      expiresAt: null,
    });
    expect(calls("user_bans.or")).toEqual([]);
    expect(calls("user_bans.is")).toEqual([]);
  });

  it("действующие: не сняты и срок не вышел", async () => {
    db.results = { user_bans: [ok([])] };
    await getAllBans("active", null, now);
    expect(calls("user_bans.is")).toEqual([["revoked_at", null]]);
    expect(calls("user_bans.or")).toEqual([['expires_at.is.null,expires_at.gt."2026-11-12T12:00:00.000Z"']]);
  });

  it("завершённые: сняты или срок вышел", async () => {
    db.results = { user_bans: [ok([])] };
    await getAllBans("ended", null, now);
    expect(calls("user_bans.or")).toEqual([['revoked_at.not.is.null,expires_at.lte."2026-11-12T12:00:00.000Z"']]);
  });

  it("ошибка базы — failed", async () => {
    db.results = { user_bans: [{ data: null, error: { code: "500" } }] };
    expect(await getAllBans("all", null, now)).toEqual({
      items: [],
      nextCursor: null,
      failed: true,
    });
  });
});
