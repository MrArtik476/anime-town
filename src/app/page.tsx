import type { Metadata } from "next";
import { Suspense } from "react";

import { HomeContent } from "@/components/home/home-content";
import { HomeSkeleton } from "@/components/home/home-skeleton";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} — аниме-каталог: популярное, рейтинг, новинки сезона` },
  description:
    "Популярное аниме, тайтлы с высоким рейтингом и новинки текущего сезона. Каталог с поиском и фильтрами по данным AniList.",
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Suspense fallback={<HomeSkeleton />}>
          <HomeContent />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
