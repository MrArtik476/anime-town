import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CatalogCta() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card px-6 py-10 sm:px-10">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-6 -right-2 font-heading text-[9rem] leading-none text-primary/10 select-none sm:text-[12rem]"
        >
          町
        </span>
        <h2 className="relative font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Весь каталог аниме
        </h2>
        <p className="relative mt-2 max-w-xl text-muted-foreground">
          Поиск по названию, фильтры по жанру, году, сезону, формату и статусу, сортировка по популярности и рейтингу.
        </p>
        <Link
          href="/catalog"
          className={cn(buttonVariants({ size: "lg" }), "relative mt-6 h-11 px-5")}
        >
          Открыть каталог
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}
