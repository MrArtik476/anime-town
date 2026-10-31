"use client";

import { Loader2, SearchX } from "lucide-react";
import { useState } from "react";

import { AnimeGrid } from "@/components/anime/anime-grid";
import { DataError } from "@/components/anime/data-error";
import { Button } from "@/components/ui/button";
import type { AniListFailure, AniListResult } from "@/lib/anilist/api";
import { type CatalogFilters, serializeCatalogParams } from "@/lib/anime/catalog-params";
import { plural } from "@/lib/anime/format";
import { cn } from "@/lib/utils";
import type { AnimeCard, AnimePage } from "@/types/anime";

export async function fetchCatalogPage(filters: CatalogFilters, page: number): Promise<AniListResult<AnimePage>> {
  const params = serializeCatalogParams(filters);
  params.set("page", String(page));
  try {
    const response = await fetch(`/api/catalog?${params}`);
    return (await response.json()) as AniListResult<AnimePage>;
  } catch {
    return { ok: false, error: { code: "NETWORK", retryAfter: null } };
  }
}

type CatalogResultsProps = {
  filters: CatalogFilters;
  initial: AnimePage;
  /** Идёт смена фильтров — показываем старые результаты приглушёнными. */
  isPending: boolean;
  onReset: () => void;
};

/** Список с «Загрузить ещё». Перемонтируется (key) при смене фильтров — страницы начинаются заново. */
export function CatalogResults({ filters, initial, isPending, onReset }: CatalogResultsProps) {
  const [items, setItems] = useState<AnimeCard[]>(initial.items);
  const [page, setPage] = useState(initial.page);
  const [hasNextPage, setHasNextPage] = useState(initial.hasNextPage);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<AniListFailure | null>(null);

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadError(null);
    const result = await fetchCatalogPage(filters, page + 1);
    setLoadingMore(false);

    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    // AniList иногда повторяет тайтл на стыке страниц — убираем дубликаты.
    setItems((current) => {
      const seen = new Set(current.map((anime) => anime.id));
      return [...current, ...result.data.items.filter((anime) => !seen.has(anime.id))];
    });
    setPage(result.data.page);
    setHasNextPage(result.data.hasNextPage);
  };

  if (items.length === 0) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <SearchX aria-hidden className="size-8 text-muted-foreground" />
        <p className="font-heading text-lg font-semibold">Ничего не найдено</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Попробуйте изменить запрос или убрать часть фильтров.
        </p>
        <Button variant="outline" onClick={onReset} className="mt-2">
          Сбросить фильтры
        </Button>
      </div>
    );
  }

  return (
    <div aria-busy={isPending || loadingMore}>
      <p className="sr-only" aria-live="polite">
        {`Показано ${items.length} ${plural(items.length, ["тайтл", "тайтла", "тайтлов"])}`}
      </p>
      <AnimeGrid
        items={items}
        className={cn("transition-opacity duration-200", isPending && "pointer-events-none opacity-50")}
      />

      <div className="mt-10 flex flex-col items-center gap-4">
        {loadError && (
          <DataError
            code={loadError.code}
            retryAfter={loadError.retryAfter}
            onRetry={loadMore}
            compact
            className="w-full max-w-lg"
          />
        )}
        {hasNextPage && !loadError && (
          <Button variant="outline" size="lg" onClick={loadMore} disabled={loadingMore || isPending} className="h-11 min-w-48 px-6">
            {loadingMore && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {loadingMore ? "Загружаем…" : "Загрузить ещё"}
          </Button>
        )}
        {!hasNextPage && items.length > 0 && (
          <p className="text-sm text-muted-foreground">Это все тайтлы по выбранным условиям.</p>
        )}
      </div>
    </div>
  );
}
