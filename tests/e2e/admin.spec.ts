import type { Browser, Page } from "@playwright/test";

import { input, login, newUser, register } from "./account-helpers";
import { secondUser } from "./comments-helpers";
import { expect, routeImages, test, uniqueClientIp } from "./fixtures";

// Админ-панель против мока Supabase: мок повторяет политики миграции admin и эффект private.admin_apply,
// настоящие проверяет npm run rls:check. Администратор заведён в моке (admin@e2e.test).
// Данные мока общие — у каждого теста свой тайтл (20, 21) и свои ники.

const ADMIN = { email: "admin@e2e.test", password: "Sakura-2026!", username: "admin_e2e" };
const VIDEO = "/media/test/master.m3u8";

async function adminPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(97) } });
  const page = await context.newPage();
  await routeImages(page);
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/account$/);
  return { page, close: () => context.close() };
}

const episodeItem = (page: Page, number: number) => page.getByRole("listitem", { name: `Серия ${number}`, exact: true });
const publicEpisodes = (page: Page) => page.getByRole("region", { name: "Серии" });

/** Открывает форму новой серии и заполняет обязательное. */
async function newEpisodeForm(page: Page) {
  const add = page.getByRole("button", { name: "Добавить серию", exact: true });
  await expect(add).toBeVisible();
  await add.click();
  const form = page.getByRole("form", { name: "Новая серия" });
  await expect(form).toBeVisible();
  await input(page, "Адрес видео").fill(VIDEO);
  return form;
}

test.describe("Админ-панель", () => {
  test("гостю и обычному пользователю — 404, ссылка «Админка» только у администратора", async ({ page, browser }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();

    await register(page, newUser("an"));
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("banner").getByRole("link", { name: "Админка" })).toHaveCount(0);
    for (const path of ["/admin", "/admin/episodes", "/admin/episodes/1", "/admin/users"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
    }

    const admin = await adminPage(browser);
    const link = admin.page.getByRole("banner").getByRole("link", { name: "Админка" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(admin.page.getByRole("heading", { name: "Админ-панель", level: 1 })).toBeVisible();
    await admin.page.getByRole("navigation", { name: "Разделы админ-панели" }).getByRole("link", { name: "Серии" }).click();
    await expect(admin.page.getByRole("heading", { name: "Серии", level: 1 })).toBeVisible();
    await expect(admin.page.getByRole("link", { name: "Обзор" })).toBeVisible();
    await admin.close();
  });

  test("серия: черновик скрыт от зрителей, публикация и удаление сразу видны на сайте", async ({ page, browser }) => {
    const admin = await adminPage(browser);
    await admin.page.goto("/admin/episodes/20");
    await expect(admin.page.getByText("У этого тайтла пока нет серий.")).toBeVisible();

    // Черновик.
    const form = await newEpisodeForm(admin.page);
    await input(admin.page, "Название (необязательно)").fill("Пилот");
    await form.getByRole("button", { name: "Добавить серию" }).click();
    await expect(admin.page.getByRole("main").getByRole("status").filter({ hasText: "Серия 1 добавлена" })).toBeVisible();
    await expect(episodeItem(admin.page, 1)).toContainText("Черновик");
    await expect(episodeItem(admin.page, 1)).toContainText("Пилот");

    await page.goto("/anime/20");
    await expect(publicEpisodes(page)).toContainText("Для этого тайтла их пока нет");

    // Тот же номер второй раз — понятная ошибка, форма не закрывается.
    const duplicate = await newEpisodeForm(admin.page);
    await input(admin.page, "Номер").fill("1");
    await duplicate.getByRole("button", { name: "Добавить серию" }).click();
    await expect(duplicate.getByRole("alert")).toContainText("Серия с таким номером уже есть");
    await duplicate.getByRole("button", { name: "Отмена" }).click();

    // Публикация.
    await episodeItem(admin.page, 1).getByRole("button", { name: "Изменить", exact: true }).click();
    const edit = admin.page.getByRole("form", { name: "Изменить серию 1" });
    await expect(edit).toBeVisible();
    await input(admin.page, "Статус прав").selectOption({ label: "Собственное видео" });
    await edit.getByRole("button", { name: "Сохранить серию" }).click();
    await expect(admin.page.getByRole("main").getByRole("status").filter({ hasText: "Серия 1 сохранена" })).toBeVisible();
    await expect(episodeItem(admin.page, 1)).toContainText("Собственное видео");

    await page.goto("/anime/20");
    await expect(publicEpisodes(page).getByRole("link", { name: /Серия 1\s*Пилот/ })).toHaveAttribute("href", "/anime/20/watch/1");

    // Удаление — с подтверждением.
    await episodeItem(admin.page, 1).getByRole("button", { name: "Удалить", exact: true }).click();
    const confirm = admin.page.getByRole("group", { name: "Удаление серии 1" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Удалить серию" }).click();
    await expect(admin.page.getByRole("main").getByRole("status").filter({ hasText: "Серия 1 удалена" })).toBeVisible();
    await expect(admin.page.getByText("У этого тайтла пока нет серий.")).toBeVisible();

    await page.goto("/anime/20");
    await expect(publicEpisodes(page)).toContainText("Для этого тайтла их пока нет");
    await admin.close();
  });

  test("субтитры: добавить, повтор языка — ошибка, удалить", async ({ browser }) => {
    const admin = await adminPage(browser);
    const { page } = admin;
    await page.goto("/admin/episodes/21");
    const form = await newEpisodeForm(page);
    await input(page, "Статус прав").selectOption({ label: "Собственное видео" });
    await form.getByRole("button", { name: "Добавить серию" }).click();
    await expect(episodeItem(page, 1)).toBeVisible();

    const addSubtitles = async () => {
      await episodeItem(page, 1).getByRole("button", { name: "Добавить субтитры" }).click();
      const subtitleForm = page.getByRole("form", { name: "Новые субтитры серии 1" });
      await expect(subtitleForm).toBeVisible();
      await input(page, "Язык").fill("ru");
      await input(page, "Адрес файла субтитров").fill("/media/test/subtitles.ru.vtt");
      await subtitleForm.getByRole("button", { name: "Добавить субтитры" }).click();
      return subtitleForm;
    };

    await addSubtitles();
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Субтитры ru сохранены" })).toBeVisible();
    const subtitle = episodeItem(page, 1).getByRole("listitem", { name: "Субтитры ru" });
    await expect(subtitle).toContainText("по умолчанию");

    const again = await addSubtitles();
    await expect(again.getByRole("alert")).toContainText("Субтитры на этом языке уже есть");
    await again.getByRole("button", { name: "Отмена" }).click();

    await page.getByRole("button", { name: "Удалить субтитры ru" }).click();
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Субтитры ru удалены" })).toBeVisible();
    await expect(subtitle).toHaveCount(0);

    // Убираем серию, чтобы повторный запуск на том же моке начинался с пустого тайтла.
    await episodeItem(page, 1).getByRole("button", { name: "Удалить", exact: true }).click();
    await page.getByRole("group", { name: "Удаление серии 1" }).getByRole("button", { name: "Удалить серию" }).click();
    await expect(page.getByText("У этого тайтла пока нет серий.")).toBeVisible();
    await admin.close();
  });

  test("роли: администратор назначает модератора, запись в журнале, свою роль менять нельзя", async ({ browser }) => {
    const member = await secondUser(browser, "ar");
    await expect(member.page.getByRole("banner").getByRole("link", { name: "Модерация" })).toHaveCount(0);

    const admin = await adminPage(browser);
    const { page } = admin;
    await page.goto("/admin/users");
    await expect(page.getByRole("listitem", { name: `Пользователь @${ADMIN.username}` })).toContainText("это вы");

    await input(page, "Ник или его часть").fill(member.user.username.slice(0, -1));
    await page.getByRole("button", { name: "Найти" }).click();
    const row = page.getByRole("listitem", { name: `Пользователь @${member.user.username}` }).first();
    await expect(row).toBeVisible();
    const save = row.getByRole("button", { name: "Сохранить роль" });
    await expect(save).toBeDisabled();
    await row.getByLabel(`Роль @${member.user.username}`).selectOption({ label: "Модератор" });
    await save.click();
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: `@${member.user.username} — теперь модератор` })).toBeVisible();
    await expect(page.getByRole("region", { name: "Журнал смены ролей" })).toContainText(`@${member.user.username}: пользователь → модератор`);
    await expect(page.getByRole("region", { name: "Команда" })).toContainText(`@${member.user.username}`);

    await member.page.goto("/account");
    await expect(member.page.getByRole("banner").getByRole("link", { name: "Модерация" })).toBeVisible();
    await member.page.goto("/admin");
    await expect(member.page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();

    await member.close();
    await admin.close();
  });

  test("роль, выбранная до загрузки скриптов страницы, сохраняется", async ({ browser }) => {
    const member = await secondUser(browser, "as");
    const admin = await adminPage(browser);
    const { page } = admin;
    // Медленная сеть: HTML уже на экране, а скрипты приходят через 3 с — выбор делается до подключения React.
    await page.route(/_next\/static\/.*\.js/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.goto(`/admin/users?q=${member.user.username}`, { waitUntil: "commit" });
    const row = page.getByRole("listitem", { name: `Пользователь @${member.user.username}` }).first();
    await expect(row).toBeVisible();
    await row.getByLabel(`Роль @${member.user.username}`).selectOption({ label: "Модератор" });

    await row.getByRole("button", { name: "Сохранить роль" }).click();
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: `@${member.user.username} — теперь модератор` })).toBeVisible();

    await member.close();
    await admin.close();
  });
});
