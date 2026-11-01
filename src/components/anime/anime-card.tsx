import { cn } from "@/lib/utils";
import type { AnimeCard as AnimeCardData } from "@/types/anime";

import { cardMeta } from "./anime-meta";
import { IntentLink } from "./intent-link";
import { PosterImage } from "./poster-image";
import { ScoreBadge } from "./score-badge";

export const CARD_IMAGE_SIZES = "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 200px";

type AnimeCardProps = {
  anime: AnimeCardData;
  className?: string;
  priority?: boolean;
};

export function AnimeCard({ anime, className, priority }: AnimeCardProps) {
  const meta = cardMeta(anime);

  return (
    <article className={cn("group min-w-0", className)} data-testid="anime-card">
      <IntentLink
        href={`/anime/${anime.id}`}
        className="block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border/60 shadow-lg shadow-black/30">
          <PosterImage
            src={anime.coverUrl}
            color={anime.coverColor}
            alt={`Постер: ${anime.title}`}
            sizes={CARD_IMAGE_SIZES}
            priority={priority}
            className="transition-transform duration-300 motion-safe:group-hover:scale-[1.04]"
          />
          <ScoreBadge score={anime.score} className="absolute top-2 left-2" />
        </div>

        <h3 className="mt-2.5 line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-primary">
          {anime.title}
        </h3>
        {anime.altTitle && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{anime.altTitle}</p>
        )}
        {meta.length > 0 && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/90">{meta.join(" · ")}</p>
        )}
      </IntentLink>
    </article>
  );
}
