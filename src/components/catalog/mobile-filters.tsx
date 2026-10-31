"use client";

import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CatalogFilters as Filters } from "@/lib/anime/catalog-params";
import { countActiveFilters } from "@/lib/anime/catalog-params";

import { CatalogFilters, type FilterChange } from "./catalog-filters";

type MobileFiltersProps = {
  filters: Filters;
  genres: string[];
  maxYear: number;
  onChange: FilterChange;
  onReset: () => void;
};

/** Телефон и планшет: фильтры в нижней шторке, применяются сразу, результаты видны после закрытия. */
export function MobileFilters({ filters, genres, maxYear, onChange, onReset }: MobileFiltersProps) {
  const active = countActiveFilters(filters);

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="lg" className="h-11 shrink-0 gap-2 px-4">
            <SlidersHorizontal aria-hidden className="size-4" />
            Фильтры
            {active > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {active}
              </span>
            )}
          </Button>
        }
      />
      <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-heading text-lg">Фильтры</SheetTitle>
          <SheetDescription>Каталог обновляется сразу при выборе.</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4">
          <CatalogFilters
            filters={filters}
            genres={genres}
            maxYear={maxYear}
            onChange={onChange}
            idPrefix="mobile-filter"
            showSort={false}
          />
        </div>
        <SheetFooter className="flex-row gap-3 border-t border-border/60">
          <Button variant="ghost" size="lg" className="h-11 flex-1" onClick={onReset} disabled={active === 0}>
            Сбросить
          </Button>
          <SheetClose render={<Button size="lg" className="h-11 flex-1" />}>Показать</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
