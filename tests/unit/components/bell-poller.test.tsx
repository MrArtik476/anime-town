import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BellPoller } from "@/features/notifications/components/bell-poller";

// Колокольчик опрашивает GET /api/notifications/unread-count: раз в 60 с на видимой вкладке, сразу — по
// возврату на вкладку и при смене pathname; на скрытой вкладке — ни одного запроса (спек §7).

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

let visibility: DocumentVisibilityState = "visible";
const fetchMock = vi.fn();

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** Продвинуть фейковые часы и дождаться ответов fetch (промисы — микрозадачи). */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const bell = () => screen.getByRole("link", { name: /^Уведомления:/ });
const label = () => bell().getAttribute("aria-label");

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  nav.pathname = "/";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json({ count: 4 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BellPoller — опрос счётчика", () => {
  it("видимая вкладка: запрос раз в 60 с (начальный счётчик — с сервера, без запроса)", async () => {
    render(<BellPoller initialCount={2} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await advance(59_999);
    expect(fetchMock).not.toHaveBeenCalled();
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/unread-count", expect.objectContaining({ cache: "no-store" }));
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(label()).toBe("Уведомления: 4 непрочитанных");
  });

  it("скрытая вкладка: за 5 минут ни одного запроса, интервал снят", async () => {
    render(<BellPoller initialCount={2} />);
    setVisibility("hidden");
    await advance(5 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("возврат на вкладку: сразу один запрос, затем снова раз в 60 с", async () => {
    render(<BellPoller initialCount={2} />);
    setVisibility("hidden");
    await advance(3 * 60_000);
    setVisibility("visible");
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(59_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("смена pathname: на видимой вкладке — запрос, на скрытой — нет", async () => {
    const { rerender } = render(<BellPoller initialCount={2} />);
    nav.pathname = "/catalog";
    rerender(<BellPoller initialCount={2} />);
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    nav.pathname = "/anime/1";
    rerender(<BellPoller initialCount={2} />);
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("вкладка открыта скрытой — интервал не запускается до возврата", async () => {
    visibility = "hidden";
    render(<BellPoller initialCount={0} />);
    await advance(2 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("BellPoller — бейдж и озвучивание", () => {
  it("aria-label «Уведомления: N непрочитанных», бейдж скрыт от чтения", () => {
    render(<BellPoller initialCount={3} />);
    expect(label()).toBe("Уведомления: 3 непрочитанных");
    expect(bell().getAttribute("href")).toBe("/notifications");
    expect(screen.getByText("3").getAttribute("aria-hidden")).toBe("true");
  });

  it("от 10 — «9+» и в бейдже, и в aria-label", () => {
    render(<BellPoller initialCount={12} />);
    expect(label()).toBe("Уведомления: 9+ непрочитанных");
    expect(screen.getByText("9+")).toBeTruthy();
  });

  it("0 или ошибка счётчика (null) — без бейджа, «0 непрочитанных», без aria-live", () => {
    const { rerender, container } = render(<BellPoller initialCount={0} />);
    expect(label()).toBe("Уведомления: 0 непрочитанных");
    expect(bell().textContent?.replace(/\D/g, "")).toBe("");
    rerender(<BellPoller initialCount={null} />);
    expect(label()).toBe("Уведомления: 0 непрочитанных");
    expect(bell().textContent?.replace(/\D/g, "")).toBe("");
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("новый начальный счётчик с сервера (после refresh) заменяет прежний", async () => {
    const { rerender } = render(<BellPoller initialCount={5} />);
    rerender(<BellPoller initialCount={0} />);
    expect(label()).toBe("Уведомления: 0 непрочитанных");
  });

  it("ответ 401 или сбой сети — последний известный счётчик остаётся", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 401 }));
    render(<BellPoller initialCount={2} />);
    await advance(60_000);
    expect(label()).toBe("Уведомления: 2 непрочитанных");
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network");
    });
    await advance(60_000);
    expect(label()).toBe("Уведомления: 2 непрочитанных");
  });
});
