import { connection } from "next/server";

import { DataError } from "@/components/anime/data-error";
import { getHomeCollections } from "@/lib/anilist/api";
import { catalogHref, EMPTY_FILTERS } from "@/lib/anime/catalog-params";
import { formatSeason } from "@/lib/anime/format";
import { getCurrentSeason } from "@/lib/anime/season";

import { AnimeRow } from "./anime-row";
import { CatalogCta } from "./catalog-cta";
import { FeaturedAnime } from "./featured-anime";

/** Данные главной грузятся при запросе (не при сборке) и кэшируются на сервере. */
export async function HomeContent() {
  await connection();
  const { season, year } = getCurrentSeason(new Date());
  const result = await getHomeCollections(season, year);

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h1 className="sr-only">Anime Town</h1>
        <DataError code={result.error.code} />
      </div>
    );
  }

  const { featured, trending, topRated, seasonal } = result.data;
  const seasonLabel = `${formatSeason(season)} ${year}`;

  return (
    <>
      {featured ? <FeaturedAnime anime={featured} /> : <h1 className="sr-only">Anime Town</h1>}

      <AnimeRow
        id="trending"
        title="Популярное сейчас"
        subtitle="Что смотрят прямо сейчас"
        href={catalogHref({ ...EMPTY_FILTERS, sort: "popularity" })}
        items={trending.filter((anime) => anime.id !== featured?.id)}
      />
      <AnimeRow
        id="top-rated"
        title="Высокий рейтинг"
        subtitle="Лучшие оценки зрителей AniList"
        href={catalogHref({ ...EMPTY_FILTERS, sort: "score" })}
        items={topRated}
      />
      <AnimeRow
        id="seasonal"
        title="Сезонные новинки"
        subtitle={seasonLabel}
        href={catalogHref({ ...EMPTY_FILTERS, season, year })}
        items={seasonal}
      />

      <CatalogCta />
    </>
  );
}
