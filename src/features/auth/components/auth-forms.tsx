"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordReset, signIn, signUp, updatePassword } from "../actions";
import { INITIAL_FORM_STATE } from "../state";
import { PASSWORD_MIN_LENGTH } from "../validation";
import { authLinkClass } from "./link-class";
import { FormMessage, SubmitButton, TextField } from "./form-parts";

// Проверка полей — на сервере (Server Actions); noValidate, чтобы ошибки выглядели одинаково и по-русски.

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, INITIAL_FORM_STATE);
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField name="email" type="email" label="Почта" autoComplete="email" inputMode="email" state={state} />
      <TextField name="password" type="password" label="Пароль" autoComplete="current-password" state={state} />
      <div className="flex justify-end">
        <Link href="/forgot-password" className={`${authLinkClass} text-sm`}>
          Забыли пароль?
        </Link>
      </div>
      <SubmitButton pendingLabel="Входим…">Войти</SubmitButton>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(signUp, INITIAL_FORM_STATE);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage state={state} />
      <TextField
        name="username"
        label="Ник"
        autoComplete="username"
        hint="3–24 символа: буквы, цифры и «_». Его увидят другие зрители."
        state={state}
      />
      <TextField name="email" type="email" label="Почта" autoComplete="email" inputMode="email" state={state} />
      <TextField
        name="password"
        type="password"
        label="Пароль"
        autoComplete="new-password"
        hint={`Не короче ${PASSWORD_MIN_LENGTH} символов.`}
        state={state}
      />
      <SubmitButton pendingLabel="Создаём аккаунт…">Создать аккаунт</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, INITIAL_FORM_STATE);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage state={state} />
      <TextField name="email" type="email" label="Почта" autoComplete="email" inputMode="email" state={state} />
      <SubmitButton pendingLabel="Отправляем…">Прислать ссылку</SubmitButton>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePassword, INITIAL_FORM_STATE);
  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <FormMessage state={state} />
        <Link href="/account" className={authLinkClass}>
          Перейти в профиль
        </Link>
      </div>
    );
  }
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage state={state} />
      <TextField
        name="password"
        type="password"
        label="Новый пароль"
        autoComplete="new-password"
        hint={`Не короче ${PASSWORD_MIN_LENGTH} символов.`}
        state={state}
      />
      <TextField name="confirm" type="password" label="Повторите пароль" autoComplete="new-password" state={state} />
      <SubmitButton pendingLabel="Сохраняем…">Сохранить пароль</SubmitButton>
    </form>
  );
}
