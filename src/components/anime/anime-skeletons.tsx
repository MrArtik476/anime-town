import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { ANIME_GRID_CLASS } from "./anime-grid";

export function AnimeCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <Skeleton className="mt-3 h-3.5 w-4/5" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}

export function AnimeGridSkeleton({ count = 10, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Загрузка тайтлов" className={cn(ANIME_GRID_CLASS, className)}>
      {Array.from({ length: count }, (_, index) => (
        <AnimeCardSkeleton key={index} />
      ))}
    </div>
  );
}
