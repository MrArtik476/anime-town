// @vitest-environment node
import { describe, expect, it } from "vitest";

import { withoutHidden } from "@/lib/anime/hidden-filter";

describe("withoutHidden", () => {
  const cards = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("убирает скрытые тайтлы и сохраняет порядок остальных", () => {
    expect(withoutHidden(cards, [2])).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it("скрытых нет — тот же список", () => {
    expect(withoutHidden(cards, [])).toBe(cards);
  });

  it("скрытый тайтл не из списка ничего не меняет", () => {
    expect(withoutHidden(cards, [99])).toEqual(cards);
  });
});
