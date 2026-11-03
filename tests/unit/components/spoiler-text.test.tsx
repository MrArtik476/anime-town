import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SpoilerText } from "@/features/comments/components/spoiler-text";

describe("SpoilerText — спойлер размыт до клика", () => {
  it("до клика текст скрыт от чтения, после — доступен", async () => {
    render(<SpoilerText text="Главный герой выживет" />);

    const reveal = screen.getByRole("button", { name: "Показать спойлер" });
    expect(reveal.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Главный герой выживет").getAttribute("aria-hidden")).toBe("true");

    await userEvent.click(reveal);

    expect(screen.queryByRole("button", { name: "Показать спойлер" })).toBeNull();
    expect(screen.getByText("Главный герой выживет").getAttribute("aria-hidden")).toBeNull();
  });

  it("текст остаётся текстом: разметка не исполняется", () => {
    render(<SpoilerText text="<b>жирный</b>" />);
    expect(screen.getByText("<b>жирный</b>")).toBeTruthy();
  });
});
