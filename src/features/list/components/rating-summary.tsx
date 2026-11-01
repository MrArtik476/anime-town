import { Star } from "lucide-react";

import { plural } from "@/lib/anime/format";

import { getRatingSummary } from "../rating";

const ratingFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «Оценка зрителей Anime Town»: среднее по оценкам пользователей сайта (не AniList). */
export async function RatingSummaryCard({ animeId }: { animeId: number }) {
  const summary = await getRatingSummary(animeId);
  return (
    <section aria-label="Оценка зрителей Anime Town" className="rounded-xl border border-border/70 bg-card/60 p-5">
      <p className="text-sm font-medium">Оценка зрителей Anime Town</p>
      {summary ? (
        <p className="mt-2 flex items-baseline gap-2">
          <Star aria-hidden className="size-5 self-center fill-primary text-primary" />
          <span className="font-heading text-3xl font-bold">{ratingFormat.format(summary.average)}</span>
          <span className="text-sm text-muted-foreground">
            из 10 · {summary.count} {plural(summary.count, ["оценка", "оценки", "оценок"])}
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">Оценок пока нет — поставьте первую.</p>
      )}
    </section>
  );
}
