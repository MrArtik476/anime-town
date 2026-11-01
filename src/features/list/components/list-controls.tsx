"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { saveListEntry } from "../actions";
import { isListStatus, LIST_STATUS_LABELS, LIST_STATUSES, type ListEntry, type ListInput, SCORES } from "../model";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60";

/**
 * Статус и оценка на странице тайтла. Изменение сохраняется сразу (оптимистично):
 * при ошибке значения возвращаются к сохранённым и показывается сообщение.
 */
export function ListControls({ animeId, initial }: { animeId: number; initial: ListEntry | null }) {
  const [saved, setSaved] = useState<ListInput>({ status: initial?.status ?? null, score: initial?.score ?? null });
  const [value, setValue] = useState<ListInput>(saved);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = (next: ListInput) => {
    setValue(next);
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await saveListEntry(animeId, next);
      if (!result.ok) {
        setValue(saved);
        setError(result.message);
        return;
      }
      const stored = { status: result.entry?.status ?? null, score: result.entry?.score ?? null };
      setSaved(stored);
      setValue(stored);
      setJustSaved(true);
    });
  };

  const inList = value.status !== null || value.score !== null;

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div>
        <label htmlFor="list-status" className="mb-1.5 block text-sm font-medium">
          Мой список
        </label>
        <select
          id="list-status"
          className={selectClass}
          value={value.status ?? ""}
          onChange={(event) => save({ ...value, status: isListStatus(event.target.value) ? event.target.value : null })}
        >
          <option value="">Нет в списке</option>
          {LIST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LIST_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="list-score" className="mb-1.5 block text-sm font-medium">
          Моя оценка
        </label>
        <select
          id="list-score"
          className={selectClass}
          value={value.score ?? ""}
          onChange={(event) => save({ ...value, score: event.target.value ? Number(event.target.value) : null })}
        >
          <option value="">Без оценки</option>
          {SCORES.map((score) => (
            <option key={score} value={score}>
              {score}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-h-9 items-center justify-between gap-3">
        <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {pending ? (
            <>
              <LoaderCircle aria-hidden className="size-4 animate-spin" /> Сохраняем…
            </>
          ) : justSaved ? (
            <>
              <Check aria-hidden className="size-4 text-primary" /> Сохранено
            </>
          ) : null}
        </p>
        {inList && (
          <Button type="button" variant="ghost" size="sm" onClick={() => save({ status: null, score: null })} disabled={pending}>
            Убрать из списка
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
