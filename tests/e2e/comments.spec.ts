import type { Browser, Page } from "@playwright/test";

import { input, newUser, register, type TestUser } from "./account-helpers";
import { expect, routeImages, test, uniqueClientIp } from "./fixtures";

// Комментарии против мока Supabase (tests/mock-supabase): правила базы (ветка, флуд, бан, мягкое удаление)
// мок повторяет, настоящие — проверяет npm run rls:check. Данные мока общие — у каждого теста свои тексты и ники.

const unique = () => Math.random().toString(36).slice(2, 8);
const discussion = (page: Page) => page.getByRole("region", { name: /^Обсуждение/ });
const comment = (page: Page, text: string) => discussion(page).getByRole("article").filter({ hasText: text }).last();

async function post(page: Page, text: string, { spoiler = false } = {}) {
  const field = input(page, "Комментарий");
  await expect(field).toBeVisible();
  await field.fill(text);
  if (spoiler) await discussion(page).getByLabel("Спойлер").first().check();
  await discussion(page).getByRole("button", { name: "Отправить", exact: true }).first().click();
}

async function menu(page: Page, text: string, item: string) {
  const target = comment(page, text);
  const button = target.getByRole("button", { name: "Действия с комментарием" }).first();
  await expect(button).toBeVisible();
  await button.click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function reply(page: Page, to: string, username: string, text: string) {
  await menu(page, to, "Ответить");
  const field = input(page, `Ответ @${username}`);
  await expect(field).toBeVisible();
  await field.fill(text);
  await field.locator("xpath=ancestor::form").getByRole("button", { name: "Отправить" }).click();
}

/** Второй пользователь — в своём контексте браузера (свои cookies). */
async function secondUser(browser: Browser, prefix: string): Promise<{ page: Page; user: TestUser; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(99) } });
  const page = await context.newPage();
  await routeImages(page);
  const user = newUser(prefix);
  await register(page, user);
  await expect(page).toHaveURL(/\/account$/);
  return { page, user, close: () => context.close() };
}

test.describe("Комментарии", () => {
  test.describe.configure({ timeout: 90_000 });

  test("гость читает и видит приглашение войти с возвратом к обсуждению", async ({ page }) => {
    await page.goto("/anime/1");
    const login = page.getByRole("link", { name: "Войдите, чтобы написать" });
    await expect(login).toBeVisible();
    await expect(login).toHaveAttribute("href", "/login?next=%2Fanime%2F1%23comments");
    await expect(page.getByLabel("Комментарий", { exact: true })).toHaveCount(0);
  });

  test("написать, ответить, ответить на ответ с @ником, изменить, удалить корень с ответами", async ({ page, browser, consoleErrors }) => {
    const author = newUser("ca");
    await register(page, author);
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/1");

    const root = `Корень ${unique()}`;
    await post(page, root);
    await expect(comment(page, root)).toBeVisible();

    const ownReply = `Ответ себе ${unique()}`;
    await reply(page, root, author.username, ownReply);
    await expect(comment(page, ownReply)).toBeVisible();

    const second = await secondUser(browser, "cb");
    await second.page.goto("/anime/1");
    const nested = `Ответ на ответ ${unique()}`;
    await reply(second.page, ownReply, author.username, nested);
    // Ветки в один уровень: ответ на ответ показывается в той же ветке с «@ником» автора ответа.
    await expect(comment(second.page, nested)).toContainText(`@${author.username}`);

    const edited = `${nested} (исправлено)`;
    await menu(second.page, nested, "Изменить");
    const editField = input(second.page, "Текст комментария");
    await expect(editField).toBeVisible();
    await editField.fill(edited);
    await second.page.getByRole("button", { name: "Сохранить" }).click();
    await expect(comment(second.page, edited)).toContainText("изменён");
    await second.close();

    await page.reload();
    await menu(page, root, "Удалить");
    await page.getByRole("group", { name: "Удалить комментарий?" }).getByRole("button", { name: "Удалить" }).click();
    await expect(discussion(page).getByText(root)).toHaveCount(0);
    await expect(discussion(page).getByText("Комментарий удалён")).not.toHaveCount(0);
    await expect(comment(page, edited)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("спойлер размыт до клика", async ({ page }) => {
    await register(page, newUser("cs"));
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/1");
    const text = `Спойлер ${unique()}`;
    await post(page, text, { spoiler: true });

    const item = comment(page, text);
    const reveal = item.getByRole("button", { name: "Показать спойлер" });
    await expect(reveal).toBeVisible();
    await expect(item.getByText(text)).toHaveAttribute("aria-hidden", "true");
    await reveal.click();
    await expect(reveal).toHaveCount(0);
    await expect(item.getByText(text)).not.toHaveAttribute("aria-hidden");
  });

  test("счётчик 2000 и флуд-лимит на 6-м комментарии", async ({ page }) => {
    await register(page, newUser("cf"));
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/1");

    const field = input(page, "Комментарий");
    await expect(field).toBeVisible();
    await field.fill("x".repeat(2001));
    await expect(discussion(page).getByText("2001 / 2000")).toBeVisible();
    await expect(discussion(page).getByRole("button", { name: "Отправить", exact: true }).first()).toBeDisabled();

    const run = unique();
    for (let i = 1; i <= 5; i += 1) {
      await post(page, `Флуд ${run} №${i}`);
      await expect(comment(page, `Флуд ${run} №${i}`)).toBeVisible();
    }
    await post(page, `Флуд ${run} №6`);
    await expect(discussion(page).getByRole("alert")).toHaveText("Слишком часто. Подождите немного и попробуйте снова");
    await expect(discussion(page).getByRole("article").filter({ hasText: `Флуд ${run} №6` })).toHaveCount(0);
  });

  test("жалоба и повторная жалоба", async ({ page, browser }) => {
    await register(page, newUser("cr"));
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/1");
    const text = `Жалуйтесь ${unique()}`;
    await post(page, text);
    await expect(comment(page, text)).toBeVisible();

    const second = await secondUser(browser, "cq");
    await second.page.goto("/anime/1");
    for (const expected of ["Жалоба отправлена", "Вы уже пожаловались на этот комментарий"]) {
      await menu(second.page, text, "Пожаловаться");
      const form = second.page.getByRole("form", { name: "Жалоба" });
      await form.getByLabel("Спам или реклама").check();
      await form.getByRole("button", { name: "Отправить жалобу" }).click();
      await expect(comment(second.page, text)).toContainText(expected);
    }
    await second.close();
  });

  test("обсуждение серии отдельно от обсуждения тайтла", async ({ page }) => {
    await register(page, newUser("ce"));
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/1/watch/1");
    await expect(page.getByRole("heading", { name: "Обсуждение серии 1" })).toBeVisible();
    const text = `Про серию ${unique()}`;
    await post(page, text);
    await expect(comment(page, text)).toBeVisible();

    await page.goto("/anime/1");
    await expect(page.getByRole("heading", { name: "Обсуждение", exact: true })).toBeVisible();
    await expect(page.getByText(text)).toHaveCount(0);
  });
});
