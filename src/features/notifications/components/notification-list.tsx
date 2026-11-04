"use client";

import { CheckCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { PosterImage } from "@/components/anime/poster-image";
import { Button } from "@/components/ui/button";
import { formatWhen } from "@/features/comments/model";
import { cn } from "@/lib/utils";

import { markAllRead, markRead } from "../actions";
import type { NotificationItem } from "../model";

const LOAD_FAILED = "Не удалось загрузить уведомления";

/**
 * Список уведомлений (спек §7): от новых к старым, «Показать ещё» — из GET /api/notifications. Строка —
 * настоящая ссылка: клик (и Enter) отмечает прочитанным через markRead, переход от его успеха не зависит.
 * После refresh() свежая первая страница подхватывается шаблоном «предыдущие props в state», без key —
 * сообщения не теряются.
 */
export function NotificationList({
  initial,
  initialCursor,
  unread,
}: {
  initial: NotificationItem[];
  initialCursor: string | null;
  /** Непрочитанных всего (не только на первой странице) — для кнопки «Прочитать все». */
  unread: number | null;
}) {
  const [source, setSource] = useState(initial);
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [unreadTotal, setUnreadTotal] = useState(unread);
  if (source !== initial) {
    setSource(initial);
    setItems(initial);
    setCursor(initialCursor);
    setUnreadTotal(unread);
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasUnread = (unreadTotal ?? 0) > 0 || items.some((item) => !item.read);

  const open = (item: NotificationItem) => {
    if (item.read) return;
    setItems((current) => current.map((other) => (other.id === item.id ? { ...other, read: true } : other)));
    setUnreadTotal((total) => (total === null ? null : Math.max(total - 1, 0)));
    // Не ждём: навигация идёт сразу, а запрос дойдёт до сервера и без ответа клиенту.
    void markRead(item.id);
  };

  // Пока идёт запрос — aria-disabled и ранний выход, а не disabled: так фокус клавиатуры остаётся на кнопке.
  const readAll = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await markAllRead();
      if (!result.ok) return setError(result.message);
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadTotal(0);
    });
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/notifications?${new URLSearchParams({ cursor })}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as { items: NotificationItem[]; nextCursor: string | null };
      const known = new Set(items.map((item) => item.id));
      setItems([...items, ...page.items.filter((item) => !known.has(item.id))]);
      setCursor(page.nextCursor);
    } catch {
      setError(LOAD_FAILED);
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0 && !cursor) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <p className="font-medium">Уведомлений пока нет</p>
      </div>
    );
  }

  return (
    <div>
      {hasUnread && (
        <div className="mb-4 flex justify-end">
          <Button type="button" variant="outline" size="lg" onClick={readAll} aria-disabled={pending} className="aria-disabled:opacity-60">
            {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <CheckCheck aria-hidden />}
            Прочитать все
          </Button>
        </div>
      )}
      <ol className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              data-unread={item.read ? undefined : "true"}
              onClick={() => open(item)}
              onAuxClick={(event) => event.button === 1 && open(item)}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-2.5 outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/60",
                item.read ? "border-border/70 bg-card/40" : "border-primary/40 bg-primary/10",
              )}
            >
              <div className="relative aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-md">
                <PosterImage src={item.coverUrl} color={null} alt="" sizes="44px" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", item.read ? "text-muted-foreground" : "font-medium text-foreground")}>
                  {!item.read && <span className="sr-only">Непрочитанное. </span>}
                  {item.text}
                </p>
                <p className="mt-0.5 truncate text-sm text-foreground/90">{item.title}</p>
                <time dateTime={item.createdAt} suppressHydrationWarning className="mt-0.5 block text-xs text-muted-foreground">
                  {formatWhen(item.createdAt)}
                </time>
              </div>
              {!item.read && <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-primary" />}
            </Link>
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {cursor && (
        <Button type="button" variant="outline" className="mt-6 w-full aria-disabled:opacity-60" onClick={loadMore} aria-disabled={loading}>
          {loading && <LoaderCircle aria-hidden className="animate-spin" />}
          Показать ещё
        </Button>
      )}
    </div>
  );
}
