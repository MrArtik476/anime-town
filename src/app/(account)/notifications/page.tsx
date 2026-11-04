import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/features/auth/session";
import { NotificationList } from "@/features/notifications/components/notification-list";
import { getNotifications, getUnreadCount } from "@/features/notifications/queries";

export const metadata: Metadata = {
  title: "Уведомления",
  robots: { index: false },
};

async function NotificationsContent() {
  // Вторая проверка после proxy (isProtectedPath): без сессии — на вход с возвратом.
  if (!(await getCurrentUser())) redirect("/login?next=/notifications");
  const [page, unread] = await Promise.all([getNotifications(null), getUnreadCount()]);
  if (page.failed) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Не удалось загрузить уведомления
      </p>
    );
  }
  return <NotificationList initial={page.items} initialCursor={page.nextCursor} unread={unread} />;
}

function NotificationsSkeleton() {
  return (
    <div role="status" aria-label="Загрузка" className="space-y-2">
      <Skeleton aria-hidden className="h-20 rounded-xl" />
      <Skeleton aria-hidden className="h-20 rounded-xl" />
      <Skeleton aria-hidden className="h-20 rounded-xl" />
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Уведомления</h1>
        <p className="mt-2 text-muted-foreground">Ответы на ваши комментарии и новые серии из вашего списка.</p>
        <div className="mt-8">
          <Suspense fallback={<NotificationsSkeleton />}>
            <NotificationsContent />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
