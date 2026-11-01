/**
 * Ошибки Supabase Auth → понятные сообщения на русском. Код (`error.code`) надёжнее текста:
 * https://supabase.com/docs/guides/auth/debugging/error-codes
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Неверная почта или пароль",
  email_not_confirmed: "Подтвердите почту: ссылка — в письме после регистрации",
  user_already_exists: "Этот адрес уже зарегистрирован — войдите",
  email_exists: "Этот адрес уже зарегистрирован — войдите",
  weak_password: "Пароль слишком простой — добавьте буквы разного регистра и цифры",
  same_password: "Новый пароль совпадает с текущим",
  over_email_send_rate_limit: "Слишком много писем — попробуйте через несколько минут",
  over_request_rate_limit: "Слишком много попыток — попробуйте через несколько минут",
  signup_disabled: "Регистрация временно закрыта",
  email_address_invalid: "Этот адрес почты не принимается — укажите другой",
  session_not_found: "Сессия истекла — войдите снова",
  reauthentication_needed: "Для смены пароля войдите заново",
};

export const GENERIC_AUTH_ERROR = "Не получилось — попробуйте ещё раз чуть позже";

export function authErrorMessage(error: { code?: string; status?: number } | null | undefined): string {
  if (!error) return GENERIC_AUTH_ERROR;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return MESSAGES.over_request_rate_limit;
  return GENERIC_AUTH_ERROR;
}

/** Нарушение уникальности в Postgres (ник занят). */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
