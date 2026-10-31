"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "anime-town:last-catalog-href";
const DEFAULT_HREF = "/catalog";
const listeners = new Set<() => void>();

/** Запоминает адрес каталога с фильтрами, чтобы со страницы тайтла вернуться к тем же результатам. */
export function rememberCatalogHref(href: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, href);
  } catch {
    // sessionStorage недоступен (приватный режим) — вернёмся на /catalog.
  }
  listeners.forEach((listener) => listener());
}

function read(): string {
  try {
    const href = sessionStorage.getItem(STORAGE_KEY);
    return href?.startsWith("/catalog") ? href : DEFAULT_HREF;
  } catch {
    return DEFAULT_HREF;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLastCatalogHref(): string {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_HREF);
}
