"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { hideTitle, saveTitleText, showTitle } from "../title-actions";
import { MAX_DESCRIPTION_RU, MAX_HIDE_REASON, MAX_TITLE_RU } from "../title-model";
import type { TitleState } from "../title-queries";
import { adminInputClass } from "./styles";

type Message = { text: string; error: boolean } | null;

function Notice({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
      {message.text}
    </p>
  );
}

const hintClass = "mt-1.5 text-xs text-muted-foreground";

/**
 * Ручные название и описание тайтла. Пустое поле означает «показывать автоматическое» — оно подписано под полем,
 * чтобы было видно, что окажется на сайте. Сохранение — одна запись в журнале title_actions.
 */
export function TitleTextForm({ state }: { state: TitleState }) {
  const id = useId();
  const savedTitle = state.manualTitleRu ?? "";
  const savedDescription = state.manualDescriptionRu ?? "";
  const [title, setTitle] = useState(savedTitle);
  const [description, setDescription] = useState(savedDescription);
  // Свежие данные после refresh() заменяют поля без пересоздания формы — сообщение остаётся на месте.
  const [source, setSource] = useState(`${savedTitle}\n${savedDescription}`);
  if (source !== `${savedTitle}\n${savedDescription}`) {
    setSource(`${savedTitle}\n${savedDescription}`);
    setTitle(savedTitle);
    setDescription(savedDescription);
  }
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  const changed = title.trim() !== savedTitle || description.trim() !== savedDescription;
  const hasManual = savedTitle !== "" || savedDescription !== "";

  const send = (input: { titleRu: string; descriptionRu: string }, done: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveTitleText(state.animeId, input);
      // После await обновления уже вне перехода — возвращаем их в него, чтобы сообщение появилось
      // одним кадром со свежими данными (Ошибка 40).
      startTransition(() => setMessage(result.ok ? { text: done, error: false } : { text: result.message, error: true }));
    });
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    send({ titleRu: title, descriptionRu: description }, "Сохранено — текст уже на сайте");
  };

  return (
    <form onSubmit={save} aria-label="Название и описание" aria-busy={pending} className="space-y-5 rounded-xl border border-border/70 bg-card/60 p-4 sm:p-5">
      <div>
        <label htmlFor={`${id}-title`} className="mb-1 block text-sm font-medium">
          Русское название
        </label>
        <input
          id={`${id}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_TITLE_RU}
          placeholder={state.automaticTitle ?? "Название не задано"}
          aria-describedby={`${id}-title-hint`}
          className={adminInputClass}
        />
        <p id={`${id}-title-hint`} className={hintClass}>
          {title.trim() ? "Показывается ваше название." : "Поле пустое — показывается автоматическое"}
          {state.automaticTitle && <>: «{state.automaticTitle}»</>}
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-description`} className="mb-1 block text-sm font-medium">
          Описание
        </label>
        <textarea
          id={`${id}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={MAX_DESCRIPTION_RU}
          rows={8}
          placeholder="Оставьте пустым, чтобы показывалось автоматическое описание"
          aria-describedby={`${id}-description-hint`}
          className={`${adminInputClass} h-auto min-h-40 resize-y py-2 leading-relaxed`}
        />
        <p id={`${id}-description-hint`} className={`${hintClass} flex flex-wrap justify-between gap-x-4`}>
          <span>{description.trim() ? "Показывается ваше описание, без подписи источника." : "Поле пустое — показывается автоматическое описание."}</span>
          <span className="tabular-nums">
            {description.length} / {MAX_DESCRIPTION_RU}
          </span>
        </p>
        {state.automaticDescription && (
          <details className="mt-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
            <summary className="cursor-pointer rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60">
              Автоматическое описание{state.automaticSource ? ` (${state.automaticSource})` : ""}
            </summary>
            <p className="mt-2 whitespace-pre-line break-words text-foreground/90">{state.automaticDescription}</p>
            <Button type="button" variant="ghost" size="sm" className="mt-2" disabled={pending} onClick={() => setDescription(state.automaticDescription ?? "")}>
              Взять за основу
            </Button>
          </details>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" className="h-10" disabled={pending || !changed}>
          Сохранить
        </Button>
        {hasManual && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10"
            disabled={pending}
            onClick={() => send({ titleRu: "", descriptionRu: "" }, "Возвращён автоматический текст")}
          >
            Вернуть автоматический текст
          </Button>
        )}
      </div>
      <Notice message={message} />
    </form>
  );
}

/** Видимость тайтла: скрыть с сайта (с причиной по желанию) или вернуть. */
export function TitleVisibility({ state }: { state: TitleState }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => ReturnType<typeof hideTitle>, done: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      startTransition(() => {
        if (result.ok) setReason("");
        setMessage(result.ok ? { text: done, error: false } : { text: result.message, error: true });
      });
    });
  };

  return (
    <div aria-busy={pending} className="space-y-4 rounded-xl border border-border/70 bg-card/60 p-4 sm:p-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span
          className={
            state.hidden
              ? "rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive"
              : "rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
          }
        >
          {state.hidden ? "Скрыт" : "Виден на сайте"}
        </span>
        <span className="text-muted-foreground">
          {state.hidden
            ? "Тайтла нет на главной, в каталоге и поиске; его страница и серии открываются только вам."
            : "Тайтл есть на главной, в каталоге и поиске."}
        </span>
      </p>

      {state.hidden ? (
        <Button type="button" size="lg" className="h-10" disabled={pending} onClick={() => run(() => showTitle(state.animeId), "Тайтл снова виден на сайте")}>
          Вернуть на сайт
        </Button>
      ) : (
        <form
          aria-label="Скрыть тайтл"
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => hideTitle(state.animeId, reason), "Тайтл скрыт");
          }}
        >
          <div className="min-w-0 flex-1 basis-56">
            <label htmlFor={`${id}-reason`} className="mb-1 block text-sm">
              Причина (необязательно, останется в журнале)
            </label>
            <input id={`${id}-reason`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={MAX_HIDE_REASON} className={adminInputClass} />
          </div>
          <Button type="submit" variant="destructive" size="lg" className="h-10" disabled={pending}>
            Скрыть с сайта
          </Button>
        </form>
      )}
      <p className="text-xs text-muted-foreground">
        Списки, оценки и комментарии пользователей не удаляются: в «Моём списке» скрытый тайтл отмечен «Недоступен».
      </p>
      <Notice message={message} />
    </div>
  );
}
