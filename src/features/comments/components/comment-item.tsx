"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/features/auth/components/user-avatar";
import { hideComment, restoreComment } from "@/features/moderation/actions";
import { BanDialog } from "@/features/moderation/components/ban-dialog";
import { cn } from "@/lib/utils";

import { deleteComment, editComment, reportComment } from "../actions";
import { type CommentView, formatWhen, REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason } from "../model";
import { BodyField } from "./comment-form";
import { SpoilerText } from "./spoiler-text";

export type CommentViewer = { userId: string | null; isModerator: boolean; banned: boolean };

type Mode = "view" | "edit" | "confirm-delete" | "report" | "ban";

export function CommentItem({
  comment: initial,
  viewer,
  onReply,
}: {
  comment: CommentView;
  viewer: CommentViewer;
  onReply?: (comment: CommentView) => void;
}) {
  // Правка и удаление видны сразу — и в ветках, догруженных «Показать ещё», которые refresh() не перерисует.
  const [comment, setComment] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [, startModeration] = useTransition();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        setMenuOpen(false);
        triggerRef.current?.focus();
      } else if (!menuRef.current?.contains(event.target as Node)) {
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
  // keepFocus: пункт не открывает панель, кнопка «⋯» остаётся — фокус возвращается на неё, а не теряется на <body>.
  const items: { label: string; action: () => void; keepFocus?: boolean }[] = [];
  if (visible && canWrite && onReply) items.push({ label: "Ответить", action: () => onReply(comment) });
  if (visible && own) {
    items.push({ label: "Изменить", action: () => setMode("edit") });
    items.push({ label: "Удалить", action: () => setMode("confirm-delete") });
  }
  if (visible && !own && canWrite) items.push({ label: "Пожаловаться", action: () => setMode("report") });
  if (viewer.isModerator) {
    // Действие — вставка в moderation_actions; права и допустимость проверяет база (PT422 → сообщение).
    const moderate = (run: () => Promise<{ ok: true } | { ok: false; message: string }>, status: CommentView["status"]) => {
      startModeration(async () => {
        const result = await run();
        if (result.ok) setComment((current) => ({ ...current, status }));
        else setMessage({ text: result.message, error: true });
      });
    };
    if (visible) items.push({ label: "Скрыть", action: () => moderate(() => hideComment(comment.id), "hidden"), keepFocus: true });
    if (comment.status === "hidden") items.push({ label: "Вернуть", action: () => moderate(() => restoreComment(comment.id), "visible"), keepFocus: true });
    if (comment.author && !own && comment.status !== "deleted") items.push({ label: "Забанить автора", action: () => setMode("ban") });
  }

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
                ref={triggerRef}
                variant="ghost"
                size="icon-sm"
                aria-label="Действия с комментарием"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreHorizontal aria-hidden />
              </Button>
              {menuOpen && (
                <ul id={menuId} className="absolute right-0 z-20 mt-1 min-w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {items.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setMessage(null);
                          if (item.keepFocus) triggerRef.current?.focus();
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
            <EditForm
              comment={comment}
              onCancel={() => setMode("view")}
              onSaved={(body, editedAt) => {
                setComment({ ...comment, body, editedAt: editedAt ?? new Date().toISOString() });
                setMode("view");
              }}
            />
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
            onDeleted={() => {
              setComment({ ...comment, status: "deleted", body: null, isSpoiler: false });
              setMode("view");
            }}
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
        {mode === "ban" && comment.author && (
          <BanDialog
            userId={comment.author.id}
            username={comment.author.username}
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

function EditForm({
  comment,
  onCancel,
  onSaved,
}: {
  comment: CommentView;
  onCancel: () => void;
  onSaved: (body: string, editedAt: string | null) => void;
}) {
  const id = useId();
  const [body, setBody] = useState(comment.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await editComment(comment.id, { body });
      if (result.ok) onSaved(body.trim(), result.editedAt);
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
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending || body.trim().length === 0}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}

function ConfirmDelete({
  id,
  onCancel,
  onDeleted,
  onError,
}: {
  id: number;
  onCancel: () => void;
  onDeleted: () => void;
  onError: (text: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div role="group" aria-label="Удалить комментарий?" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-sm">
      <span>Удалить комментарий?</span>
      <div className="ml-auto flex gap-2">
        {/* Меню закрылось — фокус переходит в панель, а не теряется на <body>. */}
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending} autoFocus>
          Отмена
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteComment(id);
              if (result.ok) onDeleted();
              else onError(result.message);
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
              <input type="radio" name={`${formId}-reason`} value={value} checked={reason === value} autoFocus={value === REPORT_REASONS[0]} onChange={() => setReason(value)} className="accent-primary" />
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
