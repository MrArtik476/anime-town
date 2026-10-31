"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Главная", isActive: (path: string) => path === "/" },
  {
    href: "/catalog",
    label: "Каталог",
    isActive: (path: string) => path.startsWith("/catalog") || path.startsWith("/anime"),
  },
];

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Основная навигация">
      <ul className="flex items-center gap-1 text-sm">
        {navItems.map((item) => {
          const active = pathname !== null && item.isActive(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

/** На динамических маршрутах путь известен только при запросе — до этого ссылки без подсветки. */
export function MainNav() {
  return (
    <Suspense fallback={<NavLinks pathname={null} />}>
      <ActiveNavLinks />
    </Suspense>
  );
}
