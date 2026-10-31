import { Skeleton } from "@/components/ui/skeleton";

export function DetailsSkeleton() {
  return (
    <div role="status" aria-label="Загрузка тайтла" className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <Skeleton className="h-5 w-40" />
      <div className="mt-24 grid gap-6 sm:mt-32 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-8 lg:mt-36 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Skeleton className="mx-auto aspect-[2/3] w-40 rounded-xl sm:mx-0 sm:w-full" />
        <div className="sm:pt-10 lg:pt-14">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
