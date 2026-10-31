import { formatFormat, formatStatus } from "@/lib/anime/format";
import type { AnimeCard } from "@/types/anime";

/** «2024 · TV-сериал · Выходит» — только непустые значения. */
export function cardMeta(anime: Pick<AnimeCard, "year" | "format" | "status">): string[] {
  return [
    anime.year ? String(anime.year) : null,
    formatFormat(anime.format),
    formatStatus(anime.status),
  ].filter((part): part is string => part !== null);
}
