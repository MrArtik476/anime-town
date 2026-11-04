// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { badgeLabel, commentAvailable, type NotificationRow, notificationHref, notificationText } from "@/features/notifications/model";

const db = vi.hoisted(() => ({
  user: { id: "me" } as { id: string } | null,
  count: 3 as number | null,
  cursors: [] as (string | null)[],
  failed: false,
}));

vi.mock("@/features/auth/session", () => ({ getCurrentUser: async () => db.user }));
vi.mock("@/features/notifications/queries", () => ({
  getUnreadCount: async () => (db.user ? db.count : null),
  getNotifications: async (cursor: string | null) => {
    db.cursors.push(cursor);
    return { items: [], nextCursor: null, failed: db.failed };
  },
}));

const row = (patch: Partial<NotificationRow>): NotificationRow => ({
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

describe("badgeLabel", () => {
  it.each([
    [0, null],
    [-1, null],
    [0.5, null],
    [1, "1"],
    [9, "9"],
    [10, "9+"],
    [250, "9+"],
  ])("%i → %s", (count, label) => {
    expect(badgeLabel(count)).toBe(label);
  });
});

describe("notificationText", () => {
  it("ответ с ником", () => {
    expect(notificationText(row({ type: "reply" }), "Aoi")).toBe("Aoi ответил(а) на ваш комментарий");
  });

  it("ответ без актёра — «Пользователь»", () => {
    expect(notificationText(row({ type: "reply" }), null)).toBe("Пользователь ответил(а) на ваш комментарий");
  });

  // ADR-026: повторный выход старой серии создаёт новое непрочитанное — N любое.
  it.each([1, 12, 1000])("новая серия %i", (n) => {
    expect(notificationText(row({ type: "new_episode", episode_number: n }), null)).toBe(`Вышла серия ${n}`);
  });
});

describe("notificationHref", () => {
  it("ответ в обсуждении тайтла — якорь комментария", () => {
    expect(notificationHref(row({ type: "reply", comment_id: 77 }))).toBe("/anime/21#comment-77");
  });

  it("ответ в обсуждении серии — серия и якорь", () => {
    expect(notificationHref(row({ type: "reply", comment_id: 77, episode_number: 3 }))).toBe("/anime/21/watch/3#comment-77");
  });

  it("новая серия — плеер", () => {
    expect(notificationHref(row({ type: "new_episode", episode_number: 12 }))).toBe("/anime/21/watch/12");
  });

  // a) корень скрыт/удалён или сам ответ скрыт/удалён: открываем страницу без якоря
  it("комментарий недоступен — без якоря, серия остаётся", () => {
    const n = row({ type: "reply", comment_id: 77, episode_number: 3 });
    expect(notificationHref(n, { comment: false })).toBe("/anime/21/watch/3");
    expect(notificationHref(row({ type: "reply", comment_id: 77 }), { comment: false })).toBe("/anime/21");
  });

  // b) серия удалена или license_status = 'none': страница тайтла, не 404 плеера
  it("серия недоступна — страница тайтла", () => {
    expect(notificationHref(row({ type: "new_episode", episode_number: 12 }), { episode: false })).toBe("/anime/21");
    expect(notificationHref(row({ type: "reply", comment_id: 77, episode_number: 3 }), { episode: false })).toBe("/anime/21");
    expect(notificationHref(row({ type: "reply", comment_id: 77, episode_number: 3 }), { episode: false, comment: true })).toBe("/anime/21");
  });

  it("ответ без comment_id — без якоря", () => {
    expect(notificationHref(row({ type: "reply", comment_id: null, episode_number: 2 }))).toBe("/anime/21/watch/2");
  });
});

describe("commentAvailable", () => {
  it("доступен, только если виден и ответ, и корень", () => {
    const reply = (status: string, parent_id: number | null, root: string | null) => ({
      parent_id,
      status,
      root: root === null ? null : { status: root },
    });
    expect(commentAvailable(reply("visible", 1, "visible"))).toBe(true);
    expect(commentAvailable(reply("visible", 1, "hidden"))).toBe(false);
    expect(commentAvailable(reply("visible", 1, "deleted"))).toBe(false);
    expect(commentAvailable(reply("visible", 1, null))).toBe(false);
    expect(commentAvailable(reply("hidden", 1, "visible"))).toBe(false);
    expect(commentAvailable(reply("deleted", 1, "visible"))).toBe(false);
    expect(commentAvailable(reply("visible", null, null))).toBe(true);
    expect(commentAvailable(reply("hidden", null, null))).toBe(false);
    expect(commentAvailable(undefined)).toBe(false);
  });
});

describe("GET /api/notifications/unread-count", () => {
  beforeEach(() => {
    db.user = { id: "me" };
    db.count = 3;
  });

  it("без сессии — 401", async () => {
    db.user = null;
    const { GET } = await import("@/app/api/notifications/unread-count/route");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("с сессией — 200 { count } и no-store", async () => {
    const { GET } = await import("@/app/api/notifications/unread-count/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ count: 3 });
  });

  it("ошибка счётчика — 502", async () => {
    db.count = null;
    const { GET } = await import("@/app/api/notifications/unread-count/route");
    expect((await GET()).status).toBe(502);
  });
});

describe("GET /api/notifications — следующая страница («Показать ещё»)", () => {
  beforeEach(() => {
    db.user = { id: "me" };
    db.cursors = [];
    db.failed = false;
  });

  const get = async (query: string) => {
    const { GET } = await import("@/app/api/notifications/route");
    const { NextRequest } = await import("next/server");
    return GET(new NextRequest(`http://localhost/api/notifications${query}`));
  };

  it("без сессии — 401 и no-store, список не читается", async () => {
    db.user = null;
    const response = await get("?cursor=abc");
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(db.cursors).toEqual([]);
  });

  it("с сессией — страница по курсору, no-store", async () => {
    const response = await get("?cursor=abc");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(db.cursors).toEqual(["abc"]);
  });

  it("ошибка списка — 502", async () => {
    db.failed = true;
    expect((await get("")).status).toBe(502);
  });
});

describe("NotificationBell (сервер) — начальный счётчик", () => {
  beforeEach(() => {
    db.user = { id: "me" };
    db.count = 3;
  });

  it("гостю колокольчик не рендерится", async () => {
    db.user = null;
    const { NotificationBell } = await import("@/features/notifications/components/notification-bell");
    expect(await NotificationBell()).toBeNull();
  });

  it("вошедшему — BellPoller с начальным счётчиком; ошибка счётчика — null (без бейджа)", async () => {
    const { NotificationBell } = await import("@/features/notifications/components/notification-bell");
    expect((await NotificationBell())?.props).toEqual({ initial: { count: 3 } });
    db.count = null;
    expect((await NotificationBell())?.props).toEqual({ initial: { count: null } });
  });
});
