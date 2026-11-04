// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNotificationPrefs, getNotifications } from "@/features/notifications/queries";

type Res = { data: unknown; error: { code: string } | null };
const db = vi.hoisted(() => ({
  queried: [] as string[],
  /** Вызовы фильтров: "таблица.метод" → аргументы. */
  calls: [] as { call: string; args: unknown[] }[],
  results: {} as Record<string, Res>,
}));

vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv: () => ({ url: "x", publishableKey: "y" }) }));
vi.mock("@/features/auth/session", () => ({ getCurrentUser: async () => ({ id: "me", email: null }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      db.queried.push(table);
      const result = () => db.results[table] ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "or", "in", "neq", "order"]) {
        chain[m] = (...args: unknown[]) => {
          db.calls.push({ call: `${table}.${m}`, args });
          return chain;
        };
      }
      chain.maybeSingle = async () => result();
      chain.limit = async () => result();
      chain.then = (resolve: (r: Res) => unknown) => resolve(result());
      return chain;
    },
  }),
}));

const n = (patch: Record<string, unknown>) => ({
  actor_id: null,
  anilist_id: 21,
  comment_id: null,
  cover_url: null,
  created_at: "2026-11-03T10:00:00+00:00",
  episode_number: null,
  id: 1,
  read_at: null,
  title: null,
  type: "reply",
  user_id: "me",
  ...patch,
});

const reply = n({ id: 2, comment_id: 77, episode_number: 3, actor_id: "a" });
const fresh = n({ id: 1, type: "new_episode", episode_number: 12, anilist_id: 30 });

beforeEach(() => {
  db.queried = [];
  db.calls = [];
  db.results = {
    notifications: { data: [reply, fresh], error: null },
    episodes: {
      data: [
        { anilist_id: 21, number: 3 },
        { anilist_id: 30, number: 12 },
      ],
      error: null,
    },
    comments: { data: [{ id: 77, parent_id: 70, status: "visible", root: { status: "visible" } }], error: null },
    profiles: { data: [{ id: "a", username: "aoi", display_name: null }], error: null },
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getNotifications", () => {
  it("страница и доступность — по одному запросу на таблицу, без N+1", async () => {
    const page = await getNotifications(null);
    expect(db.queried).toEqual(["notifications", "episodes", "comments", "profiles"]);
    expect(page.items.map((i) => i.href)).toEqual(["/anime/21/watch/3#comment-77", "/anime/30/watch/12"]);
    expect(page.items[0].text).toBe("aoi ответил(а) на ваш комментарий");
    // Один точечный запрос серий: пары (тайтл, номер) страницы, только видимые.
    expect(db.calls.filter((c) => c.call === "episodes.or").map((c) => c.args)).toEqual([
      ["and(anilist_id.eq.21,number.eq.3),and(anilist_id.eq.30,number.eq.12)"],
    ]);
    expect(db.calls.filter((c) => c.call === "episodes.neq").map((c) => c.args)).toEqual([["license_status", "none"]]);
    expect(page.failed).toBe(false);
  });

  it("корень скрыт — ссылка без якоря", async () => {
    db.results.comments = { data: [{ id: 77, parent_id: 70, status: "visible", root: null }], error: null };
    expect((await getNotifications(null)).items[0].href).toBe("/anime/21/watch/3");
  });

  it("серия недоступна — страница тайтла", async () => {
    db.results.episodes = { data: [{ anilist_id: 30, number: 12 }], error: null };
    const { items } = await getNotifications(null);
    expect(items[0].href).toBe("/anime/21");
  });

  it("ошибка запроса страницы — failed, остальные запросы не идут", async () => {
    db.results.notifications = { data: null, error: { code: "XX000" } };
    const page = await getNotifications(null);
    expect(page).toEqual({ items: [], nextCursor: null, failed: true });
    expect(db.queried).toEqual(["notifications"]);
  });

  it("ошибка проверки серий — безопасная цель /anime/{id}", async () => {
    db.results.episodes = { data: null, error: { code: "XX000" } };
    const { items } = await getNotifications(null);
    expect(items.map((i) => i.href)).toEqual(["/anime/21", "/anime/30"]);
  });

  it("ошибка проверки комментариев — безопасная цель /anime/{id}", async () => {
    db.results.comments = { data: null, error: { code: "XX000" } };
    const { items } = await getNotifications(null);
    expect(items[0].href).toBe("/anime/21");
    expect(items[1].href).toBe("/anime/30/watch/12");
  });

  it("пустая страница — один запрос", async () => {
    db.results.notifications = { data: [], error: null };
    await getNotifications(null);
    expect(db.queried).toEqual(["notifications"]);
  });
});

describe("getNotificationPrefs", () => {
  it("нет строки — всё включено", async () => {
    db.results.notification_prefs = { data: null, error: null };
    expect(await getNotificationPrefs()).toEqual({ reply: true, newEpisode: true });
  });

  it("строка есть — её значения", async () => {
    db.results.notification_prefs = { data: { reply: false, new_episode: true }, error: null };
    expect(await getNotificationPrefs()).toEqual({ reply: false, newEpisode: true });
  });

  it("ошибка — null (форма не показывается)", async () => {
    db.results.notification_prefs = { data: null, error: { code: "XX000" } };
    expect(await getNotificationPrefs()).toBeNull();
  });
});
