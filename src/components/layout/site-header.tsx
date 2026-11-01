import Link from "next/link";
import { Suspense } from "react";

import { siteConfig } from "@/config/site";
import { UserMenu, UserMenuFallback } from "@/features/auth/components/user-menu";

import { MainNav } from "./main-nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-md bg-primary font-heading text-sm font-bold text-primary-foreground"
          >
            町
          </span>
          <span className="hidden font-heading text-base font-semibold tracking-tight whitespace-nowrap min-[400px]:inline">
            {siteConfig.name}
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <MainNav />
          <Suspense fallback={<UserMenuFallback />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
