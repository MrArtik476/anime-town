import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnimeDescription } from "@/components/anime-details/anime-description";

describe("AnimeDescription", () => {
  it("машинный перевод — пометка с провайдером", () => {
    render(<AnimeDescription description={{ language: "ru", source: "machine", text: "Перевод.", translator: "DeepL" }} />);
    expect(screen.getByText("Машинный перевод (DeepL)")).toBeTruthy();
    expect(screen.queryByText(/Описание: Shikimori/)).toBeNull();
  });

  it("Shikimori — атрибуция со ссылкой, без пометки о машинном переводе", () => {
    render(
      <AnimeDescription
        description={{ language: "ru", source: "shikimori", text: "Сюжет.", sourceUrl: "https://shikimori.io/animes/1" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Shikimori" }).getAttribute("href")).toBe("https://shikimori.io/animes/1");
    expect(screen.queryByText(/Машинный перевод/)).toBeNull();
  });

  it("английский оригинал — честная пометка", () => {
    render(<AnimeDescription description={{ language: "en", source: "anilist", text: "Story." }} />);
    expect(screen.getByText(/Русского описания пока нет/)).toBeTruthy();
  });
});
