import Link from "next/link";
import { Suspense } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "overview", href: "/admin", label: "Обзор" },
  { key: "episodes", href: "/admin/episodes", label: "Серии" },
  { key: "users", href: "/admin/users", label: "Пользователи" },
] as const;

export type AdminSection = (typeof SECTIONS)[number]["key"];

function AdminSkeleton() {
  return (
    <div role="status" aria-label="Загрузка" className="space-y-4">
      <Skeleton aria-hidden className="h-7 w-40" />
      <Skeleton aria-hidden className="h-28 rounded-xl" />
      <Skeleton aria-hidden className="h-28 rounded-xl" />
    </div>
  );
}

/**
 * Каркас страниц админ-панели: шапка, разделы, содержимое в <Suspense> (проверка роли читает cookies).
 * Сама оболочка статична и ничего не раскрывает — данные появляются только после requireAdmin().
 */
export function AdminShell({
  section,
  title,
  description,
  children,
}: {
  section: AdminSection;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <nav aria-label="Разделы админ-панели" className="flex flex-wrap gap-1 border-b border-border/70 pb-3">
          {SECTIONS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === section ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-md px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                item.key === section ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <h1 className="mt-8 font-heading text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
        <div className="mt-8">
          <Suspense fallback={<AdminSkeleton />}>{children}</Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
