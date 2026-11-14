import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { EpisodeManager } from "@/features/admin/components/episode-manager";
import { parseAnimeId } from "@/features/admin/model";
import { getAdminEpisodes, getTitleName } from "@/features/admin/queries";

export const metadata: Metadata = {
  title: "Серии тайтла — админ-панель",
  robots: { index: false },
};

type Props = { params: Promise<{ animeId: string }> };

async function TitleEpisodes({ params }: Props) {
  await requireAdmin();
  const animeId = parseAnimeId((await params).animeId);
  if (!animeId) notFound();
  const [name, episodes] = await Promise.all([getTitleName(animeId), getAdminEpisodes(animeId)]);

  return (
    <section aria-labelledby="title-heading">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="title-heading" className="min-w-0 font-heading text-xl font-semibold tracking-tight break-words">
          {name}
        </h2>
        <Link href={`/anime/${animeId}`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Страница тайтла
        </Link>
        <Link href={`/admin/titles/${animeId}`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Название, описание, видимость
        </Link>
      </div>
      <div className="mt-4">
        {episodes.failed ? (
          <p role="alert" className="text-sm text-destructive">
            Не удалось загрузить серии — обновите страницу
          </p>
        ) : (
          <EpisodeManager animeId={animeId} episodes={episodes.items} />
        )}
      </div>
    </section>
  );
}

export default function AdminTitleEpisodesPage({ params }: Props) {
  return (
    <AdminShell section="episodes" title="Серии тайтла" description="Черновики видны только здесь. Публикуйте только видео, на которое есть права.">
      <TitleEpisodes params={params} />
    </AdminShell>
  );
}
