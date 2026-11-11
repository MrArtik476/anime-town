import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { OpenTitleForm } from "@/features/admin/components/open-title-form";
import { getAdminTitles } from "@/features/admin/queries";

export const metadata: Metadata = {
  title: "Серии — админ-панель",
  robots: { index: false },
};

async function Titles() {
  await requireAdmin();
  const titles = await getAdminTitles();

  return (
    <>
      <section aria-labelledby="open-heading">
        <h2 id="open-heading" className="font-heading text-xl font-semibold tracking-tight">
          Открыть тайтл
        </h2>
        <div className="mt-4">
          <OpenTitleForm />
        </div>
      </section>

      <section aria-labelledby="titles-heading" className="mt-12">
        <h2 id="titles-heading" className="font-heading text-xl font-semibold tracking-tight">
          Тайтлы с сериями
        </h2>
        <div className="mt-4">
          {titles.failed ? (
            <p role="alert" className="text-sm text-destructive">
              Не удалось загрузить список — обновите страницу
            </p>
          ) : titles.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Серий пока нет. Откройте тайтл по id и добавьте первую.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card/60">
              {titles.items.map((title) => (
                <li key={title.animeId} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
                  <Link
                    href={`/admin/episodes/${title.animeId}`}
                    className="min-w-0 font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
                  >
                    {title.name}
                  </Link>
                  <span className="ml-auto text-muted-foreground">
                    серий: {title.total}
                    {title.total > title.published && `, черновиков: ${title.total - title.published}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

export default function AdminEpisodesPage() {
  return (
    <AdminShell section="episodes" title="Серии" description="Выберите тайтл, чтобы добавить или изменить серии и субтитры.">
      <Titles />
    </AdminShell>
  );
}
