"use client";

import { useActionState } from "react";

import { updateProfile } from "../actions";
import type { FormState } from "../state";
import { DISPLAY_NAME_MAX_LENGTH } from "../validation";
import { FormMessage, SubmitButton, TextField } from "./form-parts";

export function ProfileForm({ username, displayName }: { username: string; displayName: string | null }) {
  const initial: FormState = { status: "idle", values: { username, displayName: displayName ?? "" } };
  const [state, action] = useActionState(updateProfile, initial);
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage state={state} />
      <TextField
        name="username"
        label="Ник"
        autoComplete="username"
        hint="3–24 символа: буквы, цифры и «_»."
        state={state}
      />
      <TextField
        name="displayName"
        label="Имя (необязательно)"
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        state={state}
      />
      <SubmitButton pendingLabel="Сохраняем…">Сохранить</SubmitButton>
    </form>
  );
}
