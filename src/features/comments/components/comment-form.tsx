"use client";

import { LoaderCircle } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { createComment } from "../actions";
import { type CommentTarget, type CommentView, MAX_BODY } from "../model";

export const textareaClass =
  "block w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60";

/** Поле со счётчиком «N / 2000». Длина считается как в базе — по символам после обрезки пробелов. */
export function BodyField({
  id,
  label,
  value,
  onChange,
  disabled,
  autoFocus,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  rows?: number;
}) {
  const length = value.trim().length;
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={MAX_BODY + 200}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={label}
        aria-describedby={`${id}-count`}
        onChange={(event) => onChange(event.target.value)}
        className={textareaClass}
      />
      <p id={`${id}-count`} className={cn("mt-1 text-right text-xs", length > MAX_BODY ? "text-destructive" : "text-muted-foreground")}>
        {length} / {MAX_BODY}
      </p>
    </div>
  );
}

/** Новый комментарий или ответ (replyTo — комментарий, на который отвечают). */
export function CommentForm({
  target,
  replyTo,
  onDone,
  onCreated,
  autoFocus,
}: {
  target: CommentTarget;
  replyTo?: { id: number; username: string | null };
  onDone?: () => void;
  /** Созданный комментарий — показать сразу, не дожидаясь обновления страницы. */
  onCreated?: (comment: CommentView) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tooLong = body.trim().length > MAX_BODY;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createComment(target, { body, isSpoiler: spoiler, replyToCommentId: replyTo?.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBody("");
      setSpoiler(false);
      if (result.comment) onCreated?.(result.comment);
      onDone?.();
    });
  };

  const label = replyTo ? `Ответ${replyTo.username ? ` @${replyTo.username}` : ""}` : "Комментарий";

  return (
    <form onSubmit={submit} className="space-y-2" aria-busy={pending}>
      <BodyField id={`${id}-body`} label={label} value={body} onChange={setBody} disabled={pending} autoFocus={autoFocus} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={spoiler}
            disabled={pending}
            onChange={(event) => setSpoiler(event.target.checked)}
            className="size-4 accent-primary"
          />
          Спойлер
        </label>
        <div className="ml-auto flex gap-2">
          {onDone && replyTo && (
            <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
              Отмена
            </Button>
          )}
          <Button type="submit" disabled={pending || tooLong || body.trim().length === 0}>
            {pending && <LoaderCircle aria-hidden className="animate-spin" />}
            Отправить
          </Button>
        </div>
      </div>
    </form>
  );
}
