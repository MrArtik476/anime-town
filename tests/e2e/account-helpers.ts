import type { Page } from "@playwright/test";

// Общие шаги E2E для аккаунтов (мок Supabase, tests/mock-supabase). Данные мока общие для всех тестов,
// поэтому у каждого теста свои почта и ник.

let counter = 0;
export function newUser(prefix = "u") {
  const id = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return { email: `${prefix}-${id}@example.com`, username: `${prefix}_${id}`.slice(0, 24), password: "Sakura-2026!" };
}

export type TestUser = ReturnType<typeof newUser>;

// Next.js 16 (Cache Components) держит прошлые страницы в DOM скрытыми (<Activity>) — getByLabel находит и их,
// поэтому поля ищем только среди видимых.
export const input = (page: Page, label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true });
export const header = (page: Page) => page.getByRole("banner");
// В <main>: у Next.js есть свой скрытый role="alert" (объявление смены маршрута).
export const alert = (page: Page) => page.getByRole("main").getByRole("alert");
export const status = (page: Page) => page.getByRole("main").getByRole("status");

export async function register(page: Page, user: TestUser) {
  await page.goto("/register");
  await input(page, "Ник").fill(user.username);
  await input(page, "Почта").fill(user.email);
  await input(page, "Пароль").fill(user.password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
}

export async function login(page: Page, email: string, password: string, path = "/login") {
  await page.goto(path);
  await input(page, "Почта").fill(email);
  await input(page, "Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}
