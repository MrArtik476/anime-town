"use client";

import { X } from "lucide-react";

import { type CatalogFilters, FILTER_KEYS } from "@/lib/anime/catalog-params";

import { filterChipLabel } from "./filter-options";

type ActiveFiltersProps = {
  filters: CatalogFilters;
  onRemove: (key: keyof CatalogFilters) => void;
  onReset: () => void;
};

export function ActiveFilters({ filters, onRemove, onReset }: ActiveFiltersProps) {
  const chips = FILTER_KEYS.map((key) => ({ key, label: filterChipLabel(key, filters) })).filter(
    (chip): chip is { key: (typeof FILTER_KEYS)[number]; label: string } => chip.label !== null,
  );

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Активные фильтры" role="group">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 py-1 pr-2 pl-3 text-sm text-foreground outline-none transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <span className="truncate">{chip.label}</span>
          <X aria-hidden className="size-3.5 shrink-0 text-primary" />
          <span className="sr-only">— убрать фильтр</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="rounded-full px-3 py-1 text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        Сбросить всё
      </button>
    </div>
  );
}
