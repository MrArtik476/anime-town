"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { useLastCatalogHref } from "@/hooks/use-last-catalog-href";

/** Возвращает в каталог с теми же фильтрами, что были перед переходом. */
export function BackToCatalog() {
  const href = useLastCatalogHref();

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Вернуться в каталог
    </Link>
  );
}
