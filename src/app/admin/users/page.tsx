import type { Metadata } from "next";

import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { adminInputClass } from "@/features/admin/components/styles";
import { UserRoles } from "@/features/admin/components/user-roles";
import { ROLE_LABELS, userSearchPattern } from "@/features/admin/model";
import { getRoleLog, getStaff, searchUsers } from "@/features/admin/queries";

export const metadata: Metadata = {
  title: "Пользователи — админ-панель",
  robots: { index: false },
};

type Props = { searchParams: Promise<{ q?: string | string[] }> };

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Minsk",
});

const headingClass = "font-heading text-xl font-semibold tracking-tight";

async function Users({ searchParams }: Props) {
  const current = await requireAdmin();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 40) : "";
  const pattern = userSearchPattern(query);
  const [found, staff, log] = await Promise.all([pattern ? searchUsers(pattern) : null, getStaff(), getRoleLog()]);

  return (
    <>
      <section aria-labelledby="search-heading">
        <h2 id="search-heading" className={headingClass}>
          Найти пользователя
        </h2>
        {/* Обычная GET-форма: работает без JavaScript, запрос остаётся в адресе. */}
        <form action="/admin/users" role="search" className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <label htmlFor="user-query" className="mb-1 block text-sm">
              Ник или его часть
            </label>
            <input id="user-query" name="q" defaultValue={query} maxLength={40} className={adminInputClass} />
          </div>
          <button type="submit" className={`${buttonVariants({ size: "lg" })} h-10`}>
            Найти
          </button>
        </form>
        {query && (
          <div className="mt-4">
            {!found ? (
              <p className="text-sm text-muted-foreground">В нике бывают только буквы, цифры и «_» — уточните запрос.</p>
            ) : found.failed ? (
              <p role="alert" className="text-sm text-destructive">
                Поиск не выполнен — попробуйте ещё раз
              </p>
            ) : (
              <UserRoles users={found.items} selfId={current.user.id} empty="Никого не нашлось." />
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="staff-heading" className="mt-12">
        <h2 id="staff-heading" className={headingClass}>
          Команда
        </h2>
        <div className="mt-4">
          {staff.failed ? (
            <p role="alert" className="text-sm text-destructive">
              Не удалось загрузить список — обновите страницу
            </p>
          ) : (
            <UserRoles users={staff.items} selfId={current.user.id} empty="Модераторов и администраторов пока нет." />
          )}
        </div>
      </section>

      <section aria-labelledby="log-heading" className="mt-12">
        <h2 id="log-heading" className={headingClass}>
          Журнал смены ролей
        </h2>
        <div className="mt-4">
          {log.failed ? (
            <p role="alert" className="text-sm text-destructive">
              Не удалось загрузить журнал — обновите страницу
            </p>
          ) : log.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Роли ещё не менялись.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card/60 text-sm">
              {log.items.map((item) => (
                <li key={item.id} className="flex flex-wrap gap-x-3 gap-y-1 p-4">
                  <span>
                    <span className="font-medium">@{item.target}</span>: {item.oldRole ? ROLE_LABELS[item.oldRole].toLowerCase() : "—"} →{" "}
                    {item.newRole ? ROLE_LABELS[item.newRole].toLowerCase() : "—"}
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    @{item.admin}, <time dateTime={item.createdAt}>{dateFormat.format(Date.parse(item.createdAt))}</time>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

export default function AdminUsersPage({ searchParams }: Props) {
  return (
    <AdminShell section="users" title="Пользователи" description="Назначайте модераторов и администраторов. Каждая смена роли записывается в журнал.">
      <Users searchParams={searchParams} />
    </AdminShell>
  );
}
