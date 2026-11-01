"use client";

import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { FormState } from "../state";

/** Общее сообщение формы: ошибка — role="alert", успех — role="status". */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  const error = state.status === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3.5 py-3 text-sm",
        error ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10 text-foreground",
      )}
    >
      {state.message}
    </p>
  );
}

type TextFieldProps = Omit<ComponentProps<"input">, "id" | "name" | "defaultValue"> & {
  name: string;
  label: string;
  hint?: ReactNode;
  state: FormState;
};

/** Поле с подписью, подсказкой и ошибкой; значение после ошибки восстанавливается (кроме паролей). */
export function TextField({ name, label, hint, state, type = "text", className, ...props }: TextFieldProps) {
  const id = `field-${name}`;
  const error = state.fieldErrors?.[name];
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={type === "password" ? undefined : state.values?.[name]}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-11 w-full rounded-lg border border-input bg-card px-3.5 text-base outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          className,
        )}
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Кнопка отправки: на время запроса блокируется и показывает индикатор. */
export function SubmitButton({ children, pendingLabel }: { children: ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <LoaderCircle aria-hidden className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
