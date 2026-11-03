"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { REPORT_REASON_LABELS, REPORT_REASONS } from "@/features/comments/model";

import { dismissReports, hideComment } from "../actions";
import type { ReportGroup } from "../model";
import { BanDialog } from "./ban-dialog";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Minsk",
});

/** Открытые жалобы по комментариям. После «Скрыть» и «Отклонить жалобы» группа уходит из списка сразу. */
export function ReportList({ initial }: { initial: ReportGroup[] }) {
  const [groups, setGroups] = useState(initial);
  // Свежие данные после refresh() заменяют список без пересоздания компонента — сообщение остаётся.
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setGroups(initial);
  }
  const [notice, setNotice] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <div>
        {notice && (
          <p role="status" className="mb-2 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        <p className="text-sm text-muted-foreground">Открытых жалоб нет.</p>
      </div>
    );
  }

  return (
    <div>
      {notice && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <ol className="space-y-4">
        {groups.map((group) => (
          <li key={group.comment.id}>
            <ReportCard
              group={group}
              onResolved={(text) => {
                setGroups((current) => current.filter((item) => item.comment.id !== group.comment.id));
                setNotice(text);
              }}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReportCard({ group, onResolved }: { group: ReportGroup; onResolved: (text: string) => void }) {
  const { comment } = group;
  const router = useRouter();
  const [banning, setBanning] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const author = comment.author ? (comment.author.displayName ?? comment.author.username) : "Пользователь удалён";

  const run = (action: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onResolved(done);
      else setMessage({ text: result.message, error: true });
    });
  };

  return (
    <article aria-label={`Жалобы на комментарий ${author}`} className="rounded-xl border border-border/70 bg-card/60 p-4" aria-busy={pending}>
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">{author}</span>
        {comment.author && <span className="text-muted-foreground">@{comment.author.username}</span>}
        {comment.status === "hidden" && <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">Скрыт</span>}
        {comment.isSpoiler && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">Спойлер</span>}
        <Link href={comment.href} className="ml-auto text-primary underline-offset-4 hover:underline">
          Открыть в обсуждении
        </Link>
      </header>
      {comment.body === null ? (
        <p className="mt-2 text-sm text-muted-foreground italic">Комментарий удалён</p>
      ) : (
        <p className="mt-2 whitespace-pre-wrap break-words text-[0.95rem]">{comment.body}</p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {REPORT_REASONS.filter((reason) => group.counts[reason] > 0).map((reason) => (
          <div key={reason} className="flex gap-1">
            <dt className="text-muted-foreground">{REPORT_REASON_LABELS[reason]}:</dt>
            <dd>{group.counts[reason]}</dd>
          </div>
        ))}
        <div className="flex gap-1">
          <dt className="text-muted-foreground">Первая жалоба:</dt>
          <dd>
            <time dateTime={group.firstReportedAt}>{dateFormat.format(Date.parse(group.firstReportedAt))}</time>
          </dd>
        </div>
      </dl>
      {group.details.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {group.details.map((detail, index) => (
            <li key={index} className="break-words">
              {detail}
            </li>
          ))}
        </ul>
      )}

      {!banning && (
        <div className="mt-3 flex flex-wrap gap-2">
          {comment.status === "visible" && (
            <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => run(() => hideComment(comment.id), "Комментарий скрыт")}>
              Скрыть
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => dismissReports(comment.id), "Жалобы отклонены")}>
            Отклонить жалобы
          </Button>
          {comment.author && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setBanning(true)}>
              Забанить автора
            </Button>
          )}
        </div>
      )}
      {banning && comment.author && (
        <BanDialog
          userId={comment.author.id}
          username={comment.author.username}
          onDone={(text, error) => {
            setBanning(false);
            if (text) setMessage({ text, error });
            // Бан не перерисовывает страницу на сервере — «Действующие баны» обновляем здесь.
            if (text && !error) router.refresh();
          }}
        />
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "mt-2 text-sm text-destructive" : "mt-2 text-sm text-muted-foreground"}>
          {message.text}
        </p>
      )}
    </article>
  );
}
