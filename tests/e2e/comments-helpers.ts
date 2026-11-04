import type { Browser, Page } from "@playwright/test";

import { input, login, newUser, register, type TestUser } from "./account-helpers";
import { expect, routeImages, uniqueClientIp } from "./fixtures";

// Общие шаги E2E комментариев и модерации (мок Supabase). Данные мока общие — у каждого теста свои тексты и ники.

export const unique = () => Math.random().toString(36).slice(2, 8);
export const discussion = (page: Page) => page.getByRole("region", { name: /^Обсуждение/ });
export const comment = (page: Page, text: string) => discussion(page).getByRole("article").filter({ hasText: text }).last();

export async function post(page: Page, text: string, { spoiler = false } = {}) {
  const field = input(page, "Комментарий");
  await expect(field).toBeVisible();
  await field.fill(text);
  if (spoiler) await discussion(page).getByLabel("Спойлер").first().check();
  await discussion(page).getByRole("button", { name: "Отправить", exact: true }).first().click();
}

export async function menu(page: Page, text: string, item: string) {
  const target = comment(page, text);
  const button = target.getByRole("button", { name: "Действия с комментарием" }).first();
  await expect(button).toBeVisible();
  await button.click();
  await target.getByRole("button", { name: item, exact: true }).click();
}

export async function reply(page: Page, to: string, username: string, text: string) {
  await menu(page, to, "Ответить");
  const field = input(page, `Ответ @${username}`);
  await expect(field).toBeVisible();
  await field.fill(text);
  await field.locator("xpath=ancestor::form").getByRole("button", { name: "Отправить" }).click();
}

/** Второй пользователь — в своём контексте браузера (свои cookies). */
export async function secondUser(browser: Browser, prefix: string): Promise<{ page: Page; user: TestUser; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(99) } });
  const page = await context.newPage();
  await routeImages(page);
  const user = newUser(prefix);
  await register(page, user);
  await expect(page).toHaveURL(/\/account$/);
  return { page, user, close: () => context.close() };
}

export const MODERATOR = { email: "moderator@e2e.test", password: "Sakura-2026!" };

/** Модератор мока (moderator@e2e.test) — в своём контексте браузера. */
export async function moderatorPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(98) } });
  const page = await context.newPage();
  await routeImages(page);
  await login(page, MODERATOR.email, MODERATOR.password);
  await expect(page).toHaveURL(/\/account$/);
  return { page, close: () => context.close() };
}
