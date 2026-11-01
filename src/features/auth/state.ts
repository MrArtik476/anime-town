/** Состояние формы аккаунта между Server Action и клиентом (useActionState). */
export type FormState = {
  status: "idle" | "error" | "success";
  /** Общее сообщение над формой. */
  message?: string;
  /** Ошибки по полям: имя поля → текст. */
  fieldErrors?: Record<string, string>;
  /** Введённые значения (кроме паролей), чтобы не стирать форму после ошибки. */
  values?: Record<string, string>;
};

export const INITIAL_FORM_STATE: FormState = { status: "idle" };
