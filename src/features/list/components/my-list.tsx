import { Star } from "lucide-react";
import Link from "next/link";

import { IntentLink } from "@/components/anime/intent-link";
import { PosterImage } from "@/components/anime/poster-image";
import { buttonVariants } from "@/components/ui/button";
import { getHiddenIds } from "@/lib/anime/hidden";
import { cn } from "@/lib/utils";

import { groupByStatus, LIST_STATUS_LABELS } from "../model";
import { getMyList } from "../queries";

/** Личный список в профиле: группы по статусу, внутри — свежие изменения сверху. */
export async function MyList() {
  const [list, hiddenIds] = await Promise.all([getMyList(), getHiddenIds()]);
  const entries = list ?? [];
  const hidden = new Set(hiddenIds);
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <p className="font-medium">Список пока пуст</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Откройте тайтл и выберите статус: «{LIST_STATUS_LABELS.planned}», «{LIST_STATUS_LABELS.watching}» и другие.
        </p>
        <Link href="/catalog" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-5 h-10 px-5")}>
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groupByStatus(entries).map((group) => (
        <section key={group.key} aria-labelledby={`list-${group.key}`}>
          <h3 id={`list-${group.key}`} className="flex items-baseline gap-2 font-heading text-base font-semibold">
            {group.label}
            <span className="text-sm font-normal text-muted-foreground">{group.items.length}</span>
          </h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {group.items.map((entry) => (
              <li key={entry.animeId}>
                {hidden.has(entry.animeId) ? (
                  // Тайтл скрыт администратором: запись и оценка остаются у пользователя, но открыть его нельзя.
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/70 bg-card/50 p-2">
                    <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-md opacity-50">
                      <PosterImage src={entry.coverUrl} color={null} alt="" sizes="48px" />
                    </div>
                    <span className="min-w-0 flex-1 text-sm font-medium text-muted-foreground line-clamp-2">{entry.title}</span>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Недоступен</span>
                  </div>
                ) : (
                <IntentLink
                  href={`/anime/${entry.animeId}`}
                  className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-2 outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-md">
                    <PosterImage src={entry.coverUrl} color={null} alt="" sizes="48px" />
                  </div>
                  <span className="min-w-0 flex-1 text-sm font-medium line-clamp-2">{entry.title}</span>
                  {entry.score !== null && (
                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm" title="Моя оценка">
                      <Star aria-hidden className="size-3.5 fill-primary text-primary" />
                      <span className="sr-only">Моя оценка: </span>
                      {entry.score}
                    </span>
                  )}
                </IntentLink>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
