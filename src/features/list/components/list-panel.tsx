import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getMyListEntry } from "../queries";
import { ListControls } from "./list-controls";

const panelClass = "rounded-xl border border-border/70 bg-card/60 p-5";

/**
 * Блок «Мой список» на странице тайтла. Читает сессию — поэтому рендерится в своём <Suspense>:
 * данные тайтла остаются в кэше и prefetch, а личные данные приходят отдельно.
 */
export async function ListPanel({ animeId }: { animeId: number }) {
  const { signedIn, entry } = await getMyListEntry(animeId);
  if (!signedIn) {
    return (
      <div className={panelClass}>
        <p className="text-sm font-medium">Мой список</p>
        <p className="mt-1.5 text-sm text-muted-foreground">Отмечайте, что смотрите, и ставьте оценки.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/anime/${animeId}`)}`}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-4 h-10 w-full")}
        >
          Войти, чтобы добавить
        </Link>
      </div>
    );
  }
  return (
    <section aria-label="Личный список" className={panelClass}>
      <ListControls animeId={animeId} initial={entry} />
    </section>
  );
}

export function ListPanelSkeleton() {
  return <Skeleton aria-hidden className="h-52 rounded-xl" />;
}
