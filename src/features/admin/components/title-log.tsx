import Link from "next/link";

import type { Listing } from "../queries";
import type { TitleLogEntry } from "../title-queries";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Minsk",
});

/** Журнал действий над тайтлами. withTitle — показывать название со ссылкой (общий журнал раздела). */
export function TitleLog({ log, empty, withTitle = false }: { log: Listing<TitleLogEntry>; empty: string; withTitle?: boolean }) {
  if (log.failed) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Не удалось загрузить журнал — обновите страницу
      </p>
    );
  }
  if (log.items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/60 text-sm">
      {log.items.map((item) => (
        <li key={item.id} className="space-y-1 p-4">
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="min-w-0 break-words">
              <span className="font-medium">{item.what}</span>
              {withTitle && (
                <>
                  {" — "}
                  <Link
                    href={`/admin/titles/${item.animeId}`}
                    className="rounded underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
                  >
                    {item.name}
                  </Link>
                </>
              )}
            </span>
            <span className="ml-auto text-muted-foreground">
              @{item.admin}, <time dateTime={item.createdAt}>{dateFormat.format(Date.parse(item.createdAt))}</time>
            </span>
          </p>
          {item.reason && (
            <p className="break-words text-muted-foreground">
              Причина: {item.reason}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
