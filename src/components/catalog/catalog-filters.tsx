"use client";

import type { CatalogFilters as Filters } from "@/lib/anime/catalog-params";
import { resolveSort } from "@/lib/anime/catalog-params";

import {
  FORMAT_OPTIONS,
  genreOptions,
  SEASON_OPTIONS,
  sortOptions,
  STATUS_OPTIONS,
  yearSelectOptions,
} from "./filter-options";
import { FilterSelect } from "./filter-select";

export type FilterChange = <K extends keyof Filters>(key: K, value: Filters[K]) => void;

type CatalogFiltersProps = {
  filters: Filters;
  genres: string[];
  maxYear: number;
  onChange: FilterChange;
  /** Префикс id — панель рендерится и в боковой колонке, и в мобильной шторке. */
  idPrefix: string;
  showSort?: boolean;
};

export function CatalogFilters({ filters, genres, maxYear, onChange, idPrefix, showSort = true }: CatalogFiltersProps) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const orNull = (value: string) => (value === "" ? null : value);
  // Жанр из URL остаётся выбранным, даже если список жанров не загрузился.
  const genreList = filters.genre && !genres.includes(filters.genre) ? [...genres, filters.genre] : genres;

  return (
    <div className="grid gap-4">
      {showSort && (
        <FilterSelect
          id={id("sort")}
          label="Сортировка"
          value={resolveSort(filters)}
          options={sortOptions(filters.q !== null)}
          onChange={(value) => onChange("sort", value as Filters["sort"])}
          active={filters.sort !== null}
        />
      )}
      <FilterSelect
        id={id("genre")}
        label="Жанр"
        emptyLabel="Все жанры"
        value={filters.genre ?? ""}
        options={genreOptions(genreList)}
        onChange={(value) => onChange("genre", orNull(value))}
        active={filters.genre !== null}
      />
      <div className="grid grid-cols-2 gap-3">
        <FilterSelect
          id={id("year")}
          label="Год"
          emptyLabel="Любой"
          value={filters.year ? String(filters.year) : ""}
          options={yearSelectOptions(maxYear)}
          onChange={(value) => onChange("year", value ? Number(value) : null)}
          active={filters.year !== null}
        />
        <FilterSelect
          id={id("season")}
          label="Сезон"
          emptyLabel="Любой"
          value={filters.season ?? ""}
          options={SEASON_OPTIONS}
          onChange={(value) => onChange("season", orNull(value) as Filters["season"])}
          active={filters.season !== null}
        />
      </div>
      <FilterSelect
        id={id("format")}
        label="Формат"
        emptyLabel="Любой формат"
        value={filters.format ?? ""}
        options={FORMAT_OPTIONS}
        onChange={(value) => onChange("format", orNull(value) as Filters["format"])}
        active={filters.format !== null}
      />
      <FilterSelect
        id={id("status")}
        label="Статус"
        emptyLabel="Любой статус"
        value={filters.status ?? ""}
        options={STATUS_OPTIONS}
        onChange={(value) => onChange("status", orNull(value) as Filters["status"])}
        active={filters.status !== null}
      />
    </div>
  );
}
