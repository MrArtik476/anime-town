/**
 * Проверка полей форм аккаунта. Выполняется на сервере (Server Actions); те же правила —
 * в базе (check на profiles.username), поэтому обойти их запросом мимо формы нельзя.
 */

export const USERNAME_PATTERN = /^[A-Za-z0-9_А-Яа-яЁё]{3,24}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // предел bcrypt в Supabase Auth
export const DISPLAY_NAME_MAX_LENGTH = 50;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  if (!value) return "Укажите почту";
  if (value.length > 254 || !EMAIL_PATTERN.test(value)) return "Проверьте адрес почты";
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Укажите пароль";
  if (value.length < PASSWORD_MIN_LENGTH) return `Пароль — не короче ${PASSWORD_MIN_LENGTH} символов`;
  if (value.length > PASSWORD_MAX_LENGTH) return `Пароль — не длиннее ${PASSWORD_MAX_LENGTH} символов`;
  return null;
}

export function validateUsername(value: string): string | null {
  if (!value) return "Придумайте ник";
  if (!USERNAME_PATTERN.test(value)) return "Ник — 3–24 символа: буквы, цифры и «_»";
  return null;
}

export function validateDisplayName(value: string): string | null {
  return value.length > DISPLAY_NAME_MAX_LENGTH ? `Имя — не длиннее ${DISPLAY_NAME_MAX_LENGTH} символов` : null;
}

/** Строка из FormData: пробелы по краям обрезаются, отсутствующее поле — пустая строка. */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Пароль не обрезается: пробелы — его часть. */
export function rawField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Куда вернуть после входа. Только относительный путь на этом сайте — защита от open redirect
 * (`//evil.com`, `/\evil.com`, `https://…`).
 */
export function safeNextPath(value: string | null | undefined, fallback = "/account"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

/** Страницы, доступные только после входа: proxy отправляет гостя на /login?next=… */
export const PROTECTED_PATHS = ["/account", "/auth/update-password"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Экранирование для ilike: «_» и «%» в нике — обычные символы, а не шаблоны. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
