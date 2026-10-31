import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("отдаёт новое значение только после паузы", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 400), {
      initialProps: { value: "a" },
    });

    rerender({ value: "ab" });
    act(() => vi.advanceTimersByTime(399));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("ab");
  });

  it("каждое изменение перезапускает таймер — промежуточные значения пропускаются", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 400), {
      initialProps: { value: "" },
    });

    for (const value of ["н", "на", "нар", "нару"]) {
      rerender({ value });
      act(() => vi.advanceTimersByTime(200));
    }
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe("нару");
  });
});
