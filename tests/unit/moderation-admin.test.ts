// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  banState,
  exactNickPattern,
  MOD_ACTION_LABELS,
  MOD_ACTIONS,
  pageHref,
  parseBanFilter,
  parseLogFilters,
  parseModAction,
  parseReportStatus,
  REPORT_STATUS_LABELS,
} from "@/features/moderation/admin-model";

describe("parseLogFilters", () => {
  it("пустые параметры — фильтров нет", () => {
    expect(parseLogFilters({})).toEqual({
      moderator: null,
      target: null,
      action: null,
      from: null,
      to: null,
      fromDate: "",
      toDate: "",
    });
  });

  it("ники: «@» и пробелы убираются, длина до 40", () => {
    const filters = parseLogFilters({
      moderator: " @Mod_1 ",
      target: "x".repeat(60),
    });
    expect(filters.moderator).toBe("Mod_1");
    expect(filters.target).toBe("x".repeat(40));
  });

  it("ник из одних недопустимых знаков — фильтра нет", () => {
    expect(parseLogFilters({ moderator: "%%% ", target: ["a", "b"] })).toMatchObject({ moderator: null, target: null });
  });

  it("тип действия — только известный", () => {
    expect(parseLogFilters({ action: "unban" }).action).toBe("unban");
    expect(parseLogFilters({ action: "drop table" }).action).toBeNull();
  });

  it("период: сутки по Минску, «по» включает весь день", () => {
    const filters = parseLogFilters({ from: "2026-11-03", to: "2026-11-03" });
    expect(filters.from).toBe("2026-11-03T00:00:00+03:00");
    expect(filters.to).toBe("2026-11-04T00:00:00+03:00");
    expect(filters.fromDate).toBe("2026-11-03");
    expect(filters.toDate).toBe("2026-11-03");
  });

  it("«по» в последний день месяца и года переходит на следующий день", () => {
    expect(parseLogFilters({ to: "2026-12-31" }).to).toBe("2027-01-01T00:00:00+03:00");
    expect(parseLogFilters({ to: "2028-02-29" }).to).toBe("2028-03-01T00:00:00+03:00");
  });

  it("испорченная дата игнорируется", () => {
    for (const bad of ["2026-13-45", "2026-02-30", "03.11.2026", "2026-11-3", ""]) {
      expect(parseLogFilters({ from: bad, to: bad })).toMatchObject({
        from: null,
        to: null,
        fromDate: "",
        toDate: "",
      });
    }
  });
});

describe("подписи и разбор значений", () => {
  it("у каждого действия есть подпись", () => {
    expect(MOD_ACTIONS).toEqual(["hide", "restore", "dismiss_reports", "ban", "unban"]);
    for (const action of MOD_ACTIONS) expect(MOD_ACTION_LABELS[action]).toBeTruthy();
    expect(parseModAction("ban")).toBe("ban");
    expect(parseModAction("other")).toBeNull();
  });

  it("статус жалобы — только известный", () => {
    expect(parseReportStatus("resolved")).toBe("resolved");
    expect(parseReportStatus("closed")).toBeNull();
    expect(parseReportStatus(undefined)).toBeNull();
    expect(REPORT_STATUS_LABELS.dismissed).toBe("Отклонена");
  });

  it("фильтр банов по умолчанию — действующие", () => {
    expect(parseBanFilter(undefined)).toBe("active");
    expect(parseBanFilter("nonsense")).toBe("active");
    expect(parseBanFilter("ended")).toBe("ended");
    expect(parseBanFilter("all")).toBe("all");
  });

  it("точный шаблон ника экранирует «_»", () => {
    expect(exactNickPattern("mod_1")).toBe("mod\\_1");
  });
});

describe("banState", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");

  it("бан навсегда действует", () => {
    expect(banState({ expires_at: null, revoked_at: null }, now)).toBe("active");
  });

  it("срок в будущем — действует, ровно сейчас — истёк", () => {
    expect(banState({ expires_at: "2026-11-12T12:00:01Z", revoked_at: null }, now)).toBe("active");
    expect(banState({ expires_at: "2026-11-12T12:00:00Z", revoked_at: null }, now)).toBe("expired");
  });

  it("снятый бан — снят, даже если срок ещё не вышел или уже вышел", () => {
    expect(
      banState(
        {
          expires_at: "2026-12-01T00:00:00Z",
          revoked_at: "2026-11-10T00:00:00Z",
        },
        now,
      ),
    ).toBe("revoked");
    expect(
      banState(
        {
          expires_at: "2026-11-01T00:00:00Z",
          revoked_at: "2026-10-30T00:00:00Z",
        },
        now,
      ),
    ).toBe("revoked");
  });
});

describe("pageHref", () => {
  it("пустые значения не попадают в адрес", () => {
    expect(
      pageHref("/admin/moderation", {
        moderator: null,
        action: "",
        cursor: undefined,
      }),
    ).toBe("/admin/moderation");
  });

  it("значения кодируются", () => {
    expect(
      pageHref("/admin/moderation", {
        moderator: "мод",
        action: "ban",
        cursor: "a-b_c",
      }),
    ).toBe("/admin/moderation?moderator=%D0%BC%D0%BE%D0%B4&action=ban&cursor=a-b_c");
  });
});
