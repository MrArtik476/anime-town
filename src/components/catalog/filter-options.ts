import {
  type CatalogFilters,
  type CatalogSort,
  SORT_LABELS,
  SORT_OPTIONS,
  yearOptions,
} from "@/lib/anime/catalog-params";
import { FORMAT_LABELS, formatGenre, SEASON_LABELS, STATUS_LABELS } from "@/lib/anime/format";
import { MEDIA_FORMATS, MEDIA_SEASONS, MEDIA_STATUSES } from "@/lib/anilist/types";

import type { SelectOption } from "./filter-select";

export const FORMAT_OPTIONS: SelectOption[] = MEDIA_FORMATS.map((value) => ({ value, label: FORMAT_LABELS[value] }));
export const STATUS_OPTIONS: SelectOption[] = MEDIA_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));
export const SEASON_OPTIONS: SelectOption[] = MEDIA_SEASONS.map((value) => ({ value, label: SEASON_LABELS[value] }));

export const genreOptions = (genres: string[]): SelectOption[] =>
  genres
    .map((genre) => ({ value: genre, label: formatGenre(genre) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));

export const yearSelectOptions = (maxYear: number): SelectOption[] =>
  yearOptions(maxYear).map((year) => ({ value: String(year), label: String(year) }));

/** «По совпадению» имеет смысл только при поиске. */
export const sortOptions = (hasQuery: boolean): SelectOption[] =>
  SORT_OPTIONS.filter((sort) => hasQuery || sort !== "relevance").map((value) => ({
    value,
    label: SORT_LABELS[value as CatalogSort],
  }));

/** Подпись активного фильтра для «чипса». */
export function filterChipLabel(key: keyof CatalogFilters, filters: CatalogFilters): string | null {
  switch (key) {
    case "q":
      return filters.q ? `«${filters.q}»` : null;
    case "genre":
      return filters.genre ? formatGenre(filters.genre) : null;
    case "year":
      return filters.year ? `${filters.year} год` : null;
    case "season":
      return filters.season ? SEASON_LABELS[filters.season] : null;
    case "format":
      return filters.format ? FORMAT_LABELS[filters.format] : null;
    case "status":
      return filters.status ? STATUS_LABELS[filters.status] : null;
    case "sort":
      return filters.sort ? SORT_LABELS[filters.sort] : null;
  }
}
