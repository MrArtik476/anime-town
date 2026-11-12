"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { unbanUser } from "../actions";
import type { BanState } from "../admin-model";
import type { BanEntry } from "../admin-queries";

import { Badge, ListEmpty, listClass, type Tone, userClass, When } from "./admin-ui";

const STATE: Record<BanState, { label: string; tone: Tone }> = {
  active: { label: "Действует", tone: "danger" },
  expired: { label: "Истёк", tone: "neutral" },
  revoked: { label: "Снят", tone: "accent" },
};

/**
 * Баны в админ-панели: действующие, истёкшие и снятые. «Снять бан» — то же действие, что на /moderation
 * (вставка unban в moderation_actions: бан снимает и записывает в журнал триггер базы).
 * Строки приходят с сервера и обновляются после refresh(); сообщение живёт здесь и переживает обновление —
 * поэтому пустой список тоже рисует этот компонент: иначе «Бан снят» пропадало бы вместе с последней строкой.
 */
export function AdminBanList({ bans, empty }: { bans: BanEntry[]; empty: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const unban = (ban: BanEntry) => {
    setMessage(null);
    setPendingId(ban.userId);
    startTransition(async () => {
      const result = await unbanUser(ban.userId);
      // После await обновления уже вне перехода: без вложенного startTransition сообщение и кнопка
      // обновились бы раньше, чем придёт свежий список (Ошибка 40).
      startTransition(() => {
        setPendingId(null);
        if (result.ok) setMessage({ text: `Бан @${ban.username} снят`, error: false });
        else {
          setMessage({ text: result.message, error: true });
          // Бан мог истечь или быть снят другим модератором — показываем актуальное состояние.
          router.refresh();
        }
      });
    });
  };

  return (
    <div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "mb-3 text-sm text-destructive" : "mb-3 text-sm text-muted-foreground"}>
          {message.text}
        </p>
      )}
      {bans.length === 0 && <ListEmpty>{empty}</ListEmpty>}
      <ul className={listClass} hidden={bans.length === 0}>
        {bans.map((ban) => (
          <li key={ban.id} aria-label={`Бан @${ban.username}`} className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4 text-sm">
            <div className="min-w-0 flex-1 basis-64 space-y-1.5">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge tone={STATE[ban.state].tone}>{STATE[ban.state].label}</Badge>
                <span className={userClass}>@{ban.username}</span>
                <span className="text-muted-foreground">
                  {ban.expiresAt ? (
                    <>
                      до <When iso={ban.expiresAt} />
                    </>
                  ) : (
                    "навсегда"
                  )}
                </span>
              </p>
              {ban.reason && <p className="break-words">{ban.reason}</p>}
              <p className="text-muted-foreground">
                Выдал @{ban.moderator}, <When iso={ban.createdAt} />
              </p>
              {ban.revokedAt && (
                <p className="text-muted-foreground">
                  Снял @{ban.revokedBy ?? "удалён"}, <When iso={ban.revokedAt} />
                </p>
              )}
            </div>
            {ban.state === "active" && (
              <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={pendingId === ban.userId} onClick={() => unban(ban)}>
                Снять бан
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
