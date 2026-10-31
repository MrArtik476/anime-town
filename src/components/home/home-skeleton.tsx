import { AnimeCardSkeleton } from "@/components/anime/anime-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

function RowSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
      <Skeleton className="mb-5 h-6 w-48" />
      <div className="flex gap-3 overflow-hidden sm:gap-4 lg:grid lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <AnimeCardSkeleton key={index} className="w-[38vw] max-w-44 shrink-0 sm:w-40 lg:w-auto lg:max-w-none" />
        ))}
      </div>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div role="status" aria-label="Загрузка подборок">
      <div className="border-b border-border/60">
        <div className="mx-auto grid max-w-7xl items-end gap-8 px-4 pt-10 pb-12 sm:px-6 md:grid-cols-[auto_1fr] md:pt-20 md:pb-16">
          <Skeleton className="hidden aspect-[2/3] w-52 rounded-xl md:block lg:w-60" />
          <div>
            <Skeleton className="h-6 w-36 rounded-full" />
            <Skeleton className="mt-4 h-10 w-3/4" />
            <Skeleton className="mt-3 h-4 w-1/2" />
            <Skeleton className="mt-6 h-11 w-64" />
          </div>
        </div>
      </div>
      <RowSkeleton />
      <RowSkeleton />
    </div>
  );
}
