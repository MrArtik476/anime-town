import { IntentLink } from "@/components/anime/intent-link";
import { PosterImage } from "@/components/anime/poster-image";
import { formatFormat, formatRelation } from "@/lib/anime/format";
import type { AnimeRelation } from "@/types/anime";

function RelationBody({ relation }: { relation: AnimeRelation }) {
  const meta = [formatFormat(relation.format), relation.year].filter(Boolean).join(" · ");
  return (
    <>
      <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-md">
        <PosterImage src={relation.coverUrl} color={relation.coverColor} alt={`Постер: ${relation.title}`} sizes="64px" />
      </div>
      <div className="min-w-0 py-1">
        {formatRelation(relation.relationType) && (
          <p className="text-xs font-medium tracking-wide text-primary uppercase">{formatRelation(relation.relationType)}</p>
        )}
        <p className="mt-1 line-clamp-2 text-sm font-medium">{relation.title}</p>
        {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
      </div>
    </>
  );
}

export function DetailsRelations({ relations }: { relations: AnimeRelation[] }) {
  if (relations.length === 0) return null;

  return (
    <section aria-labelledby="relations-title">
      <h2 id="relations-title" className="font-heading text-xl font-semibold tracking-tight">
        Связанные произведения
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {relations.map((relation) => (
          <li key={`${relation.relationType}-${relation.id}`}>
            {relation.isAnime ? (
              <IntentLink
                href={`/anime/${relation.id}`}
                className="flex gap-3 rounded-lg border border-border/70 bg-card p-2 outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                <RelationBody relation={relation} />
              </IntentLink>
            ) : (
              // Манга и ранобэ — справочно, своих страниц для них нет.
              <div className="flex gap-3 rounded-lg border border-border/50 bg-card/60 p-2">
                <RelationBody relation={relation} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
