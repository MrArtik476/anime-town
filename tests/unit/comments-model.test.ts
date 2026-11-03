// @vitest-environment node
import { describe, expect, it } from "vitest";

import { commentErrorMessage } from "@/features/comments/errors";
import {
  buildThreads,
  type CommentRow,
  decodeCursor,
  encodeCursor,
  MAX_BODY,
  parseCommentBody,
  type ProfileRow,
} from "@/features/comments/model";

const row = (id: number, fields: Partial<CommentRow> = {}): CommentRow => ({
  id,
  user_id: "u1",
  anilist_id: 1,
  episode_id: null,
  parent_id: null,
  reply_to_user_id: null,
  body: `Текст ${id}`,
  is_spoiler: false,
  status: "visible",
  reply_count: 0,
  anime_title: "Тайтл",
  anime_cover_url: null,
  created_at: `2026-11-03T10:00:0${id % 10}Z`,
  edited_at: null,
  ...fields,
});

const profiles: ProfileRow[] = [
  { id: "u1", username: "alice", display_name: "Алиса", avatar_url: null },
  { id: "u2", username: "bob", display_name: null, avatar_url: "https://example.com/b.png" },
];

describe("parseCommentBody — текст от клиента", () => {
  it("обрезает пробелы по краям", () => {
    expect(parseCommentBody("  привет  ")).toBe("привет");
  });

  it("пустой и только пробелы — null", () => {
    expect(parseCommentBody("")).toBeNull();
    expect(parseCommentBody("   \n\t ")).toBeNull();
  });

  it("2000 символов — можно, 2001 — нельзя", () => {
    expect(parseCommentBody("x".repeat(MAX_BODY))).toHaveLength(2000);
    expect(parseCommentBody("x".repeat(MAX_BODY + 1))).toBeNull();
  });

  it("\\r\\n → \\n, не больше трёх переводов строки подряд", () => {
    expect(parseCommentBody("a\r\n\r\n\r\n\r\n\r\nb")).toBe("a\n\n\nb");
    expect(parseCommentBody("a\n\nb")).toBe("a\n\nb");
  });

  it("не строка — null", () => {
    expect(parseCommentBody(42)).toBeNull();
    expect(parseCommentBody(null)).toBeNull();
  });
});

describe("курсор keyset", () => {
  it("кодирует и раскодирует", () => {
    const cursor = { createdAt: "2026-11-03T10:00:00.123456+00:00", id: 42 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("мусор и чужой формат — null", () => {
    expect(decodeCursor("мусор")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(Buffer.from("not-a-date|1").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from("2026-11-03T10:00:00Z|-5").toString("base64url"))).toBeNull();
  });
});

describe("buildThreads", () => {
  it("удалённый корень без ответов отбрасывается, с ответами — остаётся без текста", () => {
    const threads = buildThreads(
      [row(1, { status: "deleted", body: null, reply_count: 0 }), row(2, { status: "deleted", body: null, reply_count: 2 })],
      [row(3, { parent_id: 2, user_id: "u2", reply_to_user_id: "u1" })],
      profiles,
    );
    expect(threads.map((t) => t.id)).toEqual([2]);
    expect(threads[0].body).toBeNull();
    expect(threads[0].status).toBe("deleted");
  });

  it("ответы привязаны к корню, автор и «@ник» из профилей", () => {
    const [thread] = buildThreads([row(1, { reply_count: 1 })], [row(2, { parent_id: 1, user_id: "u2", reply_to_user_id: "u1" })], profiles);
    expect(thread.author).toEqual({ id: "u1", username: "alice", displayName: "Алиса", avatarUrl: null });
    expect(thread.replies).toHaveLength(1);
    expect(thread.replies[0].author?.username).toBe("bob");
    expect(thread.replies[0].replyTo).toEqual({ id: "u1", username: "alice" });
  });

  it("автор без профиля — null, а не падение", () => {
    const [thread] = buildThreads([row(1, { user_id: "ghost" })], [], profiles);
    expect(thread.author).toBeNull();
  });
});

describe("commentErrorMessage", () => {
  it.each([
    [{ code: "PT429" }, "Слишком часто. Подождите немного и попробуйте снова"],
    [{ code: "PT403", details: "forever" }, "Вы заблокированы"],
    [{ code: "PT422" }, "Это действие недоступно"],
    [{ code: "23505" }, "Вы уже пожаловались на этот комментарий"],
    [{ code: "23514" }, "Неверные данные"],
    [{ code: "42501" }, "Недостаточно прав"],
  ])("%o → %s", (error, message) => {
    expect(commentErrorMessage(error)).toBe(message);
  });

  it("бан с датой — дата по-русски", () => {
    expect(commentErrorMessage({ code: "PT403", details: "2026-11-10T12:00:00+00:00" })).toMatch(/^Вы заблокированы до \d{1,2} ноября 2026/);
  });

  it("неизвестная ошибка — общее сообщение", () => {
    expect(commentErrorMessage({ code: "XX000" })).toBe("Не получилось — попробуйте ещё раз");
    expect(commentErrorMessage(null)).toBe("Не получилось — попробуйте ещё раз");
  });
});
