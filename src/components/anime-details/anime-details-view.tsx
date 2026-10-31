import type { AnimeDetails } from "@/types/anime";

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
            {anime.description ? (
              <>
                <p className="mt-4 max-w-3xl leading-relaxed whitespace-pre-line text-foreground/90">{anime.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">Описание предоставлено AniList (на языке оригинала).</p>
              </>
            ) : (
              <p className="mt-4 text-muted-foreground">Описание пока не добавлено.</p>
            )}
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

        <aside className="lg:pt-1">
          <DetailsFacts anime={anime} />
        </aside>
      </div>
    </article>
  );
}
