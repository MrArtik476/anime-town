import {
  formatDuration,
  formatEpisodes,
  formatFormat,
  formatNumber,
  formatScore,
  formatSeason,
  formatSource,
  formatStatus,
} from "@/lib/anime/format";
import type { AnimeDetails } from "@/types/anime";

const NO_DATA = "Нет данных";

export function animeFacts(anime: AnimeDetails): { label: string; value: string | null }[] {
  const score = formatScore(anime.score);
  return [
    { label: "Формат", value: formatFormat(anime.format) },
    { label: "Статус", value: formatStatus(anime.status) },
    { label: "Эпизоды", value: formatEpisodes(anime.episodes) },
    { label: "Длительность серии", value: formatDuration(anime.duration) },
    { label: "Сезон", value: [formatSeason(anime.season), anime.year].filter(Boolean).join(" ") || null },
    { label: "Начало показа", value: anime.startDate },
    { label: "Окончание показа", value: anime.endDate },
    { label: anime.studios.length > 1 ? "Студии" : "Студия", value: anime.studios.join(", ") || null },
    { label: "Первоисточник", value: formatSource(anime.source) },
    { label: "Рейтинг AniList", value: score ? `${score} из 10` : null },
    { label: "Популярность", value: formatNumber(anime.popularity) },
    { label: "В избранном", value: formatNumber(anime.favourites) },
  ];
}

export function DetailsFacts({ anime }: { anime: AnimeDetails }) {
  return (
    <section aria-labelledby="facts-title" className="rounded-xl border border-border/70 bg-card p-5">
      <h2 id="facts-title" className="font-heading text-base font-semibold">
        Информация
      </h2>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
        {animeFacts(anime).map((fact) => (
          <div key={fact.label} className="flex justify-between gap-4 border-b border-border/50 pb-2.5 last:border-0">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className={fact.value ? "text-right font-medium" : "text-right text-muted-foreground/70"}>
              {fact.value ?? NO_DATA}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
