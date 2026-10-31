"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MAX_SEARCH_LENGTH } from "@/lib/anime/catalog-params";

export const SEARCH_DEBOUNCE_MS = 400;
export const MIN_SEARCH_LENGTH = 2;

/** Пустая строка и слишком короткий запрос означают «без поиска» — лишних запросов к AniList нет. */
export function normalizeQuery(text: string): string | null {
  const query = text.trim();
  return query.length >= MIN_SEARCH_LENGTH ? query : null;
}

type CatalogSearchProps = {
  /** Запрос из URL. */
  value: string | null;
  onSearch: (query: string | null) => void;
};

export function CatalogSearch({ value, onSearch }: CatalogSearchProps) {
  const [text, setText] = useState(value ?? "");
  const [syncedValue, setSyncedValue] = useState(value);
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  const previousDebounced = useRef(debounced);

  // Запрос сменился снаружи (сброс фильтров, кнопка «назад») — подтягиваем текст в поле.
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (normalizeQuery(text) !== value) setText(value ?? "");
  }

  // Реагируем только на новое отложенное значение. Смена `value` (после Enter или навигации)
  // перезапускает эффект, но не должна повторно отправлять устаревший текст.
  useEffect(() => {
    if (debounced === previousDebounced.current) return;
    previousDebounced.current = debounced;
    const query = normalizeQuery(debounced);
    if (query !== value) onSearch(query);
  }, [debounced, value, onSearch]);

  const submitNow = (nextText: string) => {
    const query = normalizeQuery(nextText);
    if (query !== value) onSearch(query);
  };

  const tooShort = text.trim().length > 0 && text.trim().length < MIN_SEARCH_LENGTH;

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submitNow(text);
      }}
    >
      <label htmlFor="catalog-search" className="sr-only">
        Поиск по названию
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="catalog-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={MAX_SEARCH_LENGTH}
          placeholder="Название аниме на любом языке"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-describedby="catalog-search-hint"
          className="h-12 w-full rounded-xl border border-input bg-card pr-11 pl-10 text-base outline-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button
            type="button"
            onClick={() => {
              setText("");
              submitNow("");
            }}
            className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Очистить поиск</span>
          </button>
        )}
      </div>
      <p id="catalog-search-hint" className="mt-1.5 min-h-4 text-xs text-muted-foreground" aria-live="polite">
        {tooShort ? `Введите минимум ${MIN_SEARCH_LENGTH} символа` : ""}
      </p>
    </form>
  );
}
