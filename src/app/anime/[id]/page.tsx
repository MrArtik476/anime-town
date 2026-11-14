import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DataError } from "@/components/anime/data-error";
import { AnimeDetailsView } from "@/components/anime-details/anime-details-view";
import { DetailsLoading } from "@/components/anime-details/details-loading";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentProfile } from "@/features/auth/session";
import { getLocalizedAnimeById } from "@/lib/anilist/api";
import { isTitleHidden } from "@/lib/anime/hidden";
import { truncate } from "@/lib/anime/format";
import { parseAnimeId } from "@/lib/anime/ids";

type AnimePageProps = PageProps<"/anime/[id]">;

export async function generateMetadata({ params }: AnimePageProps): Promise<Metadata> {
  const id = parseAnimeId((await params).id);
  if (!id) return { title: "Аниме не найдено" };
  // Скрытый тайтл для всех выглядит как несуществующий — название в заголовок вкладки и сниппеты не попадает.
  if (await isTitleHidden(id)) return { title: "Аниме не найдено", robots: { index: false } };

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
        <Suspense fallback={<DetailsLoading />}>
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

  // Скрытый тайтл (этап 6c): всем — «не найдено», администратору — страница с плашкой.
  // Роль читается из cookies только здесь: обычные тайтлы остаются в общем кэше.
  const hidden = await isTitleHidden(id);
  if (hidden && (await getCurrentProfile())?.profile?.role !== "admin") notFound();

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

  return (
    <>
      {hidden && (
        <div role="status" className="border-b border-destructive/40 bg-destructive/10">
          <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-6">
            <span className="font-medium text-destructive">Тайтл скрыт</span>
            <span className="text-muted-foreground">Его видите только вы: в каталоге, поиске и на главной его нет.</span>
            <Link
              href={`/admin/titles/${id}`}
              className="ml-auto rounded text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              Открыть в админке
            </Link>
          </p>
        </div>
      )}
      <AnimeDetailsView anime={result.data} />
    </>
  );
}
