import { Star } from "lucide-react";

import { formatScore } from "@/lib/anime/format";
import { cn } from "@/lib/utils";

export function ScoreBadge({ score, className }: { score: number | null; className?: string }) {
  const value = formatScore(score);
  if (!value) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground backdrop-blur",
        className,
      )}
    >
      <Star aria-hidden className="size-3 fill-primary text-primary" />
      <span className="sr-only">Рейтинг </span>
      {value}
    </span>
  );
}
