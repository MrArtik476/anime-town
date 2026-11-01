import { PlayCircle } from "lucide-react";
import Link from "next/link";

import { formatDuration, getEpisodes } from "../queries";

/** Серии на странице тайтла — только с правами на показ. Без серий — честное пояснение. */
export async function EpisodesList({ animeId }: { animeId: number }) {
  const episodes = await getEpisodes(animeId);
  return (
    <section aria-labelledby="episodes-title">
      <h2 id="episodes-title" className="font-heading text-xl font-semibold tracking-tight">
        Серии
      </h2>
      {episodes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Смотреть можно только серии, на которые у Anime Town есть права. Для этого тайтла их пока нет.
        </p>
      ) : (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {episodes.map((episode) => {
            const duration = formatDuration(episode.durationSec);
            return (
              <li key={episode.id}>
                <Link
                  href={`/anime/${animeId}/watch/${episode.number}`}
                  className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-3 outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  <PlayCircle aria-hidden className="size-6 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Серия {episode.number}</span>
                    {episode.title && <span className="block truncate text-xs text-muted-foreground">{episode.title}</span>}
                  </span>
                  {duration && <span className="shrink-0 text-xs text-muted-foreground">{duration}</span>}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
