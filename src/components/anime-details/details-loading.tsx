"use client";

import { useEffect, useState } from "react";

import { previewDetails } from "@/components/anime/card-preview";
import type { AnimeDetails } from "@/types/anime";

import { DetailsHero } from "./details-hero";
import { DetailsBodySkeleton, DetailsSkeleton } from "./details-skeleton";

/**
 * Загрузка страницы тайтла. Если пользователь пришёл по карточке, шапка (постер, название, оценка, жанры)
 * рисуется сразу из её данных, а скелетон — только у описания и деталей. Иначе — обычный скелетон.
 * id берётся из адреса после монтирования: в статической оболочке страницы его ещё нет.
 */
export function DetailsLoading() {
  const [preview, setPreview] = useState<AnimeDetails | null>(null);

  useEffect(() => {
    const id = Number(window.location.pathname.match(/^\/anime\/(\d+)/)?.[1]);
    // Адрес читается после монтирования: при клиентском переходе fallback рендерится раньше, чем Next.js
    // обновит URL, поэтому useSyncExternalStore прочитал бы старый адрес.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setPreview(previewDetails(id));
  }, []);

  if (!preview) return <DetailsSkeleton />;
  return (
    <div aria-busy="true">
      <DetailsHero anime={preview} />
      <DetailsBodySkeleton />
    </div>
  );
}
