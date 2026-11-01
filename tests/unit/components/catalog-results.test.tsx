import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CatalogResults } from "@/components/catalog/catalog-results";
import { EMPTY_FILTERS } from "@/lib/anime/catalog-params";
import type { AnimeCard } from "@/types/anime";

const anime = (id: number): AnimeCard => ({
  id,
  malId: null,
  title: `Тайтл ${id}`,
  altTitle: null,
  coverUrl: null,
  coverColor: null,
  year: 2020,
  format: "TV",
  status: "FINISHED",
  season: null,
  episodes: 12,
  score: 75,
  genres: [],
});

const mockFetch = (body: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));

describe("CatalogResults", () => {
  it("«Загрузить ещё» запрашивает следующую страницу с теми же фильтрами и дописывает без дублей", async () => {
    const fetchSpy = mockFetch({ ok: true, data: { items: [anime(2), anime(3)], page: 2, hasNextPage: false } });
    render(
      <CatalogResults
        filters={{ ...EMPTY_FILTERS, genre: "Drama" }}
        initial={{ items: [anime(1), anime(2)], page: 1, hasNextPage: true }}
        isPending={false}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Загрузить ещё" }));

    await waitFor(() => expect(screen.getAllByTestId("anime-card")).toHaveLength(3));
    expect(fetchSpy).toHaveBeenCalledWith("/api/catalog?genre=Drama&page=2");
    expect(screen.queryByRole("button", { name: "Загрузить ещё" })).toBeNull();
    expect(screen.getByText("Это все тайтлы по выбранным условиям.")).toBeTruthy();
  });

  it("ошибка догрузки показывает сообщение и повтор", async () => {
    mockFetch({ ok: false, error: { code: "RATE_LIMITED", retryAfter: 60 } });
    render(
      <CatalogResults
        filters={EMPTY_FILTERS}
        initial={{ items: [anime(1)], page: 1, hasNextPage: true }}
        isPending={false}
        onReset={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Загрузить ещё" }));

    expect(await screen.findByText("Слишком много запросов")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeTruthy();
    expect(screen.getAllByTestId("anime-card")).toHaveLength(1);
  });

  it("пустой результат — сообщение и сброс фильтров", () => {
    const onReset = vi.fn();
    render(
      <CatalogResults
        filters={EMPTY_FILTERS}
        initial={{ items: [], page: 1, hasNextPage: false }}
        isPending={false}
        onReset={onReset}
      />,
    );

    expect(screen.getByText("Ничего не найдено")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    expect(onReset).toHaveBeenCalled();
  });

  it("следующая страница запрашивается заранее, когда кнопка подходит к экрану; клик берёт готовый ответ", async () => {
    let notify: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    class FakeObserver {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const fetchSpy = mockFetch({ ok: true, data: { items: [anime(3)], page: 2, hasNextPage: false } });
    render(
      <CatalogResults
        filters={EMPTY_FILTERS}
        initial={{ items: [anime(1), anime(2)], page: 1, hasNextPage: true }}
        isPending={false}
        onReset={vi.fn()}
      />,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    notify?.([{ isIntersecting: true }]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Загрузить ещё" }));
    await waitFor(() => expect(screen.getByText("Тайтл 3")).toBeTruthy());
    // Повторного запроса по клику нет.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
