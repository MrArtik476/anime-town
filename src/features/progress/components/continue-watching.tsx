import { Play } from "lucide-react";
import Link from "next/link";

import { PosterImage } from "@/components/anime/poster-image";

import { formatClock } from "../model";
import { getContinueWatching } from "../queries";

/**
 * «Продолжить просмотр» — для вошедшего пользователя; гостю и при пустом списке ничего не показывается.
 * Читает сессию — рендерится внутри своего <Suspense>.
 */
export async function ContinueWatching({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const items = await getContinueWatching();
  if (!items?.length) return null;
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <section aria-labelledby="continue-title">
      <Heading id="continue-title" className="font-heading text-xl font-semibold tracking-tight">
        Продолжить просмотр
      </Heading>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.anilistId}>
            <Link
              href={`/anime/${item.anilistId}/watch/${item.episodeNumber}`}
              className="group flex gap-3 rounded-lg border border-border/70 bg-card p-2 outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              <div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md">
                <PosterImage src={item.coverUrl} color={null} alt="" sizes="56px" />
                <Play aria-hidden className="absolute inset-0 m-auto size-6 fill-white text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <span className="line-clamp-2 text-sm font-medium">{item.title}</span>
                <span className="text-xs text-muted-foreground">
                  {item.isNext ? `Следующая: серия ${item.episodeNumber}` : `Серия ${item.episodeNumber} · ${formatClock(item.position)}`}
                </span>
                <span
                  role="progressbar"
                  aria-label={`Просмотрено серии ${item.episodeNumber}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(item.fraction * 100)}
                  className="h-1 overflow-hidden rounded-full bg-muted"
                >
                  <span className="block h-full bg-primary" style={{ width: `${Math.round(item.fraction * 100)}%` }} />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
