"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { cn } from "@/lib/utils";

import { saveNotificationPrefs } from "../actions";
import type { NotificationPrefs } from "../model";

const SWITCHES = [
  { key: "reply", label: "Ответы на мои комментарии" },
  { key: "newEpisode", label: "Новые серии из моего списка" },
] as const;

/**
 * Блок «Уведомления» в профиле: два переключателя, изменение сохраняется сразу (saveNotificationPrefs —
 * upsert своей строки). При ошибке значение возвращается к сохранённому.
 */
export function NotificationPrefsForm({ initial }: { initial: NotificationPrefs }) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const id = useId();

  const toggle = (key: keyof NotificationPrefs) => {
    const next = { ...value, [key]: !value[key] };
    setValue(next);
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await saveNotificationPrefs(next);
      if (!result.ok) {
        setValue(saved);
        setError(result.message);
        return;
      }
      setSaved(next);
      setJustSaved(true);
    });
  };

  return (
    <div className="space-y-3" aria-busy={pending}>
      <ul className="space-y-2">
        {SWITCHES.map(({ key, label }) => {
          const on = value[key];
          return (
            <li key={key} className="flex items-center justify-between gap-4">
              <span id={`${id}-${key}`} className="text-sm">
                {label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={`${id}-${key}`}
                onClick={() => toggle(key)}
                disabled={pending}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60",
                  on ? "bg-primary" : "bg-muted-foreground/30",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-block size-5 rounded-full bg-background shadow transition-transform motion-reduce:transition-none",
                    on ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" className="flex min-h-5 items-center gap-1.5 text-sm text-muted-foreground">
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
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
