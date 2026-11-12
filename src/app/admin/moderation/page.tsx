import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { adminInputClass } from "@/features/admin/components/styles";
import { MOD_ACTION_LABELS, MOD_ACTIONS, type ModAction, pageHref, parseLogFilters } from "@/features/moderation/admin-model";
import { getModerationLog } from "@/features/moderation/admin-queries";
import { Badge, ListEmpty, ListError, listClass, ModerationTabs, MoreLink, type Tone, userClass, When } from "@/features/moderation/components/admin-ui";
import { BAN_DURATION_LABELS } from "@/features/moderation/model";

export const metadata: Metadata = {
  title: "Журнал модерации — админ-панель",
  robots: { index: false },
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const BASE = "/admin/moderation";

const ACTION_TONES: Record<ModAction, Tone> = {
  hide: "danger",
  ban: "danger",
  restore: "accent",
  unban: "accent",
  dismiss_reports: "neutral",
};

const labelClass = "mb-1 block text-sm";

async function Log({ searchParams }: Props) {
  await requireAdmin();
  const params = await searchParams;
  const filters = parseLogFilters(params);
  const log = await getModerationLog(filters, typeof params.cursor === "string" ? params.cursor : null);
  const query = {
    moderator: filters.moderator,
    target: filters.target,
    action: filters.action,
    from: filters.fromDate,
    to: filters.toDate,
  };
  const filtered = Object.values(query).some(Boolean);

  return (
    <>
      <ModerationTabs current="log" />

      {/* Обычная GET-форма: работает без JavaScript, условия остаются в адресе. */}
      <form action={BASE} role="search" aria-label="Фильтры журнала" className="rounded-xl border border-border/70 bg-card/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="log-moderator" className={labelClass}>
              Модератор (ник)
            </label>
            <input id="log-moderator" name="moderator" defaultValue={filters.moderator ?? ""} maxLength={40} autoComplete="off" className={adminInputClass} />
          </div>
          <div>
            <label htmlFor="log-target" className={labelClass}>
              Над кем (ник)
            </label>
            <input id="log-target" name="target" defaultValue={filters.target ?? ""} maxLength={40} autoComplete="off" className={adminInputClass} />
          </div>
          <div>
            <label htmlFor="log-action" className={labelClass}>
              Действие
            </label>
            <select id="log-action" name="action" defaultValue={filters.action ?? ""} className={adminInputClass}>
              <option value="">Любое</option>
              {MOD_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {MOD_ACTION_LABELS[action]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="log-from" className={labelClass}>
              С даты
            </label>
            <input id="log-from" name="from" type="date" defaultValue={filters.fromDate} className={adminInputClass} />
          </div>
          <div>
            <label htmlFor="log-to" className={labelClass}>
              По дату (включительно)
            </label>
            <input id="log-to" name="to" type="date" defaultValue={filters.toDate} className={adminInputClass} />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className={`${buttonVariants({ size: "lg" })} h-10 flex-1`}>
              Показать
            </button>
            {filtered && (
              <Link href={BASE} className={`${buttonVariants({ variant: "outline", size: "lg" })} h-10`}>
                Сбросить
              </Link>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Ник — целиком, без учёта регистра. Сутки считаются по минскому времени.</p>
      </form>

      <section aria-labelledby="log-heading" className="mt-8">
        <h2 id="log-heading" className="sr-only">
          Действия модераторов
        </h2>
        {log.failed ? (
          <ListError>Не удалось загрузить журнал — обновите страницу</ListError>
        ) : log.unknownUser ? (
          <ListEmpty>Пользователь @{log.unknownUser} не найден — проверьте ник.</ListEmpty>
        ) : log.items.length === 0 ? (
          <ListEmpty>{filtered ? "По этим условиям действий нет." : "Модераторы ещё ничего не делали."}</ListEmpty>
        ) : (
          <ol className={listClass}>
            {log.items.map((entry) => (
              <li key={entry.id} className="space-y-1.5 p-4 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone={ACTION_TONES[entry.action]}>{MOD_ACTION_LABELS[entry.action]}</Badge>
                  <span className={userClass}>@{entry.moderator}</span>
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <span className="sr-only">над</span>
                  <span className={userClass}>@{entry.target}</span>
                  {entry.banDuration && <span className="text-muted-foreground">· {BAN_DURATION_LABELS[entry.banDuration].toLowerCase()}</span>}
                  <span className="ml-auto text-muted-foreground">
                    <When iso={entry.createdAt} />
                  </span>
                </p>
                {entry.reason && (
                  <p className="break-words">
                    <span className="text-muted-foreground">Причина:</span> {entry.reason}
                  </p>
                )}
                {entry.commentHref && (
                  <p>
                    <Link
                      href={entry.commentHref}
                      className="rounded text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
                    >
                      Открыть комментарий
                    </Link>
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        {log.nextCursor && <MoreLink href={pageHref(BASE, { ...query, cursor: log.nextCursor })} />}
      </section>
    </>
  );
}

export default function AdminModerationLogPage({ searchParams }: Props) {
  return (
    <AdminShell section="moderation" title="Модерация" description="Журнал действий модераторов: кто, что, над кем и когда.">
      <Log searchParams={searchParams} />
    </AdminShell>
  );
}
