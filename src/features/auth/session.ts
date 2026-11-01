import { cache } from "react";

import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

export type Profile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "user" | "moderator" | "admin";
  createdAt: string;
};

const ROLES = ["user", "moderator", "admin"] as const;

/**
 * Текущий пользователь по проверенному JWT (`getClaims`), а не по `getSession` — cookies можно подделать.
 * null — гость или Supabase не настроен. React cache: один запрос к Auth на отрисовку страницы.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!getSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string") return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

/** Профиль текущего пользователя (таблица profiles, RLS — чтение открыто). */
export const getCurrentProfile = cache(async (): Promise<{ user: CurrentUser; profile: Profile | null } | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, role, created_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error("[auth] профиль не загружен", error.message);
  if (!data) return { user, profile: null };

  return {
    user,
    profile: {
      id: data.id,
      username: data.username,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      role: ROLES.find((role) => role === data.role) ?? "user",
      createdAt: data.created_at,
    },
  };
});
