import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentsSection, CommentsSkeleton } from "@/features/comments/components/comments-section";
import { parseEpisodeNumber } from "@/features/episodes/ids";
import { formatDuration, getEpisode, getEpisodes } from "@/features/episodes/queries";
import { WatchPlayer } from "@/features/progress/components/watch-player";
import { resumePosition } from "@/features/progress/model";
import { getMyEpisodeProgress } from "@/features/progress/queries";
import { LICENSE_LABELS, resolvePlaybackSource } from "@/features/player/source";
import { getLocalizedAnimeById } from "@/lib/anilist/api";
import { parseAnimeId } from "@/lib/anime/ids";
import { cn } from "@/lib/utils";

type WatchPageProps = PageProps<"/anime/[id]/watch/[number]">;

export async function generateMetadata({ params }: WatchPageProps): Promise<Metadata> {
  const { id: rawId, number: rawNumber } = await params;
  const id = parseAnimeId(rawId);
  const number = parseEpisodeNumber(rawNumber);
  if (!id || !number) return { title: "Серия недоступна" };
  const anime = await getLocalizedAnimeById(id);
  const title = anime.ok ? anime.data.title : "Аниме";
  return { title: `Серия ${number} · ${title}`, alternates: { canonical: `/anime/${id}/watch/${number}` } };
}

export default function WatchPage({ params }: WatchPageProps) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Suspense fallback={<WatchSkeleton />}>
          <WatchContent params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function WatchContent({ params }: Pick<WatchPageProps, "params">) {
  const { id: rawId, number: rawNumber } = await params;
  const id = parseAnimeId(rawId);
  const number = parseEpisodeNumber(rawNumber);
  if (!id || !number) notFound();

  const [anime, episode, episodes] = await Promise.all([getLocalizedAnimeById(id), getEpisode(id, number), getEpisodes(id)]);
  if (!episode) notFound();
  // Источник видео — только через resolvePlaybackSource (ADR-022): без прав серия не показывается.
  const source = resolvePlaybackSource(episode);
  if (!source) notFound();

  const { signedIn, progress } = await getMyEpisodeProgress(episode.id);
  const title = anime.ok ? anime.data.title : `Аниме №${id}`;
  const index = episodes.findIndex((item) => item.number === number);
  const previous = index > 0 ? episodes[index - 1] : null;
  const next = index >= 0 && index < episodes.length - 1 ? episodes[index + 1] : null;
  const href = (n: number) => `/anime/${id}/watch/${n}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Link
        href={`/anime/${id}`}
        className="inline-flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <ArrowLeft aria-hidden className="size-4" /> К тайтлу
      </Link>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-muted-foreground">
            Серия {episode.number}
            {episode.title ? ` · ${episode.title}` : ""}
          </p>

          <div className="mt-5">
            <WatchPlayer
              animeId={id}
              number={episode.number}
              signedIn={signedIn}
              resumeAt={resumePosition(progress)}
              src={source.url}
              title={`${title}, серия ${episode.number}`}
              subtitles={episode.subtitles}
              next={next ? { href: href(next.number), label: `Серия ${next.number}${next.title ? ` · ${next.title}` : ""}` } : null}
            />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {LICENSE_LABELS[source.license]}
            {source.attribution && (
              <>
                {" · "}
                {source.attribution.url ? (
                  <a href={source.attribution.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                    {source.attribution.text}
                  </a>
                ) : (
                  source.attribution.text
                )}
              </>
            )}
          </p>

          <nav aria-label="Соседние серии" className="mt-6 flex flex-wrap gap-3">
            {previous && (
              <Link href={href(previous.number)} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}>
                <ChevronLeft aria-hidden /> Серия {previous.number}
              </Link>
            )}
            {next && (
              <Link href={href(next.number)} className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
                Серия {next.number} <ChevronRight aria-hidden />
              </Link>
            )}
          </nav>

          <div className="mt-10">
            <Suspense fallback={<CommentsSkeleton />}>
              <CommentsSection target={{ animeId: id, episodeNumber: episode.number }} />
            </Suspense>
          </div>
        </div>

        <aside aria-labelledby="watch-episodes-title">
          <h2 id="watch-episodes-title" className="font-heading text-lg font-semibold">
            Серии
          </h2>
          <ol className="mt-3 space-y-2">
            {episodes.map((item) => {
              const current = item.number === number;
              const duration = formatDuration(item.durationSec);
              return (
                <li key={item.id}>
                  <Link
                    href={href(item.number)}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60",
                      current ? "border-primary bg-primary/10" : "border-border/70 bg-card hover:border-primary/60",
                    )}
                  >
                    <span className="font-medium">Серия {item.number}</span>
                    {item.title && <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.title}</span>}
                    {duration && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{duration}</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function WatchSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6" role="status" aria-label="Загрузка серии">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-4 h-9 w-2/3" />
      <Skeleton className="mt-6 aspect-video w-full rounded-xl lg:w-[calc(100%-20rem)]" />
    </div>
  );
}
