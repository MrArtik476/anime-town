import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnimeCard } from "@/components/anime/anime-card";
import { PosterImage } from "@/components/anime/poster-image";
import type { AnimeCard as AnimeCardData } from "@/types/anime";

const anime: AnimeCardData = {
  id: 21,
  title: "Ван-Пис",
  altTitle: "ONE PIECE",
  coverUrl: "https://s4.anilist.co/cover.jpg",
  coverColor: "#e4a15d",
  year: 1999,
  format: "TV",
  status: "RELEASING",
  season: "FALL",
  episodes: null,
  score: 88,
  genres: ["Action"],
};

describe("AnimeCard", () => {
  it("показывает название, альтернативное название, год, формат, статус и рейтинг", () => {
    render(<AnimeCard anime={anime} />);

    expect(screen.getByRole("heading", { name: "Ван-Пис" })).toBeTruthy();
    expect(screen.getByText("ONE PIECE")).toBeTruthy();
    expect(screen.getByText("1999 · TV-сериал · Выходит")).toBeTruthy();
    expect(screen.getByText("8.8")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Постер: Ван-Пис" }).getAttribute("src")).toBe(anime.coverUrl);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/anime/21");
  });

  it("не показывает пустые значения", () => {
    const { container } = render(
      <AnimeCard anime={{ ...anime, altTitle: null, year: null, format: null, status: null, score: null }} />,
    );

    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.queryByText(/Рейтинг/)).toBeNull();
  });
});

describe("PosterImage", () => {
  it("без адреса сразу показывает запасной постер с подписью", () => {
    render(<PosterImage src={null} alt="Постер: X" sizes="100px" />);
    expect(screen.getByTestId("poster-fallback").getAttribute("aria-label")).toBe("Постер: X");
  });

  it("при ошибке загрузки заменяет картинку запасным постером", () => {
    render(<PosterImage src="https://s4.anilist.co/broken.jpg" alt="Постер: Y" sizes="100px" />);

    fireEvent.error(screen.getByRole("img", { name: "Постер: Y" }));

    expect(screen.getByTestId("poster-fallback")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});
