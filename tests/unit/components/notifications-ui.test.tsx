import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationList } from "@/features/notifications/components/notification-list";
import { NotificationPrefsForm } from "@/features/notifications/components/notification-prefs-form";
import type { NotificationItem } from "@/features/notifications/model";

const actions = vi.hoisted(() => ({ markRead: vi.fn(), markAllRead: vi.fn(), saveNotificationPrefs: vi.fn() }));
vi.mock("@/features/notifications/actions", () => actions);

const item = (id: number, fields: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  type: "reply",
  text: "aoi ответил(а) на ваш комментарий",
  title: "Наруто",
  coverUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/x.jpg",
  href: `/anime/21#comment-${id}`,
  createdAt: "2026-11-03T10:00:00Z",
  read: false,
  ...fields,
});

const row = (name: RegExp | string) => screen.getByRole("link", { name });

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.markRead.mockResolvedValue({ ok: true });
  actions.markAllRead.mockResolvedValue({ ok: true });
  actions.saveNotificationPrefs.mockResolvedValue({ ok: true });
});

afterEach(() => vi.unstubAllGlobals());

describe("NotificationList", () => {
  it("строки — настоящие ссылки с готовым href; непрочитанные выделены", () => {
    render(
      <NotificationList
        initial={[item(2), item(1, { read: true, type: "new_episode", text: "Вышла серия 12", href: "/anime/21/watch/12" })]}
        initialCursor={null}
        unread={1}
      />,
    );
    const unread = row(/aoi ответил/);
    expect(unread.tagName).toBe("A");
    expect(unread.getAttribute("href")).toBe("/anime/21#comment-2");
    expect(unread.textContent).toContain("Непрочитанное");
    expect(unread.getAttribute("data-unread")).toBe("true");
    const read = row(/Вышла серия 12/);
    expect(read.getAttribute("href")).toBe("/anime/21/watch/12");
    expect(read.textContent).not.toContain("Непрочитанное");
    expect(read.textContent).toContain("Наруто");
  });

  it("нет снимка тайтла и обложки — «Аниме №{id}» и заглушка, без падения", () => {
    render(<NotificationList initial={[item(3, { title: "Аниме №5", coverUrl: null })]} initialCursor={null} unread={1} />);
    const link = row(/Аниме №5/);
    expect(within(link).getByTestId("poster-fallback")).toBeTruthy();
  });

  it("клик отмечает прочитанным (markRead) и не отменяет переход", async () => {
    render(<NotificationList initial={[item(7)]} initialCursor={null} unread={1} />);
    const link = row(/aoi ответил/);
    let prevented: boolean | null = null;
    link.addEventListener("click", (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault(); // jsdom не умеет навигацию — глушим уже после проверки
    });
    await userEvent.click(link);
    expect(actions.markRead).toHaveBeenCalledWith(7);
    expect(prevented).toBe(false);
    await waitFor(() => expect(row(/aoi ответил/).textContent).not.toContain("Непрочитанное"));
  });

  it("уже прочитанное — markRead не вызывается", async () => {
    render(<NotificationList initial={[item(8, { read: true })]} initialCursor={null} unread={0} />);
    const link = row(/aoi ответил/);
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(actions.markRead).not.toHaveBeenCalled();
  });

  it("«Прочитать все» снимает выделение со всех строк", async () => {
    render(<NotificationList initial={[item(2), item(1)]} initialCursor={null} unread={2} />);
    await userEvent.click(screen.getByRole("button", { name: "Прочитать все" }));
    expect(actions.markAllRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryAllByText(/^Непрочитанное/)).toHaveLength(0));
  });

  it("«Прочитать все» с ошибкой — сообщение, выделение остаётся", async () => {
    actions.markAllRead.mockResolvedValue({ ok: false, message: "Уведомления временно недоступны" });
    render(<NotificationList initial={[item(2)]} initialCursor={null} unread={1} />);
    await userEvent.click(screen.getByRole("button", { name: "Прочитать все" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Уведомления временно недоступны");
    expect(row(/aoi ответил/).textContent).toContain("Непрочитанное");
  });

  it("нет непрочитанных — кнопки «Прочитать все» нет", () => {
    render(<NotificationList initial={[item(2, { read: true })]} initialCursor={null} unread={0} />);
    expect(screen.queryByRole("button", { name: "Прочитать все" })).toBeNull();
  });

  it("«Показать ещё» догружает следующую страницу из /api/notifications", async () => {
    const fetchMock = vi.fn(async () => Response.json({ items: [item(1, { text: "Вышла серия 3", type: "new_episode" })], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NotificationList initial={[item(2)]} initialCursor="CUR" unread={1} />);
    await userEvent.click(screen.getByRole("button", { name: "Показать ещё" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications?cursor=CUR", expect.objectContaining({ cache: "no-store" }));
    expect(await screen.findByRole("link", { name: /Вышла серия 3/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Показать ещё" })).toBeNull();
  });

  it("ошибка догрузки — сообщение, кнопка остаётся", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
    render(<NotificationList initial={[item(2)]} initialCursor="CUR" unread={1} />);
    await userEvent.click(screen.getByRole("button", { name: "Показать ещё" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Не удалось загрузить уведомления");
    expect(screen.getByRole("button", { name: "Показать ещё" })).toBeTruthy();
  });

  it("пустой список — «Уведомлений пока нет»", () => {
    render(<NotificationList initial={[]} initialCursor={null} unread={0} />);
    expect(screen.getByText("Уведомлений пока нет")).toBeTruthy();
  });
});

describe("NotificationPrefsForm", () => {
  it("переключатели с текущими значениями; изменение сохраняется сразу", async () => {
    render(<NotificationPrefsForm initial={{ reply: true, newEpisode: false }} />);
    const reply = screen.getByRole("switch", { name: "Ответы на мои комментарии" });
    const episodes = screen.getByRole("switch", { name: "Новые серии из моего списка" });
    expect(reply.getAttribute("aria-checked")).toBe("true");
    expect(episodes.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(reply);
    expect(actions.saveNotificationPrefs).toHaveBeenCalledWith({ reply: false, newEpisode: false });
    expect((await screen.findByRole("status")).textContent).toContain("Сохранено");
    expect(reply.getAttribute("aria-checked")).toBe("false");
  });

  it("ошибка сохранения — значение возвращается, сообщение", async () => {
    actions.saveNotificationPrefs.mockResolvedValue({ ok: false, message: "Уведомления временно недоступны" });
    render(<NotificationPrefsForm initial={{ reply: true, newEpisode: true }} />);
    const episodes = screen.getByRole("switch", { name: "Новые серии из моего списка" });
    await userEvent.click(episodes);
    expect((await screen.findByRole("alert")).textContent).toBe("Уведомления временно недоступны");
    expect(episodes.getAttribute("aria-checked")).toBe("true");
  });
});
