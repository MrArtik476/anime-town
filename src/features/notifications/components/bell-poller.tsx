"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { badgeLabel } from "../model";

const COUNT_URL = "/api/notifications/unread-count";
const POLL_MS = 60_000;

/**
 * Колокольчик в шапке (спек §7). Начальный счётчик — с сервера; дальше — GET /api/notifications/unread-count
 * раз в 60 с и при смене pathname, только на видимой вкладке: по `visibilitychange` → hidden интервал снимается,
 * по возврату — сразу один запрос и новый интервал. Без aria-live: число озвучивается в aria-label ссылки,
 * опрос не перебивает чтение страницы.
 */
export function BellPoller({ initial }: { initial: { count: number | null } }) {
  const [count, setCount] = useState(initial.count);
  // Каждый серверный рендер (refresh() после markRead / «Прочитать все», переход) приносит новый объект initial —
  // его значение заменяет опрошенное, даже если число то же («предыдущие props в state», сравнение по ссылке).
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setCount(initial.count);
  }
  const pathname = usePathname();

  // Номер последнего запроса: ответ применяется, только если после его отправки не было ни нового запроса,
  // ни нового серверного счётчика — иначе ответ, начатый до записи markRead, перетёр бы свежее значение.
  const latest = useRef(0);
  // Layout-эффект — синхронно при коммите, раньше любого ответа fetch.
  useLayoutEffect(() => {
    latest.current += 1;
  }, [initial]);

  const load = useCallback(async () => {
    const id = (latest.current += 1);
    try {
      const response = await fetch(COUNT_URL, { cache: "no-store" });
      if (!response.ok) return; // 401 (сессия кончилась) или сбой — остаётся последний известный счётчик
      const body: unknown = await response.json();
      const value = typeof body === "object" && body !== null ? (body as { count?: unknown }).count : undefined;
      if (typeof value === "number" && id === latest.current) setCount(value);
    } catch {
      // сеть недоступна — следующий опрос попробует снова
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      timer ??= setInterval(() => void load(), POLL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      stop();
      if (document.visibilityState !== "visible") return;
      void load();
      start();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  // Смена pathname (и повторный показ страницы из кэша маршрутизатора) — запрос, если вкладка видима.
  // Первый показ — без запроса: счётчик только что пришёл с сервера.
  const shownPath = useRef<string | null>(null);
  useEffect(() => {
    const first = shownPath.current === null;
    shownPath.current = pathname;
    if (!first && document.visibilityState === "visible") void load();
  }, [pathname, load]);

  const badge = badgeLabel(count ?? 0);
  return (
    <Link
      href="/notifications"
      aria-label={`Уведомления: ${badge ?? "0"} непрочитанных`}
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <Bell aria-hidden className="size-5" />
      {badge && (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold text-primary-foreground tabular-nums"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
