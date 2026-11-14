import Link from "next/link";

import type { SiteStats } from "../stats-model";

const number = new Intl.NumberFormat("ru-RU");

type Item = { label: string; value: number | null; note?: string; href?: string; attention?: boolean };

/** Сводка по сайту: числа крупно, на телефоне — по два в ряд. «—» — число не загрузилось. */
export function SiteStatsGrid({ stats }: { stats: SiteStats }) {
  const items: Item[] = [
    { label: "Пользователи", value: stats.users, note: stats.newUsers === null ? undefined : `+${number.format(stats.newUsers)} за 7 дней`, href: "/admin/users" },
    { label: "Серии на сайте", value: stats.published, note: stats.drafts === null ? undefined : `черновиков: ${number.format(stats.drafts)}`, href: "/admin/episodes" },
    { label: "Скрытые тайтлы", value: stats.hidden, href: "/admin/titles" },
    { label: "Комментарии за 7 дней", value: stats.newComments },
    { label: "Открытые жалобы", value: stats.openReports, href: "/admin/moderation/reports", attention: (stats.openReports ?? 0) > 0 },
    { label: "Активные баны", value: stats.activeBans, href: "/admin/moderation/bans" },
  ];

  return (
    <section aria-labelledby="site-stats-heading" className="mb-6">
      <h2 id="site-stats-heading" className="sr-only">
        Сводка по сайту
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const body = (
            <>
              <span className="block text-xs text-muted-foreground">{item.label}</span>
              <span className="mt-1 block">
                <span className={`font-heading text-2xl font-semibold tabular-nums ${item.attention ? "text-primary" : ""}`}>
                  {item.value === null ? "—" : number.format(item.value)}
                </span>
              </span>
              {item.note && <span className="mt-0.5 block text-xs text-muted-foreground">{item.note}</span>}
            </>
          );
          const box = "block h-full rounded-xl border border-border/70 bg-card/60 p-4";
          return (
            <li key={item.label} className="min-w-0">
              {item.href ? (
                <Link
                  href={item.href}
                  className={`${box} outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/60`}
                >
                  {body}
                </Link>
              ) : (
                <div className={box}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
