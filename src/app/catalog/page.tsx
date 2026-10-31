import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { CatalogSkeleton } from "@/components/catalog/catalog-skeleton";
import { CatalogView } from "@/components/catalog/catalog-view";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getGenres, searchAnime } from "@/lib/anilist/api";
import { parseCatalogParams } from "@/lib/anime/catalog-params";
import { formatGenre } from "@/lib/anime/format";

type CatalogPageProps = PageProps<"/catalog">;

const maxCatalogYear = () => new Date().getUTCFullYear() + 1;
/** Для заголовка точная верхняя граница года не важна — без new Date() метаданные пререндерятся. */
const METADATA_MAX_YEAR = 2100;

export async function generateMetadata({ searchParams }: CatalogPageProps): Promise<Metadata> {
  const filters = parseCatalogParams(await searchParams, METADATA_MAX_YEAR);
  const parts = [
    filters.q && `«${filters.q}»`,
    filters.genre && formatGenre(filters.genre),
    filters.year && String(filters.year),
  ].filter(Boolean);

  return {
    title: parts.length ? `Каталог аниме: ${parts.join(", ")}` : "Каталог аниме",
    description:
      "Каталог аниме с поиском по названию и фильтрами по жанру, году, сезону, формату и статусу. Сортировка по популярности, рейтингу и дате выхода.",
    alternates: { canonical: "/catalog" },
  };
}

export default function CatalogPage({ searchParams }: CatalogPageProps) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-8 sm:px-6 sm:pt-10">
        <header className="mb-6 sm:mb-8">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Каталог аниме</h1>
          <p className="mt-2 text-muted-foreground">Поиск и фильтры по базе AniList.</p>
        </header>
        <Suspense fallback={<CatalogSkeleton />}>
          <CatalogContent searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function CatalogContent({ searchParams }: Pick<CatalogPageProps, "searchParams">) {
  const params = await searchParams;
  // Текущая дата (верхняя граница года) допустима только при обработке запроса — не при пререндере.
  await connection();
  const maxYear = maxCatalogYear();
  const filters = parseCatalogParams(params, maxYear);
  const [genres, firstPage] = await Promise.all([getGenres(), searchAnime(filters, 1)]);

  return (
    <CatalogView
      filters={filters}
      genres={genres.ok ? genres.data : []}
      genresFailed={!genres.ok}
      maxYear={maxYear}
      initial={firstPage}
    />
  );
}
