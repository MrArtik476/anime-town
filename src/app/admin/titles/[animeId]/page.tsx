import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { TitleLog } from "@/features/admin/components/title-log";
import { TitleTextForm, TitleVisibility } from "@/features/admin/components/title-editor";
import { parseAnimeId } from "@/features/admin/model";
import { getTitleLog, getTitleState } from "@/features/admin/title-queries";

export const metadata: Metadata = {
  title: "Тайтл — админ-панель",
  robots: { index: false },
};

type Props = { params: Promise<{ animeId: string }> };

const headingClass = "font-heading text-xl font-semibold tracking-tight";
const linkClass =
  "rounded text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/60";

async function Title({ params }: Props) {
  await requireAdmin();
  const animeId = parseAnimeId((await params).animeId);
  if (!animeId) notFound();
  const [state, log] = await Promise.all([getTitleState(animeId), getTitleLog(animeId)]);

  if (!state.exists) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 p-6 text-center">
        <p className="font-medium">Тайтла №{animeId} нет на AniList</p>
        <p className="mt-1.5 text-sm text-muted-foreground">Проверьте id — он есть в адресе страницы тайтла: /anime/21.</p>
        <Link href="/admin/titles" className={`${linkClass} mt-4 inline-block`}>
          К списку тайтлов
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className={`${headingClass} min-w-0 break-words`}>{state.name}</h2>
        <Link href={`/anime/${animeId}`} className={linkClass}>
          Страница тайтла
        </Link>
        <Link href={`/admin/episodes/${animeId}`} className={linkClass}>
          Серии
        </Link>
      </div>
      {state.degraded && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          AniList сейчас не отвечает — автоматические название и описание не показаны. Править и скрывать тайтл можно.
        </p>
      )}

      <section aria-labelledby="text-heading" className="mt-8">
        <h3 id="text-heading" className={headingClass}>
          Название и описание
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">Ваш текст важнее автоматического и не затирается обновлениями с Shikimori и машинным переводом.</p>
        <div className="mt-4">
          <TitleTextForm state={state} />
        </div>
      </section>

      <section aria-labelledby="visibility-heading" className="mt-12">
        <h3 id="visibility-heading" className={headingClass}>
          Видимость
        </h3>
        <div className="mt-4">
          <TitleVisibility state={state} />
        </div>
      </section>

      <section aria-labelledby="log-heading" className="mt-12">
        <h3 id="log-heading" className={headingClass}>
          Журнал тайтла
        </h3>
        <div className="mt-4">
          <TitleLog log={log} empty="Этот тайтл ещё не меняли." />
        </div>
      </section>
    </>
  );
}

export default function AdminTitlePage({ params }: Props) {
  return (
    <AdminShell section="titles" title="Тайтл" description="Русское название, описание и видимость на сайте. Каждое изменение записывается в журнал.">
      <Title params={params} />
    </AdminShell>
  );
}
