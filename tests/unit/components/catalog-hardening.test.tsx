import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataError } from "@/components/anime/data-error";
import { MobileFilters } from "@/components/catalog/mobile-filters";
import { EMPTY_FILTERS } from "@/lib/anime/catalog-params";

describe("MobileFilters", () => {
  it("в шторке нет второй сортировки — она уже есть над каталогом", async () => {
    render(
      <MobileFilters filters={EMPTY_FILTERS} genres={["Action"]} maxYear={2027} onChange={vi.fn()} onReset={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Фильтры/ }));

    expect(await screen.findByLabelText("Жанр")).toBeTruthy();
    expect(screen.queryByLabelText("Сортировка")).toBeNull();
  });
});

describe("DataError", () => {
  it("для лимита показывает, через сколько можно повторить", () => {
    render(<DataError code="RATE_LIMITED" retryAfter={42} onRetry={vi.fn()} />);

    expect(screen.getByText("Слишком много запросов")).toBeTruthy();
    expect(screen.getByText("Повторить можно через 42 с.")).toBeTruthy();
  });

  it("понимает код INVALID_PARAMS", () => {
    render(<DataError code="INVALID_PARAMS" onRetry={vi.fn()} />);

    expect(screen.getByText("Некорректный запрос")).toBeTruthy();
  });
});
