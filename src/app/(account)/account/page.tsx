import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { signOut } from "@/features/auth/actions";
import { authLinkClass } from "@/features/auth/components/link-class";
import { ProfileForm } from "@/features/auth/components/profile-form";
import { getCurrentProfile } from "@/features/auth/session";
import { MyList } from "@/features/list/components/my-list";

export const metadata: Metadata = {
  title: "Профиль",
  robots: { index: false },
};

const ROLE_LABELS = { user: "Зритель", moderator: "Модератор", admin: "Администратор" } as const;

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

async function AccountContent() {
  const current = await getCurrentProfile();
  // Вторая проверка после proxy: страница не показывает чужое и без сессии.
  if (!current) redirect("/login?next=/account");
  const { user, profile } = current;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="profile-heading" className="rounded-2xl border border-border/70 bg-card/60 p-6 sm:p-8">
        <h2 id="profile-heading" className="font-heading text-lg font-semibold">
          Данные профиля
        </h2>
        <div className="mt-5">
          {profile ? (
            <ProfileForm username={profile.username} displayName={profile.displayName} />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              Профиль не загрузился. Обновите страницу чуть позже.
            </p>
          )}
        </div>
      </section>

      <aside aria-label="Аккаунт" className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-6">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Почта</dt>
            <dd className="mt-0.5 break-all">{user.email ?? "—"}</dd>
          </div>
          {profile && (
            <>
              <div>
                <dt className="text-muted-foreground">Роль</dt>
                <dd className="mt-0.5">{ROLE_LABELS[profile.role]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">С нами с</dt>
                <dd className="mt-0.5">{dateFormat.format(new Date(profile.createdAt))}</dd>
              </div>
            </>
          )}
        </dl>
        <Link href="/auth/update-password" className={`${authLinkClass} block text-sm`}>
          Сменить пароль
        </Link>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="lg" className="h-10 w-full">
            Выйти
          </Button>
        </form>
      </aside>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-hidden>
      <Skeleton className="h-80 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Профиль</h1>
        <p className="mt-2 text-muted-foreground">Ник, имя, настройки аккаунта и ваш список тайтлов.</p>
        <div className="mt-8">
          <Suspense fallback={<AccountSkeleton />}>
            <AccountContent />
          </Suspense>
        </div>

        <section aria-labelledby="my-list-heading" className="mt-12">
          <h2 id="my-list-heading" className="font-heading text-2xl font-bold tracking-tight">
            Мой список
          </h2>
          <div className="mt-5">
            <Suspense fallback={<Skeleton aria-hidden className="h-40 rounded-xl" />}>
              <MyList />
            </Suspense>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
