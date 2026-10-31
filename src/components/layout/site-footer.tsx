import Link from "next/link";

import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border/60">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm text-muted-foreground sm:grid-cols-[1fr_auto] sm:px-6">
        <div>
          <p className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
            <span aria-hidden className="text-primary">
              町
            </span>
            {siteConfig.name}
          </p>
          <p className="mt-2 max-w-md">{siteConfig.description}</p>
        </div>
        <nav aria-label="Ссылки в подвале" className="flex gap-4 sm:justify-end">
          <Link href="/" className="hover:text-foreground">
            Главная
          </Link>
          <Link href="/catalog" className="hover:text-foreground">
            Каталог
          </Link>
        </nav>
        <div className="flex flex-col gap-1 border-t border-border/60 pt-6 text-xs sm:col-span-2 sm:flex-row sm:justify-between">
          <p>
            Данные о тайтлах —{" "}
            <a
              href="https://anilist.co"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              AniList
            </a>
            .
          </p>
          <p>Видео на платформе — только лицензированный контент.</p>
        </div>
      </div>
    </footer>
  );
}
