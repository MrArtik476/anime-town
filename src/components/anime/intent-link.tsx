"use client";

import Link from "next/link";
import { type ComponentProps, useState } from "react";

import type { AnimeCard } from "@/types/anime";

import { rememberCardPreview } from "./card-preview";

type IntentLinkProps = ComponentProps<typeof Link> & {
  /** Данные карточки: пока страница тайтла грузится, её шапка рисуется из них (DetailsLoading). */
  preview?: AnimeCard;
};

/**
 * Ссылка на страницу тайтла с prefetch по намерению (docs: guides/prefetching → Hover-triggered prefetch).
 * До наведения — `auto`: общий App Shell, как у обычной ссылки. При наведении, фокусе или касании — `true`:
 * Next.js заранее отдаёт закэшированные данные этого тайтла (`use cache`), и переход открывается сразу.
 * Полный prefetch для всех видимых карточек сделал бы по запросу на карточку (и к AniList) — поэтому только по намерению.
 */
export function IntentLink({ preview, onPointerEnter, onFocus, onTouchStart, onClick, ...props }: IntentLinkProps) {
  const [intent, setIntent] = useState(false);
  const showIntent = () => {
    setIntent(true);
    if (preview) rememberCardPreview(preview);
  };
  return (
    <Link
      {...props}
      prefetch={intent ? true : "auto"}
      onPointerEnter={(event) => {
        showIntent();
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        showIntent();
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        showIntent();
        onTouchStart?.(event);
      }}
      onClick={(event) => {
        if (preview) rememberCardPreview(preview);
        onClick?.(event);
      }}
    />
  );
}
