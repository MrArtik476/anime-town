"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { siteConfig } from "@/config/site";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { AVATAR_BUCKET, AVATAR_MAX_BYTES, avatarPath, checkAvatarFile } from "./avatar";
import { authErrorMessage, GENERIC_AUTH_ERROR, isUniqueViolation } from "./errors";
import { getCurrentUser } from "./session";
import type { FormState } from "./state";
import {
  escapeLike,
  field,
  rawField,
  safeNextPath,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateUsername,
} from "./validation";

// redirect() из Server Action отдаёт новую страницу целиком — шапка (UserMenu) перечитывает сессию сама.
// Без редиректа (сохранение профиля) — refresh(). revalidatePath не нужен: он сбросил бы кэш данных (AniList) всего сайта.
const NOT_CONFIGURED: FormState = { status: "error", message: "Аккаунты временно недоступны" };

type FieldErrors = Record<string, string>;

function collect(checks: Record<string, string | null>): FieldErrors | null {
  const errors = Object.fromEntries(Object.entries(checks).filter((entry): entry is [string, string] => !!entry[1]));
  return Object.keys(errors).length ? errors : null;
}

/** Адрес возврата из письма (подтверждение почты, сброс пароля): обмен кода на сессию — /auth/callback. */
function callbackUrl(next: string): string {
  const url = new URL("/auth/callback", siteConfig.url);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const password = rawField(formData, "password");
  const next = safeNextPath(field(formData, "next"));
  const values = { email };

  const fieldErrors = collect({ email: validateEmail(email), password: password ? null : "Укажите пароль" });
  if (fieldErrors) return { status: "error", fieldErrors, values };
  if (!getSupabaseEnv()) return { ...NOT_CONFIGURED, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: authErrorMessage(error), values };

  redirect(next);
}

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const username = field(formData, "username");
  const password = rawField(formData, "password");
  const values = { email, username };

  const fieldErrors = collect({
    username: validateUsername(username),
    email: validateEmail(email),
    password: validatePassword(password),
  });
  if (fieldErrors) return { status: "error", fieldErrors, values };
  if (!getSupabaseEnv()) return { ...NOT_CONFIGURED, values };

  const supabase = await createClient();
  // Ник проверяется заранее, чтобы сказать «занят», а не молча выдать запасной (триггер в базе).
  const { data: taken } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", escapeLike(username))
    .limit(1);
  if (taken?.length) return { status: "error", fieldErrors: { username: "Этот ник уже занят" }, values };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: callbackUrl("/account") },
  });
  if (error) return { status: "error", message: authErrorMessage(error), values };

  if (data.session) {
    redirect("/account");
  }
  // Включено подтверждение почты: сессии нет, пока пользователь не перейдёт по ссылке из письма.
  return {
    status: "success",
    message: `Почти готово: мы отправили письмо на ${email}. Перейдите по ссылке в нём, чтобы подтвердить почту.`,
  };
}

export async function signOut(): Promise<void> {
  if (getSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

export async function requestPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const values = { email };
  const emailError = validateEmail(email);
  if (emailError) return { status: "error", fieldErrors: { email: emailError }, values };
  if (!getSupabaseEnv()) return { ...NOT_CONFIGURED, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl("/auth/update-password"),
  });
  // Лимит писем — честно сообщаем; остальное не раскрываем, чтобы по ответу нельзя было проверить, есть ли адрес.
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return { status: "error", message: authErrorMessage(error), values };
  }
  if (error) console.error("[auth] сброс пароля", error.code ?? error.status);
  return {
    status: "success",
    message: "Если этот адрес зарегистрирован, мы отправили на него письмо со ссылкой для нового пароля.",
  };
}

export async function updatePassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const password = rawField(formData, "password");
  const confirm = rawField(formData, "confirm");
  const fieldErrors = collect({
    password: validatePassword(password),
    confirm: password === confirm ? null : "Пароли не совпадают",
  });
  if (fieldErrors) return { status: "error", fieldErrors };
  if (!getSupabaseEnv()) return NOT_CONFIGURED;

  const user = await getCurrentUser();
  if (!user) return { status: "error", message: authErrorMessage({ code: "session_not_found" }) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", message: authErrorMessage(error) };
  return { status: "success", message: "Пароль обновлён." };
}

export async function updateProfile(_previous: FormState, formData: FormData): Promise<FormState> {
  const username = field(formData, "username");
  const displayName = field(formData, "displayName");
  const values = { username, displayName };

  const fieldErrors = collect({ username: validateUsername(username), displayName: validateDisplayName(displayName) });
  if (fieldErrors) return { status: "error", fieldErrors, values };
  if (!getSupabaseEnv()) return { ...NOT_CONFIGURED, values };

  const user = await getCurrentUser();
  if (!user) return { status: "error", message: authErrorMessage({ code: "session_not_found" }), values };

  const supabase = await createClient();
  // RLS пускает только к своей строке; роль среди обновляемых колонок нет (права на уровне колонок).
  const { error } = await supabase
    .from("profiles")
    .update({ username, display_name: displayName || null })
    .eq("id", user.id);
  if (isUniqueViolation(error)) return { status: "error", fieldErrors: { username: "Этот ник уже занят" }, values };
  if (error) {
    console.error("[auth] профиль не сохранён", error.code);
    return { status: "error", message: GENERIC_AUTH_ERROR, values };
  }

  refresh();
  return { status: "success", message: "Профиль сохранён.", values };
}

export async function uploadAvatar(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!getSupabaseEnv()) return NOT_CONFIGURED;
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: authErrorMessage({ code: "session_not_found" }) };

  const file = formData.get("avatar");
  const size = file instanceof File ? file.size : 0;
  // Размер — до чтения файла в память; тип — по первым байтам.
  const bytes = file instanceof File && size > 0 && size <= AVATAR_MAX_BYTES ? new Uint8Array(await file.arrayBuffer()) : null;
  const check = checkAvatarFile(size, bytes);
  if (!check.ok) return { status: "error", fieldErrors: { avatar: check.message } };

  const supabase = await createClient();
  const path = avatarPath(user.id);
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes as Uint8Array, { contentType: check.type, upsert: true, cacheControl: "3600" });
  if (uploadError) {
    console.error("[avatar] загрузка", uploadError.message);
    return { status: "error", message: GENERIC_AUTH_ERROR };
  }

  // Новый адрес на каждую загрузку (?v=…) — браузер и CDN не покажут старую картинку.
  const publicUrl = `${supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
  if (error) {
    console.error("[avatar] профиль", error.code);
    return { status: "error", message: GENERIC_AUTH_ERROR };
  }
  refresh();
  return { status: "success", message: "Аватар обновлён." };
}

export async function removeAvatar(): Promise<FormState> {
  if (!getSupabaseEnv()) return NOT_CONFIGURED;
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: authErrorMessage({ code: "session_not_found" }) };

  const supabase = await createClient();
  const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(user.id)]);
  if (removeError) console.error("[avatar] удаление файла", removeError.message);
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) return { status: "error", message: GENERIC_AUTH_ERROR };
  refresh();
  return { status: "success", message: "Аватар удалён." };
}
