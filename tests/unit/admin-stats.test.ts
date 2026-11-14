import { describe, expect, it } from "vitest";

import { type SiteStats, statsFailed, weekAgo } from "@/features/admin/stats-model";

const full: SiteStats = { users: 10, newUsers: 2, published: 5, drafts: 1, hidden: 0, openReports: 3, activeBans: 0, newComments: 7 };

describe("сводка админки", () => {
  it("неделя назад — ровно 7 суток в ISO", () => {
    expect(weekAgo(Date.parse("2026-11-14T12:00:00Z"))).toBe("2026-11-07T12:00:00.000Z");
  });

  it("ошибка, если хоть одно число не загрузилось; ноль — не ошибка", () => {
    expect(statsFailed(full)).toBe(false);
    expect(statsFailed({ ...full, hidden: 0, activeBans: 0 })).toBe(false);
    expect(statsFailed({ ...full, openReports: null })).toBe(true);
  });
});
