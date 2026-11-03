import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentProfile } from "@/features/auth/session";
import { ActiveBans } from "@/features/moderation/components/active-bans";
import { ReportList } from "@/features/moderation/components/report-list";
import { getActiveBans, getOpenReports } from "@/features/moderation/queries";

export const metadata: Metadata = {
  title: "Модерация",
  robots: { index: false },
};

/**
 * Жалобы и баны. Только модератор и администратор: остальным — 404, даже вошедшим (спек §5).
 * Это удобство интерфейса; читать жалобы и действовать не даст RLS.
 */
async function ModerationContent({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const current = await getCurrentProfile();
  const role = current?.profile?.role;
  if (role !== "moderator" && role !== "admin") notFound();

  const { cursor } = await searchParams;
  const [reports, bans] = await Promise.all([getOpenReports(typeof cursor === "string" ? cursor : null), getActiveBans()]);

  return (
    <>
      <section aria-labelledby="reports-heading">
        <h2 id="reports-heading" className="font-heading text-xl font-semibold tracking-tight">
          Жалобы
        </h2>
        <div className="mt-4">
          {reports.failed ? (
            <p role="alert" className="text-sm text-destructive">
              Не удалось загрузить жалобы — обновите страницу
            </p>
          ) : (
            <ReportList initial={reports.items} />
          )}
          {reports.nextCursor && (
            <Link href={`/moderation?cursor=${reports.nextCursor}`} className={`${buttonVariants({ variant: "outline" })} mt-4 w-full`}>
              Следующие жалобы
            </Link>
          )}
        </div>
      </section>

      <section aria-labelledby="bans-heading" className="mt-12">
        <h2 id="bans-heading" className="font-heading text-xl font-semibold tracking-tight">
          Действующие баны
        </h2>
        <div className="mt-4">
          <ActiveBans initial={bans} />
        </div>
      </section>
    </>
  );
}

function ModerationSkeleton() {
  return (
    <div role="status" aria-label="Загрузка" className="space-y-4">
      <Skeleton aria-hidden className="h-7 w-32" />
      <Skeleton aria-hidden className="h-36 rounded-xl" />
      <Skeleton aria-hidden className="h-36 rounded-xl" />
    </div>
  );
}

export default function ModerationPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Модерация</h1>
        <p className="mt-2 text-muted-foreground">Открытые жалобы от старых к новым и действующие баны.</p>
        <div className="mt-8">
          <Suspense fallback={<ModerationSkeleton />}>
            <ModerationContent searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
