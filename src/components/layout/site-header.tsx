import Link from "next/link";

import { siteConfig } from "@/config/site";

const navItems = [
  { href: "#about", label: "О проекте" },
  { href: "#catalog", label: "Каталог" },
  { href: "#roadmap", label: "Этапы" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-md bg-primary font-heading text-sm font-bold text-primary-foreground"
          >
            町
          </span>
          <span className="whitespace-nowrap font-heading text-base font-semibold tracking-tight">
            {siteConfig.name}
          </span>
        </Link>

        {/* На узких экранах разделы доступны прокруткой; мобильное меню — вместе с реальными страницами. */}
        <nav aria-label="Основная навигация" className="hidden sm:block">
          <ul className="flex items-center gap-1 text-sm">
            {navItems.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
