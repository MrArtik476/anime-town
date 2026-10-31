import type { Metadata } from "next";

import { NotFoundMessage } from "@/components/layout/not-found-message";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Страница не найдена",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <NotFoundMessage title="Страница не найдена" description="Такой страницы нет. Возможно, ссылка устарела." />
      </main>
      <SiteFooter />
    </>
  );
}
