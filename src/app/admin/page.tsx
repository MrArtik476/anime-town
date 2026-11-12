import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { getAdminTitles, getStaff } from "@/features/admin/queries";

export const metadata: Metadata = {
  title: "Админ-панель",
  robots: { index: false },
};

const cardClass =
  "block rounded-xl border border-border/70 bg-card/60 p-5 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/60";

async function Overview() {
  await requireAdmin();
  const [titles, staff] = await Promise.all([getAdminTitles(), getStaff()]);
  const episodes = titles.items.reduce((sum, title) => sum + title.total, 0);
  const drafts = titles.items.reduce((sum, title) => sum + title.total - title.published, 0);
  const moderators = staff.items.filter((user) => user.role === "moderator").length;
  const admins = staff.items.length - moderators;

  return (
    <>
      {(titles.failed || staff.failed) && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Не удалось загрузить часть данных — обновите страницу
        </p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        <li>
          <Link href="/admin/episodes" className={cardClass}>
            <h2 className="font-heading text-lg font-semibold">Серии</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Тайтлов с сериями: {titles.items.length}. Серий: {episodes}, из них черновиков: {drafts}.
            </p>
          </Link>
        </li>
        <li>
          <Link href="/admin/users" className={cardClass}>
            <h2 className="font-heading text-lg font-semibold">Пользователи</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Администраторов: {admins}, модераторов: {moderators}.
            </p>
          </Link>
        </li>
        <li>
          <Link href="/admin/moderation" className={cardClass}>
            <h2 className="font-heading text-lg font-semibold">Модерация</h2>
            <p className="mt-2 text-sm text-muted-foreground">Журнал действий модераторов, все жалобы и баны.</p>
          </Link>
        </li>
      </ul>
    </>
  );
}

export default function AdminPage() {
  return (
    <AdminShell section="overview" title="Админ-панель" description="Серии, субтитры, роли пользователей и модерация.">
      <Overview />
    </AdminShell>
  );
}
