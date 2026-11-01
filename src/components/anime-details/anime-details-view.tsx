import { Suspense } from "react";

import { ListPanel, ListPanelSkeleton } from "@/features/list/components/list-panel";
import { RatingSummaryCard } from "@/features/list/components/rating-summary";
import type { AnimeDetails } from "@/types/anime";

import { AnimeDescription } from "./anime-description";
import { DetailsFacts } from "./details-facts";
import { DetailsHero } from "./details-hero";
import { DetailsRelations } from "./details-relations";

export function AnimeDetailsView({ anime }: { anime: AnimeDetails }) {
  return (
    <article>
      <DetailsHero anime={anime} />

      <div className="mx-auto mt-10 grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="description-title">
            <h2 id="description-title" className="font-heading text-xl font-semibold tracking-tight">
              Описание
            </h2>
            <AnimeDescription description={anime.description} />
          </section>

          {anime.synonyms.length > 0 && (
            <section aria-labelledby="synonyms-title">
              <h2 id="synonyms-title" className="font-heading text-xl font-semibold tracking-tight">
                Другие названия
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {anime.synonyms.map((synonym) => (
                  <li key={synonym} className="rounded-md bg-muted px-2.5 py-1 text-sm break-all text-foreground/90">
                    {synonym}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <DetailsRelations relations={anime.relations} />
        </div>

        <aside className="space-y-6 lg:pt-1">
          {/* Личные данные — отдельно от закэшированного тайтла: читают сессию. */}
          <Suspense fallback={<ListPanelSkeleton />}>
            <ListPanel animeId={anime.id} />
          </Suspense>
          <Suspense fallback={null}>
            <RatingSummaryCard animeId={anime.id} />
          </Suspense>
          <DetailsFacts anime={anime} />
        </aside>
      </div>
    </article>
  );
}
