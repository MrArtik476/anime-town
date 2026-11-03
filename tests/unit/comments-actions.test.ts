// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseCommentTarget, parseReportInput, replyPlacement } from "@/features/comments/model";

describe("replyPlacement — куда ляжет ответ", () => {
  it("ответ на корень: parent_id = корень, без @", () => {
    expect(replyPlacement({ id: 10, parent_id: null, user_id: "a" })).toEqual({ parent_id: 10, reply_to_user_id: null });
  });

  it("ответ на ответ: parent_id = корень ветки, @ — автор ответа", () => {
    expect(replyPlacement({ id: 15, parent_id: 10, user_id: "b" })).toEqual({ parent_id: 10, reply_to_user_id: "b" });
  });
});

describe("parseReportInput — жалоба от клиента", () => {
  it("причина и необязательное пояснение", () => {
    expect(parseReportInput({ reason: "spam" })).toEqual({ reason: "spam", details: null });
    expect(parseReportInput({ reason: "other", details: "  реклама  " })).toEqual({ reason: "other", details: "реклама" });
  });

  it("неизвестная причина — null", () => {
    expect(parseReportInput({ reason: "boring" })).toBeNull();
    expect(parseReportInput(null)).toBeNull();
  });

  it("пояснение длиннее 500 — null", () => {
    expect(parseReportInput({ reason: "other", details: "x".repeat(501) })).toBeNull();
  });
});

describe("parseCommentTarget — обсуждение от клиента", () => {
  it("тайтл и серия", () => {
    expect(parseCommentTarget({ animeId: 21 })).toEqual({ animeId: 21 });
    expect(parseCommentTarget({ animeId: 21, episodeNumber: 3 })).toEqual({ animeId: 21, episodeNumber: 3 });
  });

  it.each([null, {}, { animeId: 0 }, { animeId: "21" }, { animeId: 21, episodeNumber: 0 }, { animeId: 21, episodeNumber: 1.5 }])(
    "неверное %o — null",
    (raw) => {
      expect(parseCommentTarget(raw)).toBeNull();
    },
  );
});
