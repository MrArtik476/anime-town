import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommentItem } from "@/features/comments/components/comment-item";
import { CommentsList } from "@/features/comments/components/comments-list";
import { SpoilerText } from "@/features/comments/components/spoiler-text";
import { snapshotCover, type CommentView } from "@/features/comments/model";

const actions = vi.hoisted(() => ({
  createComment: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
  reportComment: vi.fn(),
}));
vi.mock("@/features/comments/actions", () => actions);
const moderation = vi.hoisted(() => ({
  hideComment: vi.fn(),
  restoreComment: vi.fn(),
  banUser: vi.fn(),
  dismissReports: vi.fn(),
  unbanUser: vi.fn(),
}));
vi.mock("@/features/moderation/actions", () => moderation);

const author = { id: "me", username: "alice", displayName: null, avatarUrl: null };
const view = (id: number, fields: Partial<CommentView> = {}): CommentView => ({
  id,
  parentId: null,
  author,
  replyTo: null,
  body: `Текст ${id}`,
  isSpoiler: false,
  status: "visible",
  replyCount: 0,
  createdAt: "2026-11-03T10:00:00Z",
  editedAt: null,
  replies: [],
  ...fields,
});
const me = { userId: "me", isModerator: false, banned: false };

async function openMenu(item: string) {
  await userEvent.click(screen.getByRole("button", { name: "Действия с комментарием" }));
  await userEvent.click(screen.getByRole("button", { name: item }));
}

beforeEach(() => {
  for (const fn of [...Object.values(actions), ...Object.values(moderation)]) fn.mockReset();
});

describe("CommentItem — изменения видны сразу, без перезагрузки (в том числе на второй странице)", () => {
  it("правка: новый текст и «изменён»", async () => {
    actions.editComment.mockResolvedValue({ ok: true, editedAt: "2026-11-03T11:00:00Z" });
    render(<CommentItem comment={view(1)} viewer={me} />);
    await openMenu("Изменить");
    const field = screen.getByLabelText("Текст комментария");
    await userEvent.clear(field);
    await userEvent.type(field, "Новый текст");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Новый текст")).toBeTruthy();
    expect(screen.getByText("изменён")).toBeTruthy();
  });

  it("удаление: «Комментарий удалён», панель подтверждения закрыта", async () => {
    actions.deleteComment.mockResolvedValue({ ok: true });
    render(<CommentItem comment={view(1)} viewer={me} />);
    await openMenu("Удалить");
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(await screen.findByText("Комментарий удалён")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Удалить комментарий?" })).toBeNull();
  });
});

describe("CommentItem — фокус клавиатуры", () => {
  it("меню — обычный список кнопок; aria-expanded, Escape закрывает и возвращает фокус", async () => {
    render(<CommentItem comment={view(1)} viewer={me} />);
    const trigger = screen.getByRole("button", { name: "Действия с комментарием" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.getElementById(trigger.getAttribute("aria-controls") ?? "")).toBeTruthy();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Изменить" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("меню открывается с клавиатуры (Enter) и закрывается щелчком мимо", async () => {
    render(<CommentItem comment={view(1)} viewer={me} />);
    const trigger = screen.getByRole("button", { name: "Действия с комментарием" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(document.body);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("«Удалить» переводит фокус в панель подтверждения", async () => {
    render(<CommentItem comment={view(1)} viewer={me} />);
    await openMenu("Удалить");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Отмена" }));
  });

  it("«Пожаловаться» переводит фокус в форму жалобы", async () => {
    render(<CommentItem comment={view(1, { author: { ...author, id: "other" } })} viewer={me} />);
    await openMenu("Пожаловаться");
    expect(document.activeElement).toBe(screen.getByLabelText("Спам или реклама"));
  });

  it("после «Показать спойлер» фокус на открытом тексте", async () => {
    render(<SpoilerText text="Тайна" />);
    await userEvent.click(screen.getByRole("button", { name: "Показать спойлер" }));
    expect(document.activeElement).toBe(screen.getByText("Тайна"));
  });
});

describe("CommentItem — модератор", () => {
  const moderator = { userId: "mod", isModerator: true, banned: false };

  it("«Скрыть» → метка «Скрыт», в меню «Вернуть», фокус на кнопке меню", async () => {
    moderation.hideComment.mockResolvedValue({ ok: true });
    render(<CommentItem comment={view(1)} viewer={moderator} />);
    await openMenu("Скрыть");
    expect(moderation.hideComment).toHaveBeenCalledWith(1);
    expect(await screen.findByText("Скрыт")).toBeTruthy();
    const trigger = screen.getByRole("button", { name: "Действия с комментарием" });
    expect(document.activeElement).toBe(trigger);
    await userEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Вернуть" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Скрыть" })).toBeNull();
  });

  it("«Забанить автора»: срок, причина, итог", async () => {
    moderation.banUser.mockResolvedValue({ ok: true });
    render(<CommentItem comment={view(1)} viewer={moderator} />);
    await openMenu("Забанить автора");
    expect(document.activeElement).toBe(screen.getByLabelText("1 день"));
    await userEvent.click(screen.getByLabelText("7 дней"));
    await userEvent.type(screen.getByLabelText("Причина (необязательно)"), "флуд");
    await userEvent.click(screen.getByRole("button", { name: "Забанить" }));
    expect(moderation.banUser).toHaveBeenCalledWith("me", "7d", "флуд");
    expect(await screen.findByText("@alice заблокирован")).toBeTruthy();
  });

  it("ошибка базы — сообщение, статус не меняется", async () => {
    moderation.hideComment.mockResolvedValue({ ok: false, message: "Это действие недоступно" });
    render(<CommentItem comment={view(1)} viewer={moderator} />);
    await openMenu("Скрыть");
    expect(await screen.findByText("Это действие недоступно")).toBeTruthy();
    expect(screen.queryByText("Скрыт")).toBeNull();
  });

  it("обычному пользователю пунктов модератора нет", async () => {
    render(<CommentItem comment={view(1, { author: { ...author, id: "other" } })} viewer={me} />);
    await userEvent.click(screen.getByRole("button", { name: "Действия с комментарием" }));
    expect(screen.queryByRole("button", { name: "Скрыть" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Забанить автора" })).toBeNull();
  });
});

describe("CommentsList", () => {
  it("модератор: скрытые ответы в превью не прячут «Показать ещё ответы»", async () => {
    const reply = (id: number, status: CommentView["status"]) =>
      view(id, { parentId: 1, status, createdAt: `2026-11-03T10:00:0${id}Z` });
    // Ветка: [скрытый, скрытый, видимый×3]; reply_count = 3 (только видимые), превью — первые 3 с скрытыми.
    const thread = view(1, { replyCount: 3, replies: [reply(2, "hidden"), reply(3, "hidden"), reply(4, "visible")] });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ replies: [reply(5, "visible"), reply(6, "visible")], nextCursor: null })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CommentsList target={{ animeId: 1 }} viewer={{ userId: "mod", isModerator: true, banned: false }} initial={[thread]} initialCursor={null} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Показать ещё ответы (2)" }));
    expect(await screen.findByText("Текст 6")).toBeTruthy();
    expect(String(fetchMock.mock.calls[0][0])).toContain("cursor=");
    expect(screen.queryByRole("button", { name: /Показать ещё ответы/ })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("ответ во вторую ветку появляется сразу", async () => {
    const created = view(9, { parentId: 1, body: "Мой ответ" });
    actions.createComment.mockResolvedValue({ ok: true, comment: created });
    render(<CommentsList target={{ animeId: 1 }} viewer={me} initial={[view(1)]} initialCursor={null} />);
    await openMenu("Ответить");
    await userEvent.type(screen.getByLabelText("Ответ @alice"), "Мой ответ");
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(screen.getByText("Мой ответ")).toBeTruthy());
  });

  it("пустая первая страница, но есть курсор — кнопка «Показать ещё», а не «Пока никто не написал»", () => {
    render(<CommentsList target={{ animeId: 1 }} viewer={me} initial={[]} initialCursor="abc" />);
    expect(screen.getByRole("button", { name: "Показать ещё комментарии" })).toBeTruthy();
    expect(screen.queryByText(/Пока никто не написал/)).toBeNull();
  });
});

describe("snapshotCover — обложка проходит те же правила, что check в базе", () => {
  it.each([
    ["https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/x.jpg", true],
    ["http://s4.anilist.co/file/anilistcdn/media/x.jpg", false],
    ["https://s4.anilist.co/other/x.jpg", false],
    [`https://s4.anilist.co/file/anilistcdn/${"x".repeat(500)}`, false],
    [null, false],
  ])("%s → %s", (url, kept) => {
    expect(snapshotCover(url)).toBe(kept ? url : null);
  });
});
