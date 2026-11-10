"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { LICENSE_STATUSES, type LicenseStatus } from "@/features/player/source";

import { deleteEpisode, deleteSubtitle, saveEpisode, saveSubtitle } from "../actions";
import { durationToInput, LICENSE_LABELS, MAX_ATTRIBUTION, MAX_LABEL, MAX_TITLE } from "../model";
import type { AdminEpisode, AdminSubtitle } from "../queries";
import { adminInputClass } from "./styles";

type Notify = (text: string, error?: boolean) => void;
type Result = { ok: true } | { ok: false; message: string };

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string, hintId?: string) => React.ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
      </label>
      {children(id, hintId)}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Общая отправка формы: ошибка остаётся в форме (введённое не теряется), успех уходит наверх. */
function useSubmit(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = (run: () => Promise<Result>) => {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (result.ok) onDone();
      else setError(result.message);
    });
  };
  return { error, pending, submit };
}

function EpisodeForm({
  animeId,
  episode,
  nextNumber,
  onSaved,
  onCancel,
}: {
  animeId: number;
  episode: AdminEpisode | null;
  nextNumber: number;
  onSaved: (number: string) => void;
  onCancel: () => void;
}) {
  const [number, setNumber] = useState(String(episode?.number ?? nextNumber));
  const [title, setTitle] = useState(episode?.title ?? "");
  const [duration, setDuration] = useState(durationToInput(episode?.durationSec ?? null));
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>(episode?.licenseStatus ?? "none");
  const [hlsUrl, setHlsUrl] = useState(episode?.hlsUrl ?? "");
  const [attribution, setAttribution] = useState(episode?.attribution ?? "");
  const [attributionUrl, setAttributionUrl] = useState(episode?.attributionUrl ?? "");
  const { error, pending, submit } = useSubmit(() => onSaved(number.trim()));

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    submit(() => saveEpisode(animeId, episode?.id ?? null, { number, title, duration, licenseStatus, hlsUrl, attribution, attributionUrl }));
  };

  return (
    <form
      onSubmit={send}
      aria-label={episode ? `Изменить серию ${episode.number}` : "Новая серия"}
      aria-busy={pending}
      className="space-y-4 rounded-xl border border-border/70 bg-muted/40 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-[7rem_1fr_9rem]">
        <Field label="Номер">
          {(id) => <input id={id} inputMode="numeric" required value={number} onChange={(event) => setNumber(event.target.value)} className={adminInputClass} />}
        </Field>
        <Field label="Название (необязательно)">
          {(id) => <input id={id} value={title} maxLength={MAX_TITLE} onChange={(event) => setTitle(event.target.value)} className={adminInputClass} />}
        </Field>
        <Field label="Длительность">
          {(id) => <input id={id} value={duration} placeholder="24:10" onChange={(event) => setDuration(event.target.value)} className={adminInputClass} />}
        </Field>
      </div>
      <Field label="Адрес видео" hint="Плейлист HLS (.m3u8): https://… или /media/… Только видео, на которое есть права.">
        {(id, hintId) => (
          <input
            id={id}
            required
            value={hlsUrl}
            placeholder="https://cdn.example.com/title/01/master.m3u8"
            aria-describedby={hintId}
            onChange={(event) => setHlsUrl(event.target.value)}
            className={adminInputClass}
          />
        )}
      </Field>
      <Field label="Статус прав" hint="Черновик не виден посетителям. Остальные статусы публикуют серию.">
        {(id, hintId) => (
          <select
            id={id}
            value={licenseStatus}
            aria-describedby={hintId}
            onChange={(event) => setLicenseStatus(event.target.value as LicenseStatus)}
            className={adminInputClass}
          >
            {LICENSE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LICENSE_LABELS[status]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={licenseStatus === "open_license" ? "Атрибуция" : "Атрибуция (необязательно)"} hint="Автор и лицензия — показываются под плеером.">
          {(id, hintId) => (
            <input
              id={id}
              value={attribution}
              maxLength={MAX_ATTRIBUTION}
              required={licenseStatus === "open_license"}
              aria-describedby={hintId}
              onChange={(event) => setAttribution(event.target.value)}
              className={adminInputClass}
            />
          )}
        </Field>
        <Field label="Ссылка на источник (необязательно)">
          {(id) => (
            <input id={id} value={attributionUrl} placeholder="https://…" onChange={(event) => setAttributionUrl(event.target.value)} className={adminInputClass} />
          )}
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {episode ? "Сохранить серию" : "Добавить серию"}
        </Button>
      </div>
    </form>
  );
}

function SubtitleForm({
  animeId,
  episode,
  subtitle,
  onSaved,
  onCancel,
}: {
  animeId: number;
  episode: AdminEpisode;
  subtitle: AdminSubtitle | null;
  onSaved: (lang: string) => void;
  onCancel: () => void;
}) {
  const [lang, setLang] = useState(subtitle?.lang ?? "ru");
  const [label, setLabel] = useState(subtitle?.label ?? "Русские");
  const [url, setUrl] = useState(subtitle?.url ?? "");
  const [isDefault, setIsDefault] = useState(subtitle?.isDefault ?? episode.subtitles.length === 0);
  const { error, pending, submit } = useSubmit(() => onSaved(lang.trim()));

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    submit(() => saveSubtitle(animeId, episode.id, subtitle?.id ?? null, { lang, label, url, isDefault }));
  };

  return (
    <form
      onSubmit={send}
      aria-label={subtitle ? `Изменить субтитры ${subtitle.lang} серии ${episode.number}` : `Новые субтитры серии ${episode.number}`}
      aria-busy={pending}
      className="mt-3 space-y-3 rounded-lg border border-border/70 bg-muted/40 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
        <Field label="Язык">
          {(id) => <input id={id} required value={lang} placeholder="ru" onChange={(event) => setLang(event.target.value)} className={adminInputClass} />}
        </Field>
        <Field label="Подпись в плеере">
          {(id) => <input id={id} required value={label} maxLength={MAX_LABEL} onChange={(event) => setLabel(event.target.value)} className={adminInputClass} />}
        </Field>
      </div>
      <Field label="Адрес файла субтитров" hint="Файл WebVTT (.vtt): https://… или /media/…">
        {(id, hintId) => (
          <input id={id} required value={url} aria-describedby={hintId} onChange={(event) => setUrl(event.target.value)} className={adminInputClass} />
        )}
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} className="size-4 accent-primary" />
        Включать по умолчанию
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Отмена
        </Button>
        <Button type="submit" disabled={pending}>
          {subtitle ? "Сохранить субтитры" : "Добавить субтитры"}
        </Button>
      </div>
    </form>
  );
}

type Open =
  | { kind: "edit"; episodeId: number }
  | { kind: "delete"; episodeId: number }
  | { kind: "subtitle"; episodeId: number; subtitleId: number | null }
  | { kind: "create" }
  | null;

function EpisodeItem({
  animeId,
  episode,
  open,
  setOpen,
  notify,
}: {
  animeId: number;
  episode: AdminEpisode;
  open: Open;
  setOpen: (open: Open) => void;
  notify: Notify;
}) {
  const [pending, startTransition] = useTransition();
  const mine = open && "episodeId" in open && open.episodeId === episode.id ? open : null;
  const draft = episode.licenseStatus === "none";

  const run = (action: () => Promise<Result>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setOpen(null);
        notify(done);
      } else notify(result.message, true);
    });
  };

  if (mine?.kind === "edit") {
    return (
      <li aria-label={`Серия ${episode.number}`} className="p-4">
        <EpisodeForm
          animeId={animeId}
          episode={episode}
          nextNumber={episode.number}
          onCancel={() => setOpen(null)}
          onSaved={(number) => {
            setOpen(null);
            notify(`Серия ${number} сохранена`);
          }}
        />
      </li>
    );
  }

  return (
    <li aria-label={`Серия ${episode.number}`} className="p-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-medium">Серия {episode.number}</span>
        {episode.title && <span className="min-w-0 break-words text-muted-foreground">{episode.title}</span>}
        <span
          className={
            draft
              ? "rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
              : "rounded-md bg-primary/15 px-2 py-0.5 text-xs text-foreground"
          }
        >
          {draft ? "Черновик" : LICENSE_LABELS[episode.licenseStatus]}
        </span>
        {episode.durationSec && <span className="text-sm text-muted-foreground tabular-nums">{durationToInput(episode.durationSec)}</span>}
        <span className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen({ kind: "edit", episodeId: episode.id })}>
            Изменить
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setOpen({ kind: "delete", episodeId: episode.id })}>
            Удалить
          </Button>
        </span>
      </div>
      <p className="mt-1 text-xs break-all text-muted-foreground">{episode.hlsUrl}</p>

      {mine?.kind === "delete" && (
        <div role="group" aria-label={`Удаление серии ${episode.number}`} className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p>Удалить серию {episode.number}? Вместе с ней удалятся её субтитры, комментарии и прогресс просмотра. Вернуть не получится.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" autoFocus onClick={() => setOpen(null)} disabled={pending}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteEpisode(animeId, episode.id), `Серия ${episode.number} удалена`)}
            >
              Удалить серию
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">Субтитры</h3>
          {episode.subtitles.length === 0 && <span className="text-sm text-muted-foreground">нет</span>}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setOpen({ kind: "subtitle", episodeId: episode.id, subtitleId: null })}
          >
            Добавить субтитры
          </Button>
        </div>
        {episode.subtitles.length > 0 && (
          <ul className="mt-2 space-y-1.5 text-sm">
            {episode.subtitles.map((subtitle) => (
              <li key={subtitle.id} aria-label={`Субтитры ${subtitle.lang}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs">{subtitle.lang}</span>
                <span>{subtitle.label}</span>
                {subtitle.isDefault && <span className="text-xs text-muted-foreground">по умолчанию</span>}
                <span className="ml-auto flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Изменить субтитры ${subtitle.lang}`}
                    onClick={() => setOpen({ kind: "subtitle", episodeId: episode.id, subtitleId: subtitle.id })}
                  >
                    Изменить
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Удалить субтитры ${subtitle.lang}`}
                    disabled={pending}
                    onClick={() => run(() => deleteSubtitle(animeId, episode.id, subtitle.id), `Субтитры ${subtitle.lang} удалены`)}
                  >
                    Удалить
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {mine?.kind === "subtitle" && (
          <SubtitleForm
            key={mine.subtitleId ?? "new"}
            animeId={animeId}
            episode={episode}
            subtitle={episode.subtitles.find((subtitle) => subtitle.id === mine.subtitleId) ?? null}
            onCancel={() => setOpen(null)}
            onSaved={(lang) => {
              setOpen(null);
              notify(`Субтитры ${lang} сохранены`);
            }}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Серии тайтла: добавить, изменить, удалить, субтитры. Список рисуется прямо из props —
 * после действия сервер присылает свежие данные (refresh()), а сообщение и открытая форма живут здесь.
 */
export function EpisodeManager({ animeId, episodes }: { animeId: number; episodes: AdminEpisode[] }) {
  const [open, setOpen] = useState<Open>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const notify: Notify = (text, error = false) => setMessage({ text, error });
  const change = (next: Open) => {
    if (next) setMessage(null);
    setOpen(next);
  };
  const nextNumber = episodes.reduce((max, episode) => Math.max(max, episode.number), 0) + 1;

  return (
    <div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "mb-4 text-sm text-destructive" : "mb-4 text-sm text-muted-foreground"}>
          {message.text}
        </p>
      )}
      {episodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">У этого тайтла пока нет серий.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card/60">
          {episodes.map((episode) => (
            <EpisodeItem key={episode.id} animeId={animeId} episode={episode} open={open} setOpen={change} notify={notify} />
          ))}
        </ul>
      )}
      <div className="mt-6">
        {open?.kind === "create" ? (
          <EpisodeForm
            animeId={animeId}
            episode={null}
            nextNumber={nextNumber}
            onCancel={() => setOpen(null)}
            onSaved={(number) => {
              setOpen(null);
              notify(`Серия ${number} добавлена`);
            }}
          />
        ) : (
          <Button type="button" size="lg" onClick={() => change({ kind: "create" })}>
            Добавить серию
          </Button>
        )}
      </div>
    </div>
  );
}
