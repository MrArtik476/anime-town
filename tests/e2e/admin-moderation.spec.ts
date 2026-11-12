import type { Browser, Page } from "@playwright/test";

import { input, login, newUser, register } from "./account-helpers";
import { comment, discussion, menu, MODERATOR, moderatorPage, post, secondUser, unique } from "./comments-helpers";
import { expect, routeImages, test, uniqueClientIp } from "./fixtures";

// Раздел «Модерация» админ-панели (этап 6b, ADR-028) против мока Supabase. Журнал, жалобы и баны в моке общие для
// всех тестов, поэтому каждый тест заводит своих пользователей и находит свои строки по нику или уникальному тексту.
// Баны после себя снимаются. Права на настоящей базе проверяет npm run rls:check.

const ADMIN = { email: "admin@e2e.test", password: "Sakura-2026!", username: "admin_e2e" };
const MODERATOR_NICK = "moderator_e2e";
const PAGES = ["/admin/moderation", "/admin/moderation/reports", "/admin/moderation/bans"];

async function adminPage(browser: Browser, viewport?: { width: number; height: number }): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(96) }, viewport });
  const page = await context.newPage();
  await routeImages(page);
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/account$/);
  return { page, close: () => context.close() };
}

const notFound = (page: Page) => page.getByRole("heading", { name: "Страница не найдена" });
const main = (page: Page) => page.getByRole("main").filter({ visible: true });

/** Журнал с фильтром «над кем» — только строки этого теста. */
async function logFor(page: Page, username: string) {
  await page.goto(`/admin/moderation?target=${username}`);
  await expect(page.getByRole("heading", { name: "Модерация", level: 1 })).toBeVisible();
  return main(page).getByRole("list").getByRole("listitem");
}

/** Автор пишет комментарий на /anime/1 и остаётся вошедшим на своей странице. */
async function author(page: Page, prefix: string, text: string) {
  const user = newUser(prefix);
  await register(page, user);
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/anime/1");
  await post(page, text);
  await expect(comment(page, text)).toBeVisible();
  return user;
}

/** Модератор банит автора комментария на 7 дней с причиной. */
async function banAuthor(browser: Browser, text: string, reason: string) {
  const moderator = await moderatorPage(browser);
  await moderator.page.goto("/anime/1");
  await menu(moderator.page, text, "Забанить автора");
  const dialog = moderator.page.getByRole("form", { name: /^Забанить @/ });
  await dialog.getByLabel("7 дней").check();
  await dialog.getByLabel("Причина (необязательно)").fill(reason);
  await dialog.getByRole("button", { name: "Забанить" }).click();
  await expect(comment(moderator.page, text)).toContainText("заблокирован");
  await moderator.close();
}

test.describe("Админ-панель: модерация", () => {
  test.describe.configure({ timeout: 120_000 });

  test("гостю, пользователю и модератору — 404", async ({ page, browser }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(notFound(page)).toBeVisible();
    }

    await register(page, newUser("qn"));
    await expect(page).toHaveURL(/\/account$/);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(notFound(page)).toBeVisible();
    }

    const moderator = await moderatorPage(browser);
    for (const path of PAGES) {
      await moderator.page.goto(path);
      await expect(notFound(moderator.page)).toBeVisible();
    }
    await moderator.close();
  });

  test("скрытие по жалобе: строка в журнале, фильтры, жалоба закрыта с исходом", async ({ page, browser }) => {
    const text = `Реклама ${unique()}`;
    const details = `Подробности ${unique()}`;
    const user = await author(page, "qh", text);

    const reporter = await secondUser(browser, "qr");
    await reporter.page.goto("/anime/1");
    await menu(reporter.page, text, "Пожаловаться");
    const form = reporter.page.getByRole("form", { name: "Жалоба" });
    await form.getByRole("textbox").fill(details);
    await form.getByRole("button", { name: "Отправить жалобу" }).click();
    await expect(comment(reporter.page, text)).toContainText("Жалоба отправлена");
    await reporter.close();

    const admin = await adminPage(browser);
    const reportRow = (status: string) => {
      const url = status ? `/admin/moderation/reports?status=${status}` : "/admin/moderation/reports";
      return admin.page.goto(url).then(() => main(admin.page).getByRole("listitem").filter({ hasText: details }));
    };

    // Пока жалоба открыта: видна во «Всех» и в «Открытых», закрывшего нет.
    const open = await reportRow("open");
    await expect(open).toContainText("Открыта");
    await expect(open).toContainText(`@${reporter.user.username}`);
    await expect(open).toContainText(text);
    await expect(open).not.toContainText("Закрыл");

    const moderator = await moderatorPage(browser);
    await moderator.page.goto("/anime/1");
    await menu(moderator.page, text, "Скрыть");
    await expect(comment(moderator.page, text)).toContainText("Скрыт");
    await moderator.close();

    // Журнал: действие, кто и над кем; ссылка ведёт к комментарию.
    const rows = await logFor(admin.page, user.username);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Скрыл комментарий");
    await expect(rows.first()).toContainText(`@${MODERATOR_NICK}`);
    await expect(rows.first()).toContainText(`@${user.username}`);
    await expect(rows.first().getByRole("link", { name: "Открыть комментарий" })).toHaveAttribute("href", /\/anime\/1#comment-\d+$/);

    // Фильтры формы: модератор и действие — строка остаётся; другое действие — пусто; условия сохраняются в полях.
    await input(admin.page, "Модератор (ник)").fill(MODERATOR_NICK.toUpperCase());
    await input(admin.page, "Действие").selectOption("hide");
    await admin.page.getByRole("button", { name: "Показать" }).click();
    await expect(admin.page).toHaveURL(/action=hide/);
    await expect(main(admin.page).getByRole("list").getByRole("listitem")).toHaveCount(1);
    await expect(input(admin.page, "Над кем (ник)")).toHaveValue(user.username);

    await input(admin.page, "Действие").selectOption("ban");
    await admin.page.getByRole("button", { name: "Показать" }).click();
    await expect(admin.page).toHaveURL(/action=ban/);
    await expect(main(admin.page).getByText("По этим условиям действий нет.")).toBeVisible();

    // Вчерашний день — действия не попадают; несуществующий ник — отдельное сообщение, а не весь журнал.
    await admin.page.goto(`/admin/moderation?target=${user.username}&to=2020-01-01`);
    await expect(main(admin.page).getByText("По этим условиям действий нет.")).toBeVisible();
    await admin.page.goto("/admin/moderation?moderator=no_such_user_zz");
    await expect(main(admin.page).getByText("Пользователь @no_such_user_zz не найден — проверьте ник.")).toBeVisible();
    await admin.page.getByRole("link", { name: "Сбросить" }).click();
    await expect(admin.page).toHaveURL(/\/admin\/moderation$/);

    // Жалоба закрыта: исход и кто закрыл; в «Открытых» её больше нет.
    const resolved = await reportRow("resolved");
    await expect(resolved).toContainText("Принята — комментарий скрыт");
    await expect(resolved).toContainText(`Закрыл @${MODERATOR_NICK}`);
    await expect(await reportRow("open")).toHaveCount(0);
    await expect(await reportRow("")).toHaveCount(1);
    await admin.close();
  });

  test("бан: администратор видит его и снимает — запись в журнале, пользователь снова пишет", async ({ page, browser }) => {
    const text = `Флудер ${unique()}`;
    const reason = `Причина ${unique()}`;
    const user = await author(page, "qb", text);
    await banAuthor(browser, text, reason);
    await page.reload();
    await expect(discussion(page).getByText(/^Вы заблокированы/)).toBeVisible();

    const admin = await adminPage(browser);
    await admin.page.goto("/admin/moderation/bans");
    const ban = main(admin.page).getByRole("listitem", { name: `Бан @${user.username}` });
    await expect(ban).toContainText("Действует");
    await expect(ban).toContainText(reason);
    await expect(ban).toContainText(`Выдал @${MODERATOR_NICK}`);
    await expect(main(admin.page).getByRole("link", { name: "Действующие" })).toHaveAttribute("aria-current", "true");

    await ban.getByRole("button", { name: "Снять бан" }).click();
    await expect(main(admin.page).getByRole("status").filter({ hasText: `Бан @${user.username} снят` })).toBeVisible();
    await expect(ban).toHaveCount(0);

    await main(admin.page).getByRole("link", { name: "Завершённые" }).click();
    await expect(admin.page).toHaveURL(/state=ended/);
    await expect(ban).toContainText("Снят");
    await expect(ban).toContainText(`Снял @${ADMIN.username}`);
    await expect(ban.getByRole("button", { name: "Снять бан" })).toHaveCount(0);

    // В журнале — оба действия, новое сверху; снял администратор, забанил модератор.
    const rows = await logFor(admin.page, user.username);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Снял бан");
    await expect(rows.nth(0)).toContainText(`@${ADMIN.username}`);
    await expect(rows.nth(1)).toContainText("Забанил");
    await expect(rows.nth(1)).toContainText("7 дней");
    await expect(rows.nth(1)).toContainText(reason);
    await admin.close();

    await page.reload();
    await expect(page.getByLabel("Комментарий", { exact: true })).toBeVisible();
  });

  test("телефон 360 px: раздел без горизонтальной прокрутки, вкладки доступны", async ({ page, browser }) => {
    const text = `Узкий экран ${unique()} ${"оченьдлинноесловобезпробелов".repeat(4)}`;
    const user = await author(page, "qm", text);
    await banAuthor(browser, text, `Длинная причина ${"безпробеловсовсем".repeat(6)}`);

    const admin = await adminPage(browser, { width: 360, height: 800 });
    const noOverflow = async () =>
      expect(await admin.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await admin.page.goto("/admin");
    await admin.page.getByRole("navigation", { name: "Разделы админ-панели" }).getByRole("link", { name: "Модерация" }).click();
    await expect(admin.page.getByRole("heading", { name: "Модерация", level: 1 })).toBeVisible();
    const tabs = main(admin.page).getByRole("navigation", { name: "Модерация: разделы" });
    await expect(tabs.getByRole("link", { name: "Журнал" })).toHaveAttribute("aria-current", "page");
    await logFor(admin.page, user.username);
    await noOverflow();

    await main(admin.page).getByRole("navigation", { name: "Модерация: разделы" }).getByRole("link", { name: "Баны" }).click();
    const ban = main(admin.page).getByRole("listitem", { name: `Бан @${user.username}` });
    await expect(ban).toBeVisible();
    await noOverflow();

    await main(admin.page).getByRole("navigation", { name: "Модерация: разделы" }).getByRole("link", { name: "Жалобы" }).click();
    await expect(admin.page).toHaveURL(/\/admin\/moderation\/reports$/);
    await expect(main(admin.page).getByRole("navigation", { name: "Статус жалоб" })).toBeVisible();
    await noOverflow();

    // Уборка: бан этого теста снимается.
    await admin.page.goto("/admin/moderation/bans");
    await ban.getByRole("button", { name: "Снять бан" }).click();
    await expect(main(admin.page).getByRole("status").filter({ hasText: "снят" })).toBeVisible();
    await admin.close();
  });
});

// Модератор по-прежнему работает на /moderation — раздел админки его не заменяет.
test("модератор: /moderation открывается как раньше", async ({ browser }) => {
  const moderator = await moderatorPage(browser);
  await moderator.page.goto("/moderation");
  await expect(moderator.page.getByRole("heading", { name: "Действующие баны" })).toBeVisible();
  expect(MODERATOR.email).toBe("moderator@e2e.test");
  await moderator.close();
});
