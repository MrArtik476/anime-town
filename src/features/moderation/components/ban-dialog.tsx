"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { banUser } from "../actions";
import { BAN_DURATION_LABELS, BAN_DURATIONS, type BanDuration, MAX_REASON } from "../model";

/** Встроенная панель «Забанить автора»: срок и необязательная причина. Фокус сразу на первом сроке. */
export function BanDialog({
  userId,
  username,
  onDone,
}: {
  userId: string;
  username: string;
  /** text — итог для пользователя (null — отмена), error — ошибка ли это. */
  onDone: (text: string | null, error: boolean) => void;
}) {
  const formId = useId();
  const [duration, setDuration] = useState<BanDuration>("1d");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const send = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await banUser(userId, duration, reason.trim() || undefined);
      onDone(result.ok ? `@${username} заблокирован` : result.message, !result.ok);
    });
  };
  return (
    <form
      onSubmit={send}
      aria-label={`Забанить @${username}`}
      className="mt-2 space-y-3 rounded-lg border border-border/70 bg-muted/40 p-3 text-sm"
      aria-busy={pending}
    >
      <fieldset>
        <legend className="mb-2 font-medium">Срок бана для @{username}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {BAN_DURATIONS.map((value) => (
            <label key={value} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`${formId}-duration`}
                value={value}
                checked={duration === value}
                autoFocus={value === BAN_DURATIONS[0]}
                onChange={() => setDuration(value)}
                className="accent-primary"
              />
              {BAN_DURATION_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${formId}-reason`} className="mb-1 block">
          Причина (необязательно)
        </label>
        <input
          id={`${formId}-reason`}
          value={reason}
          maxLength={MAX_REASON}
          onChange={(event) => setReason(event.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-card px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onDone(null, false)} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          Забанить
        </Button>
      </div>
    </form>
  );
}
