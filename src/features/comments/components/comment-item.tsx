"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/features/auth/components/user-avatar";
import { cn } from "@/lib/utils";

import { deleteComment, editComment, reportComment } from "../actions";
import { type CommentView, REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason } from "../model";
import { BodyField } from "./comment-form";
import { SpoilerText } from "./spoiler-text";

export type CommentViewer = { userId: string | null; isModerator: boolean; banned: boolean };

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Minsk",
});

/** «5 минут назад» до суток, дальше — дата. Время сервера и браузера может разойтись — без предупреждения гидратации. */
function formatWhen(iso: string): string {
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  const relative = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
  if (diff < 60) return "только что";
  if (diff < 3600) return relative.format(-Math.floor(diff / 60), "minute");
  if (diff < 86_400) return relative.format(-Math.floor(diff / 3600), "hour");
  return dateFormat.format(Date.parse(iso));
}

type Mode = "view" | "edit" | "confirm-delete" | "report";

export function CommentItem({
  comment,
  viewer,
  onReply,
}: {
  comment: CommentView;
  viewer: CommentViewer;
  onReply?: (comment: CommentView) => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const own = viewer.userId !== null && comment.author?.id === viewer.userId;
  const visible = comment.status === "visible";
  const canWrite = viewer.userId !== null && !viewer.banned;
  const items: { label: string; action: () => void }[] = [];
  if (visible && canWrite && onReply) items.push({ label: "Ответить", action: () => onReply(comment) });
  if (visible && own) {
    items.push({ label: "Изменить", action: () => setMode("edit") });
    items.push({ label: "Удалить", action: () => setMode("confirm-delete") });
  }
  if (visible && !own && canWrite) items.push({ label: "Пожаловаться", action: () => setMode("report") });

  const name = comment.author ? (comment.author.displayName ?? comment.author.username) : "Пользователь удалён";

  return (
    <article id={`comment-${comment.id}`} className="flex scroll-mt-24 gap-3" aria-label={`Комментарий ${name}`}>
      <UserAvatar url={comment.author?.avatarUrl ?? null} name={comment.author?.username ?? "?"} size={36} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="font-medium">{name}</span>
          {comment.author && comment.author.displayName && <span className="text-muted-foreground">@{comment.author.username}</span>}
          <time dateTime={comment.createdAt} suppressHydrationWarning className="text-xs text-muted-foreground">
            {formatWhen(comment.createdAt)}
          </time>
          {comment.editedAt && visible && <span className="text-xs text-muted-foreground">изменён</span>}
          {comment.status === "hidden" && (
            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">Скрыт</span>
          )}
          {items.length > 0 && mode === "view" && (
            <div ref={menuRef} className="relative ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Действия с комментарием"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreHorizontal aria-hidden />
              </Button>
              {menuOpen && (
                <ul id={menuId} role="menu" className="absolute right-0 z-20 mt-1 min-w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {items.map((item) => (
                    <li key={item.label} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          setMessage(null);
                          item.action();
                        }}
                        className="w-full rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </header>

        <div className="mt-1 text-[0.95rem] leading-relaxed">
          {comment.status === "deleted" || comment.body === null ? (
            <p className="text-muted-foreground italic">Комментарий удалён</p>
          ) : mode === "edit" ? (
            <EditForm comment={comment} onDone={() => setMode("view")} />
          ) : (
            <>
              {comment.replyTo && <span className="mr-1 font-medium text-primary">@{comment.replyTo.username}</span>}
              {comment.isSpoiler ? <SpoilerText text={comment.body} /> : <p className="inline whitespace-pre-wrap break-words">{comment.body}</p>}
            </>
          )}
        </div>

        {mode === "confirm-delete" && (
          <ConfirmDelete
            id={comment.id}
            onCancel={() => setMode("view")}
            onError={(text) => {
              setMode("view");
              setMessage({ text, error: true });
            }}
          />
        )}
        {mode === "report" && (
          <ReportForm
            id={comment.id}
            onDone={(text, error) => {
              setMode("view");
              if (text) setMessage({ text, error });
            }}
          />
        )}
        {message && (
          <p role={message.error ? "alert" : "status"} className={cn("mt-2 text-sm", message.error ? "text-destructive" : "text-muted-foreground")}>
            {message.text}
          </p>
        )}
      </div>
    </article>
  );
}

function EditForm({ comment, onDone }: { comment: CommentView; onDone: () => void }) {
  const id = useId();
  const [body, setBody] = useState(comment.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await editComment(comment.id, { body });
      if (result.ok) onDone();
      else setError(result.message);
    });
  };
  return (
    <form onSubmit={save} className="space-y-2" aria-busy={pending}>
      <BodyField id={`${id}-edit`} label="Текст комментария" value={body} onChange={setBody} disabled={pending} autoFocus />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending || body.trim().length === 0}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}

function ConfirmDelete({ id, onCancel, onError }: { id: number; onCancel: () => void; onError: (text: string) => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div role="group" aria-label="Удалить комментарий?" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-sm">
      <span>Удалить комментарий?</span>
      <div className="ml-auto flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Отмена
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteComment(id);
              if (!result.ok) onError(result.message);
            })
          }
        >
          Удалить
        </Button>
      </div>
    </div>
  );
}

function ReportForm({ id, onDone }: { id: number; onDone: (text: string | null, error: boolean) => void }) {
  const formId = useId();
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();
  const send = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await reportComment(id, { reason, details: details.trim() || undefined });
      onDone(result.ok ? "Жалоба отправлена" : result.message, !result.ok);
    });
  };
  return (
    <form onSubmit={send} aria-label="Жалоба" className="mt-2 space-y-3 rounded-lg border border-border/70 bg-muted/40 p-3 text-sm" aria-busy={pending}>
      <fieldset>
        <legend className="mb-2 font-medium">Причина жалобы</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {REPORT_REASONS.map((value) => (
            <label key={value} className="inline-flex items-center gap-2">
              <input type="radio" name={`${formId}-reason`} value={value} checked={reason === value} onChange={() => setReason(value)} className="accent-primary" />
              {REPORT_REASON_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${formId}-details`} className="mb-1 block">
          Пояснение (необязательно)
        </label>
        <input
          id={`${formId}-details`}
          value={details}
          maxLength={500}
          onChange={(event) => setDetails(event.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-card px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onDone(null, false)} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending}>
          Отправить жалобу
        </Button>
      </div>
    </form>
  );
}
