import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { AnimeCard } from "@/components/anime/anime-card";
import type { AnimeCard as AnimeCardData } from "@/types/anime";

type AnimeRowProps = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  items: AnimeCardData[];
};

// Телефон и планшет: горизонтальная лента с прокруткой и привязкой к карточкам.
// Десктоп: сетка из 6 колонок, лишние карточки скрываются.
export function AnimeRow({ id, title, subtitle, href, items }: AnimeRowProps) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={id} className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={id} className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          Смотреть все
          <ArrowRight aria-hidden className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" />
        </Link>
      </div>

      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0 lg:pb-0 lg:[&>li:nth-child(n+7)]:hidden">
        {items.map((anime) => (
          <li key={anime.id} className="w-[38vw] max-w-44 shrink-0 snap-start sm:w-40 lg:w-auto lg:max-w-none">
            <AnimeCard anime={anime} />
          </li>
        ))}
      </ul>
    </section>
  );
}
