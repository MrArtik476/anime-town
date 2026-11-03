import type { Browser, Page } from "@playwright/test";

import { login, newUser, register } from "./account-helpers";
import { comment, discussion, menu, post, secondUser, unique } from "./comments-helpers";
import { expect, routeImages, test, uniqueClientIp } from "./fixtures";

// Модерация против мока Supabase: мок повторяет эффекты private.moderation_apply, настоящие проверяет
// npm run rls:check. Модератор заведён в моке (moderator@e2e.test); данные общие — у каждого теста свои тексты.

const MODERATOR = { email: "moderator@e2e.test", password: "Sakura-2026!" };

async function moderatorPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(98) } });
  const page = await context.newPage();
  await routeImages(page);
  await login(page, MODERATOR.email, MODERATOR.password);
  await expect(page).toHaveURL(/\/account$/);
  return { page, close: () => context.close() };
}

/** Автор пишет комментарий на /anime/1, второй пользователь на него жалуется. */
async function reportedComment(page: Page, browser: Browser, text: string) {
  const author = newUser("ma");
  await register(page, author);
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/anime/1");
  await post(page, text);
  await expect(comment(page, text)).toBeVisible();

  const reporter = await secondUser(browser, "mr");
  await reporter.page.goto("/anime/1");
  await menu(reporter.page, text, "Пожаловаться");
  await reporter.page.getByRole("form", { name: "Жалоба" }).getByRole("button", { name: "Отправить жалобу" }).click();
  await expect(comment(reporter.page, text)).toContainText("Жалоба отправлена");
  await reporter.close();
  return author;
}

/** Карточка жалоб на комментарий с текстом; жалобы идут от старых к новым — листаем страницы. */
async function reportCard(page: Page, text: string) {
  await page.goto("/moderation");
  for (;;) {
    await expect(page.getByRole("heading", { name: "Действующие баны" })).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: text });
    if ((await card.count()) > 0) return card;
    const next = page.getByRole("link", { name: "Следующие жалобы" });
    if ((await next.count()) === 0) return card;
    await next.click();
    await page.waitForURL(/cursor=/);
  }
}

async function guestSees(browser: Browser, text: string) {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(97) } });
  const page = await context.newPage();
  await routeImages(page);
  await page.goto("/anime/1");
  await expect(page.getByRole("heading", { name: "Обсуждение", exact: true })).toBeVisible();
  const count = await discussion(page).getByText(text).count();
  await context.close();
  return count > 0;
}

test.describe("Модерация", () => {
  test.describe.configure({ timeout: 120_000 });

  test("модератор скрывает — гость не видит, жалоба уходит из /moderation", async ({ page, browser }) => {
    const text = `Нарушение ${unique()}`;
    await reportedComment(page, browser, text);

    const moderator = await moderatorPage(browser);
    const card = await reportCard(moderator.page, text);
    await expect(card).toContainText(/Спам или реклама:\s*1/);
    await card.getByRole("button", { name: "Скрыть" }).click();
    await expect(moderator.page.getByRole("main").getByRole("status").filter({ hasText: "Комментарий скрыт" })).toBeVisible();
    await expect(await reportCard(moderator.page, text)).toHaveCount(0);
    await moderator.close();

    expect(await guestSees(browser, text)).toBe(false);
  });

  test("вернуть скрытый", async ({ page, browser }) => {
    await register(page, newUser("mv"));
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/1");
    const text = `Вернётся ${unique()}`;
    await post(page, text);
    await expect(comment(page, text)).toBeVisible();

    const moderator = await moderatorPage(browser);
    await moderator.page.goto("/anime/1");
    await menu(moderator.page, text, "Скрыть");
    await expect(comment(moderator.page, text)).toContainText("Скрыт");
    expect(await guestSees(browser, text)).toBe(false);

    await menu(moderator.page, text, "Вернуть");
    await expect(comment(moderator.page, text).getByText("Скрыт", { exact: true })).toHaveCount(0);
    await moderator.close();
    expect(await guestSees(browser, text)).toBe(true);
  });

  test("бан на 7 дней — у забаненного форма заменена «Вы заблокированы до …»", async ({ page, browser }) => {
    const text = `Забанят ${unique()}`;
    await register(page, newUser("mb"));
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/1");
    await post(page, text);
    await expect(comment(page, text)).toBeVisible();

    const moderator = await moderatorPage(browser);
    await moderator.page.goto("/anime/1");
    await menu(moderator.page, text, "Забанить автора");
    const dialog = moderator.page.getByRole("form", { name: /^Забанить @/ });
    await dialog.getByLabel("7 дней").check();
    await dialog.getByLabel("Причина (необязательно)").fill("Флуд");
    await dialog.getByRole("button", { name: "Забанить" }).click();
    await expect(comment(moderator.page, text)).toContainText("заблокирован");
    await moderator.close();

    await page.reload();
    await expect(discussion(page).getByText(/^Вы заблокированы до \d{1,2} [а-я]+ \d{4}/)).toBeVisible();
    await expect(page.getByLabel("Комментарий", { exact: true })).toHaveCount(0);
  });

  test("«Снять бан» в /moderation — форма у пользователя снова есть", async ({ page, browser }) => {
    const user = newUser("mu");
    const text = `Разбанят ${unique()}`;
    await register(page, user);
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/1");
    await post(page, text);
    await expect(comment(page, text)).toBeVisible();

    const moderator = await moderatorPage(browser);
    await moderator.page.goto("/anime/1");
    await menu(moderator.page, text, "Забанить автора");
    await moderator.page.getByRole("form", { name: /^Забанить @/ }).getByRole("button", { name: "Забанить" }).click();
    await expect(comment(moderator.page, text)).toContainText("заблокирован");

    await page.reload();
    await expect(discussion(page).getByText(/^Вы заблокированы/)).toBeVisible();

    await moderator.page.goto("/moderation");
    const ban = moderator.page.getByRole("listitem", { name: `Бан @${user.username}` });
    await expect(ban).toContainText("до");
    await ban.getByRole("button", { name: "Снять бан" }).click();
    await expect(moderator.page.getByRole("main").getByRole("status").filter({ hasText: `Бан @${user.username} снят` })).toBeVisible();
    await expect(ban).toHaveCount(0);
    await moderator.close();

    await page.reload();
    await expect(page.getByLabel("Комментарий", { exact: true })).toBeVisible();
  });

  test("отклонить жалобы — комментарий остаётся, жалоба уходит", async ({ page, browser }) => {
    const text = `Ложная жалоба ${unique()}`;
    await reportedComment(page, browser, text);

    const moderator = await moderatorPage(browser);
    const card = await reportCard(moderator.page, text);
    await card.getByRole("button", { name: "Отклонить жалобы" }).click();
    await expect(moderator.page.getByRole("main").getByRole("status").filter({ hasText: "Жалобы отклонены" })).toBeVisible();
    await expect(await reportCard(moderator.page, text)).toHaveCount(0);
    await moderator.close();

    expect(await guestSees(browser, text)).toBe(true);
  });

  test("ссылка «Модерация» в шапке — только у модератора", async ({ page, browser }) => {
    await register(page, newUser("mn"));
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("banner").getByRole("link", { name: "Модерация" })).toHaveCount(0);

    const moderator = await moderatorPage(browser);
    const link = moderator.page.getByRole("banner").getByRole("link", { name: "Модерация" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(moderator.page.getByRole("heading", { name: "Модерация", level: 1 })).toBeVisible();
    await moderator.close();
  });

  test("обычный пользователь: /moderation — 404", async ({ page }) => {
    await register(page, newUser("mx"));
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/moderation");
    await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Жалобы" })).toHaveCount(0);
  });

  test("гость: /moderation — 404", async ({ page }) => {
    await page.goto("/moderation");
    await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Жалобы" })).toHaveCount(0);
  });
});
