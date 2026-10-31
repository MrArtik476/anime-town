import { cn } from "@/lib/utils";
import type { AnimeCard as AnimeCardData } from "@/types/anime";

import { AnimeCard } from "./anime-card";

export const ANIME_GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 xl:grid-cols-5";

export function AnimeGrid({ items, className }: { items: AnimeCardData[]; className?: string }) {
  return (
    <ul className={cn(ANIME_GRID_CLASS, className)}>
      {items.map((anime, index) => (
        <li key={anime.id}>
          <AnimeCard anime={anime} priority={index < 4} />
        </li>
      ))}
    </ul>
  );
}
