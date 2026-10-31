import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveFilters } from "@/components/catalog/active-filters";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { CatalogSearch, SEARCH_DEBOUNCE_MS } from "@/components/catalog/catalog-search";
import { EMPTY_FILTERS } from "@/lib/anime/catalog-params";

describe("CatalogSearch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const type = (text: string) =>
    fireEvent.change(screen.getByLabelText("Поиск по названию"), { target: { value: text } });

  it("отправляет запрос один раз после паузы ввода", () => {
    const onSearch = vi.fn();
    render(<CatalogSearch value={null} onSearch={onSearch} />);

    type("fr");
    act(() => vi.advanceTimersByTime(100));
    type("frie");
    act(() => vi.advanceTimersByTime(100));
    type("frieren");
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("frieren");
  });

  it("не ищет по одному символу и подсказывает минимум", () => {
    const onSearch = vi.fn();
    render(<CatalogSearch value={null} onSearch={onSearch} />);

    type("f");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));

    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getByText("Введите минимум 2 символа")).toBeTruthy();
  });

  it("Enter отправляет запрос сразу, кнопка очистки сбрасывает поиск", () => {
    const onSearch = vi.fn();
    const { rerender } = render(<CatalogSearch value={null} onSearch={onSearch} />);

    type("naruto");
    fireEvent.submit(screen.getByRole("search"));
    expect(onSearch).toHaveBeenLastCalledWith("naruto");

    rerender(<CatalogSearch value="naruto" onSearch={onSearch} />);
    fireEvent.click(screen.getByRole("button", { name: "Очистить поиск" }));
    expect(onSearch).toHaveBeenLastCalledWith(null);
    expect((screen.getByLabelText("Поиск по названию") as HTMLInputElement).value).toBe("");

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it("подхватывает запрос из URL (сброс фильтров снаружи)", () => {
    const onSearch = vi.fn();
    const { rerender } = render(<CatalogSearch value="naruto" onSearch={onSearch} />);
    expect((screen.getByLabelText("Поиск по названию") as HTMLInputElement).value).toBe("naruto");

    rerender(<CatalogSearch value={null} onSearch={onSearch} />);
    expect((screen.getByLabelText("Поиск по названию") as HTMLInputElement).value).toBe("");

    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onSearch).not.toHaveBeenCalled();
  });
});

describe("CatalogFilters", () => {
  it("каждый фильтр вызывает onChange со своим значением", () => {
    const onChange = vi.fn();
    render(
      <CatalogFilters filters={EMPTY_FILTERS} genres={["Action", "Comedy"]} maxYear={2027} onChange={onChange} idPrefix="t" />,
    );

    fireEvent.change(screen.getByLabelText("Жанр"), { target: { value: "Comedy" } });
    fireEvent.change(screen.getByLabelText("Год"), { target: { value: "2024" } });
    fireEvent.change(screen.getByLabelText("Сезон"), { target: { value: "SPRING" } });
    fireEvent.change(screen.getByLabelText("Формат"), { target: { value: "MOVIE" } });
    fireEvent.change(screen.getByLabelText("Статус"), { target: { value: "FINISHED" } });
    fireEvent.change(screen.getByLabelText("Сортировка"), { target: { value: "score" } });

    expect(onChange.mock.calls).toEqual([
      ["genre", "Comedy"],
      ["year", 2024],
      ["season", "SPRING"],
      ["format", "MOVIE"],
      ["status", "FINISHED"],
      ["sort", "score"],
    ]);
  });

  it("жанры подписаны по-русски, «По совпадению» есть только при поиске", () => {
    const { rerender } = render(
      <CatalogFilters filters={EMPTY_FILTERS} genres={["Action"]} maxYear={2027} onChange={vi.fn()} idPrefix="t" />,
    );
    expect(screen.getByRole("option", { name: "Экшен" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "По совпадению" })).toBeNull();

    rerender(
      <CatalogFilters filters={{ ...EMPTY_FILTERS, q: "x" }} genres={["Action"]} maxYear={2027} onChange={vi.fn()} idPrefix="t" />,
    );
    expect(screen.getByRole("option", { name: "По совпадению" })).toBeTruthy();
  });
});

describe("ActiveFilters", () => {
  it("показывает чипсы активных фильтров, убирает по одному и сбрасывает все", () => {
    const onRemove = vi.fn();
    const onReset = vi.fn();
    render(
      <ActiveFilters
        filters={{ ...EMPTY_FILTERS, q: "frieren", genre: "Fantasy", year: 2023, format: "TV" }}
        onRemove={onRemove}
        onReset={onReset}
      />,
    );

    const labels = screen.getAllByRole("button").map((button) => button.textContent);
    expect(labels).toEqual([
      "«frieren»— убрать фильтр",
      "Фэнтези— убрать фильтр",
      "2023 год— убрать фильтр",
      "TV-сериал— убрать фильтр",
      "Сбросить всё",
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Фэнтези/ }));
    expect(onRemove).toHaveBeenCalledWith("genre");
    fireEvent.click(screen.getByRole("button", { name: "Сбросить всё" }));
    expect(onReset).toHaveBeenCalled();
  });

  it("ничего не рендерит без фильтров", () => {
    const { container } = render(<ActiveFilters filters={EMPTY_FILTERS} onRemove={vi.fn()} onReset={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
