"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { setUserRole } from "../actions";
import { parseRole, type Role, ROLE_LABELS, ROLES } from "../model";
import type { AdminUser } from "../queries";

function UserRow({ user, self, notify }: { user: AdminUser; self: boolean; notify: (text: string, error?: boolean) => void }) {
  const [role, setRole] = useState<Role>(user.role);
  // Свежая роль после refresh() заменяет выбор без пересоздания строки.
  const [source, setSource] = useState(user.role);
  if (source !== user.role) {
    setSource(user.role);
    setRole(user.role);
  }
  const [pending, startTransition] = useTransition();

  // Роль могли выбрать до подключения React (медленная сеть): в поле она уже стоит, а в состоянии — прежняя,
  // и кнопка «Сохранить роль» осталась бы неактивной. После подключения берём выбор из самого поля.
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const chosen = parseRole(selectRef.current?.value);
    if (chosen) setRole(chosen);
  }, []);

  const save = () => {
    startTransition(async () => {
      const result = await setUserRole(user.id, role);
      if (result.ok) notify(`@${user.username} — теперь ${ROLE_LABELS[role].toLowerCase()}`);
      else notify(result.message, true);
    });
  };

  return (
    <li aria-label={`Пользователь @${user.username}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
      <span className="font-medium">@{user.username}</span>
      {self ? (
        <span className="ml-auto text-muted-foreground">{ROLE_LABELS[user.role]} — это вы; свою роль менять нельзя</span>
      ) : (
        <span className="ml-auto flex items-center gap-2">
          <select
            ref={selectRef}
            aria-label={`Роль @${user.username}`}
            value={role}
            disabled={pending}
            onChange={(event) => setRole(event.target.value as Role)}
            className="h-9 rounded-lg border border-input bg-card px-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="lg" disabled={pending || role === user.role} onClick={save}>
            Сохранить роль
          </Button>
        </span>
      )}
    </li>
  );
}

/** Список пользователей со сменой роли. Сообщение одно на список и переживает обновление данных. */
export function UserRoles({ users, selfId, empty }: { users: AdminUser[]; selfId: string; empty: string }) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  return (
    <div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={message.error ? "mb-3 text-sm text-destructive" : "mb-3 text-sm text-muted-foreground"}>
          {message.text}
        </p>
      )}
      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card/60">
          {users.map((user) => (
            <UserRow key={user.id} user={user} self={user.id === selfId} notify={(text, error = false) => setMessage({ text, error })} />
          ))}
        </ul>
      )}
    </div>
  );
}
