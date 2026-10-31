"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";

import { DataError } from "@/components/anime/data-error";
import { rememberCatalogHref } from "@/hooks/use-last-catalog-href";
import type { AniListResult } from "@/lib/anilist/api";
import {
  type CatalogFilters as Filters,
  catalogHref,
  EMPTY_FILTERS,
  resolveSort,
  serializeCatalogParams,
} from "@/lib/anime/catalog-params";
import type { AnimePage } from "@/types/anime";

import { ActiveFilters } from "./active-filters";
import { CatalogFilters, type FilterChange } from "./catalog-filters";
import { CatalogResults } from "./catalog-results";
import { CatalogSearch } from "./catalog-search";
import { FilterSelect } from "./filter-select";
import { sortOptions } from "./filter-options";
import { MobileFilters } from "./mobile-filters";

type CatalogViewProps = {
  filters: Filters;
  genres: string[];
  genresFailed: boolean;
  maxYear: number;
  initial: AniListResult<AnimePage>;
};

/**
 * URL — единственный источник состояния фильтров: изменение → router.replace → сервер отдаёт
 * новую первую страницу. Перезагрузка и ссылка восстанавливают тот же каталог.
 */
export function CatalogView({ filters, genres, genresFailed, maxYear, initial }: CatalogViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const href = catalogHref(filters);

  useEffect(() => {
    rememberCatalogHref(href);
  }, [href]);

  const navigate = useCallback(
    (next: Filters) => {
      startTransition(() => router.replace(catalogHref(next), { scroll: false }));
    },
    [router],
  );

  const setFilter: FilterChange = (key, value) => navigate({ ...filters, [key]: value });
  const removeFilter = (key: keyof Filters) => navigate({ ...filters, [key]: null });
  const reset = () => navigate(EMPTY_FILTERS);
  const search = useCallback(
    (q: string | null) => {
      // «По совпадению» без поискового запроса не имеет смысла — возвращаем сортировку по умолчанию.
      const sort = !q && filters.sort === "relevance" ? null : filters.sort;
      navigate({ ...filters, q, sort });
    },
    [filters, navigate],
  );

  return (
    <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
      <aside aria-label="Фильтры каталога" className="hidden lg:block">
        <div className="sticky top-20 rounded-xl border border-border/70 bg-card/60 p-5">
          <p className="mb-4 font-heading text-sm font-semibold">Фильтры</p>
          <CatalogFilters filters={filters} genres={genres} maxYear={maxYear} onChange={setFilter} idPrefix="filter" />
          {genresFailed && (
            <p className="mt-3 text-xs text-muted-foreground">Список жанров временно недоступен.</p>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        <CatalogSearch value={filters.q} onSearch={search} />

        <div className="mt-1 flex items-end gap-3 lg:hidden">
          <MobileFilters filters={filters} genres={genres} maxYear={maxYear} onChange={setFilter} onReset={reset} />
          <div className="min-w-0 flex-1">
            <FilterSelect
              id="mobile-sort"
              label="Сортировка"
              value={resolveSort(filters)}
              options={sortOptions(filters.q !== null)}
              onChange={(value) => setFilter("sort", value as Filters["sort"])}
              active={filters.sort !== null}
            />
          </div>
        </div>

        <div className="mt-4 mb-6 min-h-8">
          <ActiveFilters filters={filters} onRemove={removeFilter} onReset={reset} />
        </div>

        {initial.ok ? (
          <CatalogResults
            key={serializeCatalogParams(filters).toString()}
            filters={filters}
            initial={initial.data}
            isPending={isPending}
            onReset={reset}
          />
        ) : (
          <DataError code={initial.error.code} />
        )}
      </div>
    </div>
  );
}
