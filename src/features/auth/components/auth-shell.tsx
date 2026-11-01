import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/** Каркас страниц входа и регистрации: шапка, карточка формы по центру, подвал. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm sm:p-8">
            <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
            {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-5 space-y-2 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

