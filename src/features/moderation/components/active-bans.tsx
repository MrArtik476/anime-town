"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { unbanUser } from "../actions";
import type { ActiveBan } from "../model";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Minsk",
});

/** «Действующие баны» с кнопкой «Снять бан» (действие unban пишется в журнал). */
export function ActiveBans({ initial }: { initial: ActiveBan[] }) {
  const [bans, setBans] = useState(initial);
  // Свежие данные после refresh() заменяют список без пересоздания компонента — сообщение остаётся.
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setBans(initial);
  }
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const unban = (ban: ActiveBan) => {
    setMessage(null);
    setPendingId(ban.userId);
    startTransition(async () => {
      const result = await unbanUser(ban.userId);
      setPendingId(null);
      if (result.ok) {
        setBans((current) => current.filter((item) => item.userId !== ban.userId));
        setMessage({ text: `Бан @${ban.username} снят`, error: false });
      } else setMessage({ text: result.message, error: true });
    });
  };

  return (
    <div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "mb-3 text-sm text-destructive" : "mb-3 text-sm text-muted-foreground"}>
          {message.text}
        </p>
      )}
      {bans.length === 0 ? (
        <p className="text-sm text-muted-foreground">Действующих банов нет.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card/60">
          {bans.map((ban) => (
            <li key={ban.userId} aria-label={`Бан @${ban.username}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
              <span className="font-medium">@{ban.username}</span>
              <span className="text-muted-foreground">
                {ban.expiresAt ? (
                  <>
                    до <time dateTime={ban.expiresAt}>{dateFormat.format(Date.parse(ban.expiresAt))}</time>
                  </>
                ) : (
                  "навсегда"
                )}
              </span>
              {ban.reason && <span className="min-w-0 break-words text-muted-foreground">{ban.reason}</span>}
              <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={pendingId === ban.userId} onClick={() => unban(ban)}>
                Снять бан
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
