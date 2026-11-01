"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { removeAvatar, uploadAvatar } from "../actions";
import { AVATAR_ACCEPT } from "../avatar";
import { INITIAL_FORM_STATE } from "../state";
import { FormMessage, SubmitButton } from "./form-parts";

/** Загрузка и удаление аватара. Проверка размера и типа — на сервере (и в настройках бакета). */
export function AvatarForm({ hasAvatar }: { hasAvatar: boolean }) {
  const [state, upload] = useActionState(uploadAvatar, INITIAL_FORM_STATE);
  const [removeState, remove, removing] = useActionState(removeAvatar, INITIAL_FORM_STATE);
  const error = state.fieldErrors?.avatar;

  return (
    <div className="space-y-3">
      <form action={upload} className="space-y-3">
        <FormMessage state={state} />
        <div className="space-y-1.5">
          <label htmlFor="field-avatar" className="block text-sm font-medium">
            Аватар
          </label>
          <input
            id="field-avatar"
            name="avatar"
            type="file"
            accept={AVATAR_ACCEPT}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "field-avatar-error" : "field-avatar-hint"}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
          />
          {error ? (
            <p id="field-avatar-error" className="text-xs text-destructive">
              {error}
            </p>
          ) : (
            <p id="field-avatar-hint" className="text-xs text-muted-foreground">
              JPEG, PNG или WebP, до 1 МБ.
            </p>
          )}
        </div>
        <SubmitButton pendingLabel="Загружаем…">Загрузить аватар</SubmitButton>
      </form>
      {hasAvatar && (
        <form action={remove}>
          <Button type="submit" variant="ghost" size="sm" disabled={removing}>
            Удалить аватар
          </Button>
        </form>
      )}
      <FormMessage state={removeState} />
    </div>
  );
}
