import Image from "next/image";
import Link from "next/link";

import { cardMeta } from "@/components/anime/anime-meta";
import { IntentLink } from "@/components/anime/intent-link";
import { PosterImage } from "@/components/anime/poster-image";
import { ScoreBadge } from "@/components/anime/score-badge";
import { FadeIn } from "@/components/motion/fade-in";
import { buttonVariants } from "@/components/ui/button";
import { machineTranslationLabel } from "@/components/anime-details/anime-description";
import { isAniListImage } from "@/lib/anilist/images";
import { formatEpisodes, formatGenre, truncate } from "@/lib/anime/format";
import { cn } from "@/lib/utils";
import type { FeaturedAnime as FeaturedAnimeData } from "@/types/anime";

/** Крупный блок «Сейчас в тренде» — первый трендовый тайтл с баннером. */
export function FeaturedAnime({ anime }: { anime: FeaturedAnimeData }) {
  const meta = [...cardMeta(anime), formatEpisodes(anime.episodes)].filter(Boolean);

  return (
    <section aria-labelledby="featured-title" className="relative isolate overflow-hidden border-b border-border/60">
      <div aria-hidden className="absolute inset-0 -z-10">
        {anime.bannerUrl ? (
          <Image
            src={anime.bannerUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            unoptimized={isAniListImage(anime.bannerUrl)}
            className="object-cover opacity-45"
          />
        ) : (
          <div
            className="size-full opacity-40"
            style={{ background: `radial-gradient(80% 80% at 70% 20%, ${anime.coverColor ?? "var(--primary)"}, transparent)` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
      </div>

      <div className="mx-auto grid max-w-7xl items-end gap-8 px-4 pt-10 pb-12 sm:px-6 md:grid-cols-[auto_1fr] md:pt-20 md:pb-16">
        <FadeIn className="hidden md:block">
          <div className="relative aspect-[2/3] w-52 overflow-hidden rounded-xl border border-border/70 shadow-2xl shadow-black/50 lg:w-60">
            <PosterImage
              src={anime.coverUrl}
              color={anime.coverColor}
              alt={`Постер: ${anime.title}`}
              sizes="240px"
              priority
            />
          </div>
        </FadeIn>

        <FadeIn delay={0.05} className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Сейчас в тренде
          </p>
          <h1
            id="featured-title"
            className="mt-4 font-heading text-3xl leading-[1.1] font-bold tracking-tight text-balance break-words sm:text-4xl lg:text-5xl"
          >
            {anime.title}
          </h1>
          {anime.altTitle && <p className="mt-2 text-sm text-muted-foreground sm:text-base">{anime.altTitle}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <ScoreBadge score={anime.score} className="text-sm" />
            {meta.length > 0 && <span>{meta.join(" · ")}</span>}
          </div>

          {anime.genres.length > 0 && (
            <ul aria-label="Жанры" className="mt-4 flex flex-wrap gap-2">
              {anime.genres.slice(0, 4).map((genre) => (
                <li key={genre} className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-foreground/85">
                  {formatGenre(genre)}
                </li>
              ))}
            </ul>
          )}

          {/* Анонс на главной — только на русском; английский оригинал есть на странице тайтла. */}
          {anime.description?.language === "ru" && (
            <div className="mt-5 hidden max-w-2xl sm:block">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {truncate(anime.description.text.replace(/\s+/g, " "), 260)}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground/80">
                {anime.description.source === "shikimori"
                  ? "Описание: Shikimori"
                  : machineTranslationLabel(anime.description.translator)}
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <IntentLink href={`/anime/${anime.id}`} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
              Подробнее
            </IntentLink>
            <Link href="/catalog" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5")}>
              Весь каталог
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
