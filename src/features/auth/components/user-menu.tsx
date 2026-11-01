import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getCurrentProfile } from "../session";
import { UserAvatar } from "./user-avatar";

const itemClass =
  "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * Вход или профиль в шапке. Читает cookies — поэтому рендерится внутри <Suspense> (динамическая «дырка»),
 * а остальная страница остаётся статической оболочкой.
 */
export async function UserMenu() {
  const current = await getCurrentProfile();
  if (!current) {
    return (
      <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), itemClass)}>
        Войти
      </Link>
    );
  }

  const name = current.profile?.username ?? "Профиль";
  return (
    <Link href="/account" className={cn(itemClass, "bg-muted text-foreground hover:bg-muted/70")} title="Профиль">
      <UserAvatar url={current.profile?.avatarUrl ?? null} name={name} size={24} />
      <span className="sr-only sm:not-sr-only">{name}</span>
    </Link>
  );
}

/** Место под кнопку, пока сессия не прочитана (без сдвига вёрстки). */
export function UserMenuFallback() {
  return <span aria-hidden className="inline-block h-9 w-[4.5rem] rounded-md bg-muted/40" />;
}
