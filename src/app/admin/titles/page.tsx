import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { OpenTitleForm } from "@/features/admin/components/open-title-form";
import { TitleLog } from "@/features/admin/components/title-log";
import type { Listing } from "@/features/admin/queries";
import { getEditedTitles, getHiddenTitles, getTitleLog, type TitleRef } from "@/features/admin/title-queries";

export const metadata: Metadata = {
  title: "Тайтлы — админ-панель",
  robots: { index: false },
};

const headingClass = "font-heading text-xl font-semibold tracking-tight";

function TitleList<T extends TitleRef>({ list, empty, note }: { list: Listing<T>; empty: string; note?: (item: T) => string }) {
  if (list.failed) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Не удалось загрузить список — обновите страницу
      </p>
    );
  }
  if (list.items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/60">
      {list.items.map((item) => (
        <li key={item.animeId} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
          <Link
            href={`/admin/titles/${item.animeId}`}
            className="min-w-0 rounded font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            {item.name}
          </Link>
          {note && <span className="ml-auto text-muted-foreground">{note(item)}</span>}
        </li>
      ))}
    </ul>
  );
}

async function Titles() {
  await requireAdmin();
  const [hidden, edited, log] = await Promise.all([getHiddenTitles(), getEditedTitles(), getTitleLog()]);

  return (
    <>
      <section aria-labelledby="open-heading">
        <h2 id="open-heading" className={headingClass}>
          Открыть тайтл
        </h2>
        <div className="mt-4">
          <OpenTitleForm basePath="/admin/titles" />
        </div>
      </section>

      <section aria-labelledby="hidden-heading" className="mt-12">
        <h2 id="hidden-heading" className={headingClass}>
          Скрытые тайтлы
        </h2>
        <div className="mt-4">
          <TitleList list={hidden} empty="Скрытых тайтлов нет." />
        </div>
      </section>

      <section aria-labelledby="edited-heading" className="mt-12">
        <h2 id="edited-heading" className={headingClass}>
          С ручным текстом
        </h2>
        <div className="mt-4">
          <TitleList
            list={edited}
            empty="Ручных названий и описаний пока нет."
            note={(item) => [item.title && "название", item.description && "описание"].filter(Boolean).join(" и ")}
          />
        </div>
      </section>

      <section aria-labelledby="log-heading" className="mt-12">
        <h2 id="log-heading" className={headingClass}>
          Журнал
        </h2>
        <div className="mt-4">
          <TitleLog log={log} empty="Тайтлы ещё не меняли." withTitle />
        </div>
      </section>
    </>
  );
}

export default function AdminTitlesPage() {
  return (
    <AdminShell section="titles" title="Тайтлы" description="Правка русских названий и описаний, скрытие тайтла с сайта.">
      <Titles />
    </AdminShell>
  );
}
