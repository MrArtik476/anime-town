import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DataError } from "@/components/anime/data-error";
import { AnimeDetailsView } from "@/components/anime-details/anime-details-view";
import { DetailsSkeleton } from "@/components/anime-details/details-skeleton";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getLocalizedAnimeById } from "@/lib/anilist/api";
import { truncate } from "@/lib/anime/format";
import { parseAnimeId } from "@/lib/anime/ids";

type AnimePageProps = PageProps<"/anime/[id]">;

export async function generateMetadata({ params }: AnimePageProps): Promise<Metadata> {
  const id = parseAnimeId((await params).id);
  if (!id) return { title: "Аниме не найдено" };

  const result = await getLocalizedAnimeById(id);
  if (!result.ok) {
    return result.error.code === "NOT_FOUND"
      ? { title: "Аниме не найдено" } // noindex Next.js добавляет сам для notFound()
      : { title: "Аниме" };
  }

  const anime = result.data;
  // В сниппет поисковика — только русский текст; английский оригинал заменяется шаблоном.
  const description =
    anime.description?.language === "ru"
      ? truncate(anime.description.text.replace(/\s+/g, " "), 160)
      : `${anime.title}: рейтинг, жанры, эпизоды, студия и связанные тайтлы.`;

  return {
    title: anime.title,
    description,
    alternates: { canonical: `/anime/${anime.id}` },
    openGraph: {
      title: anime.title,
      description,
      type: "video.tv_show",
      images: anime.coverUrl ? [{ url: anime.coverUrl, alt: anime.title }] : undefined,
    },
  };
}

export default function AnimePage({ params }: AnimePageProps) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Suspense fallback={<DetailsSkeleton />}>
          <AnimeContent params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function AnimeContent({ params }: Pick<AnimePageProps, "params">) {
  const id = parseAnimeId((await params).id);
  if (!id) notFound();

  const result = await getLocalizedAnimeById(id);
  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") notFound();
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h1 className="sr-only">Аниме</h1>
        <DataError code={result.error.code} />
      </div>
    );
  }

  return <AnimeDetailsView anime={result.data} />;
}
