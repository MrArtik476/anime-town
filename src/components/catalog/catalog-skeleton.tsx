import { AnimeGridSkeleton } from "@/components/anime/anime-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export function CatalogSkeleton() {
  return (
    <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
      <div className="hidden lg:block">
        <Skeleton className="h-[30rem] rounded-xl" />
      </div>
      <div className="min-w-0">
        <Skeleton className="h-12 rounded-xl" />
        <div className="mt-6 flex gap-3 lg:hidden">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 flex-1" />
        </div>
        <AnimeGridSkeleton count={10} className="mt-10" />
      </div>
    </div>
  );
}
