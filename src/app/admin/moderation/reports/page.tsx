import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { REPORT_REASON_LABELS } from "@/features/comments/model";
import { pageHref, parseReportStatus, REPORT_STATUS_LABELS, REPORT_STATUSES, type ReportStatus } from "@/features/moderation/admin-model";
import { getAllReports } from "@/features/moderation/admin-queries";
import {
  Badge,
  FilterLinks,
  ListEmpty,
  ListError,
  listClass,
  ModerationTabs,
  MoreLink,
  type Tone,
  userClass,
  When,
} from "@/features/moderation/components/admin-ui";

export const metadata: Metadata = {
  title: "Жалобы — админ-панель",
  robots: { index: false },
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const BASE = "/admin/moderation/reports";

const STATUS_TONES: Record<ReportStatus, Tone> = {
  open: "accent",
  resolved: "danger",
  dismissed: "neutral",
};
const FILTER_LABELS: Record<ReportStatus, string> = {
  open: "Открытые",
  resolved: "Принятые",
  dismissed: "Отклонённые",
};

async function Reports({ searchParams }: Props) {
  await requireAdmin();
  const params = await searchParams;
  const status = parseReportStatus(params.status);
  const reports = await getAllReports(status, typeof params.cursor === "string" ? params.cursor : null);

  return (
    <>
      <ModerationTabs current="reports" />
      <FilterLinks
        label="Статус жалоб"
        options={[
          { href: BASE, label: "Все", current: status === null },
          ...REPORT_STATUSES.map((value) => ({
            href: pageHref(BASE, { status: value }),
            label: FILTER_LABELS[value],
            current: status === value,
          })),
        ]}
      />

      <section aria-labelledby="reports-heading" className="mt-6">
        <h2 id="reports-heading" className="sr-only">
          Жалобы
        </h2>
        {reports.failed ? (
          <ListError>Не удалось загрузить жалобы — обновите страницу</ListError>
        ) : reports.items.length === 0 ? (
          <ListEmpty>{status ? "Жалоб с таким статусом нет." : "Жалоб пока не было."}</ListEmpty>
        ) : (
          <ol className={listClass}>
            {reports.items.map((report) => (
              <li key={report.id} className="space-y-2 p-4 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone={STATUS_TONES[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Badge>
                  <span>{REPORT_REASON_LABELS[report.reason]}</span>
                  <span className="text-muted-foreground">
                    от <span className={userClass}>@{report.reporter}</span>
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    <When iso={report.createdAt} />
                  </span>
                </p>
                {report.details && <p className="break-words text-muted-foreground">«{report.details}»</p>}
                <blockquote className="rounded-lg border-l-2 border-border bg-muted/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Комментарий <span className={userClass}>@{report.commentAuthor}</span>
                  </p>
                  {report.commentBody === null ? (
                    <p className="mt-1 text-muted-foreground italic">Комментарий удалён</p>
                  ) : (
                    <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words">{report.commentBody}</p>
                  )}
                </blockquote>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {report.resolvedBy && report.resolvedAt && (
                    <span>
                      Закрыл <span className={userClass}>@{report.resolvedBy}</span>, <When iso={report.resolvedAt} />
                    </span>
                  )}
                  {report.commentHref && (
                    <Link
                      href={report.commentHref}
                      className="ml-auto rounded text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
                    >
                      Открыть в обсуждении
                    </Link>
                  )}
                </p>
              </li>
            ))}
          </ol>
        )}
        {reports.nextCursor && <MoreLink href={pageHref(BASE, { status, cursor: reports.nextCursor })} />}
      </section>
    </>
  );
}

export default function AdminModerationReportsPage({ searchParams }: Props) {
  return (
    <AdminShell section="moderation" title="Модерация" description="Все жалобы на комментарии, включая закрытые: исход и кто закрыл.">
      <Reports searchParams={searchParams} />
    </AdminShell>
  );
}
