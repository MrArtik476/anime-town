import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Общие части раздела «Модерация» админ-панели: вкладки, метки состояния, дата, фильтр-ссылки, «Показать ещё». */

const TABS = [
  { key: "log", href: "/admin/moderation", label: "Журнал" },
  { key: "reports", href: "/admin/moderation/reports", label: "Жалобы" },
  { key: "bans", href: "/admin/moderation/bans", label: "Баны" },
] as const;

export type ModerationTab = (typeof TABS)[number]["key"];

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/60";

/** Вкладки раздела и переход к рабочему месту модератора (разбор открытых жалоб остаётся на /moderation). */
export function ModerationTabs({ current }: { current: ModerationTab }) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3">
      <nav aria-label="Модерация: разделы" className="inline-flex rounded-lg border border-border/70 bg-card/60 p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={tab.key === current ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors",
              focusRing,
              tab.key === current ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Link href="/moderation" className={cn("ml-auto rounded text-sm text-primary underline-offset-4 hover:underline", focusRing)}>
        Разобрать открытые жалобы
      </Link>
    </div>
  );
}

export type Tone = "neutral" | "accent" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-primary/15 text-primary",
  danger: "bg-destructive/15 text-destructive",
};

/** Метка состояния. Смысл несёт текст, цвет — только подсказка. */
export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>{children}</span>;
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Minsk",
});

/** Дата и время по Минску — одинаково на сервере и в браузере. */
export function When({ iso }: { iso: string }) {
  return <time dateTime={iso}>{dateFormat.format(Date.parse(iso))}</time>;
}

/** Переключатель-фильтр из ссылок: работает без JavaScript, выбор остаётся в адресе. */
export function FilterLinks({ label, options }: { label: string; options: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.current ? "true" : undefined}
          className={cn(
            "inline-flex h-9 items-center rounded-full border px-3.5 text-sm transition-colors",
            focusRing,
            option.current
              ? "border-primary/60 bg-primary/15 font-medium text-foreground"
              : "border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

export function MoreLink({ href }: { href: string }) {
  return (
    <Link href={href} className={`${buttonVariants({ variant: "outline" })} mt-4 w-full`}>
      Показать ещё
    </Link>
  );
}

export function ListError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      {children}
    </p>
  );
}

export function ListEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export const listClass = "divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/60";
export const userClass = "font-medium break-all";
