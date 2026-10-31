import Image from "next/image";
import Link from "next/link";

import { PosterImage } from "@/components/anime/poster-image";
import { ScoreBadge } from "@/components/anime/score-badge";
import { FadeIn } from "@/components/motion/fade-in";
import { catalogHref, EMPTY_FILTERS } from "@/lib/anime/catalog-params";
import { formatEpisodes, formatFormat, formatGenre, formatNumber, formatSeason, formatStatus } from "@/lib/anime/format";
import type { AnimeDetails } from "@/types/anime";

import { BackToCatalog } from "./back-to-catalog";

export function DetailsHero({ anime }: { anime: AnimeDetails }) {
  const altTitles = [anime.romajiTitle, anime.englishTitle, anime.nativeTitle].filter(
    (title, index, all): title is string => !!title && title !== anime.title && all.indexOf(title) === index,
  );
  const seasonLabel = [formatSeason(anime.season), anime.year].filter(Boolean).join(" ");
  const chips = [formatFormat(anime.format), formatStatus(anime.status), seasonLabel || null, formatEpisodes(anime.episodes)].filter(
    (chip): chip is string => !!chip,
  );
  const popularity = formatNumber(anime.popularity);

  return (
    <section className="relative isolate">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-56 overflow-hidden sm:h-72 lg:h-80">
        {anime.bannerUrl ? (
          <Image src={anime.bannerUrl} alt="" fill priority sizes="100vw" className="object-cover opacity-50" />
        ) : (
          <div
            className="size-full opacity-35"
            style={{ background: `linear-gradient(135deg, ${anime.coverColor ?? "var(--primary)"}, transparent 70%)` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        <BackToCatalog />

        <div className="mt-24 grid gap-6 sm:mt-32 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-8 lg:mt-36 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <FadeIn className="mx-auto w-40 sm:mx-0 sm:w-full">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border/70 shadow-2xl shadow-black/50">
              <PosterImage
                src={anime.coverUrl}
                color={anime.coverColor}
                alt={`Постер: ${anime.title}`}
                sizes="(max-width: 640px) 160px, 240px"
                priority
              />
            </div>
          </FadeIn>

          <FadeIn delay={0.05} className="min-w-0 sm:pt-10 lg:pt-14">
            <h1 className="font-heading text-2xl leading-tight font-bold tracking-tight text-balance break-words sm:text-3xl lg:text-4xl">
              {anime.title}
            </h1>
            {altTitles.length > 0 && (
              <p className="mt-2 text-sm break-words text-muted-foreground sm:text-base">{altTitles.join(" · ")}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ScoreBadge score={anime.score} className="border border-border/70 px-2 py-1 text-sm" />
              {popularity && (
                <span className="rounded-md border border-border/70 px-2 py-1 text-sm text-muted-foreground">
                  {popularity} в списках
                </span>
              )}
              {chips.map((chip) => (
                <span key={chip} className="rounded-md bg-muted px-2 py-1 text-sm text-foreground/90">
                  {chip}
                </span>
              ))}
            </div>

            {anime.genres.length > 0 && (
              <ul aria-label="Жанры" className="mt-4 flex flex-wrap gap-2">
                {anime.genres.map((genre) => (
                  <li key={genre}>
                    <Link
                      href={catalogHref({ ...EMPTY_FILTERS, genre })}
                      className="inline-block rounded-full border border-primary/40 px-3 py-1 text-sm text-foreground/90 outline-none transition-colors hover:border-primary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/60"
                    >
                      {formatGenre(genre)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
