"use client";

import Link from "next/link";
import { type ComponentProps, useState } from "react";

/**
 * Ссылка на страницу тайтла с prefetch по намерению (docs: guides/prefetching → Hover-triggered prefetch).
 * До наведения — `auto`: общий App Shell, как у обычной ссылки. При наведении, фокусе или касании — `true`:
 * Next.js заранее отдаёт закэшированные данные этого тайтла (`use cache`), и переход открывается сразу.
 * Полный prefetch для всех видимых карточек сделал бы по запросу на карточку (и к AniList) — поэтому только по намерению.
 */
export function IntentLink({ onPointerEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? true : "auto"}
      onPointerEnter={(event) => {
        setIntent(true);
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
