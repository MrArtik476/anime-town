import type { Browser, Page } from "@playwright/test";

import { input, login, newUser, register, status } from "./account-helpers";
import { moderatorPage, secondUser, unique } from "./comments-helpers";
import { expect, routeImages, test, uniqueClientIp } from "./fixtures";

// Раздел «Тайтлы» админ-панели (этап 6c, ADR-029) против моков. Мок Supabase повторяет эффект private.title_apply,
// настоящую базу проверяет npm run rls:check. У каждого теста свой тайтл из «только поиском» фикстур мока AniList
// (41–44): их нет в общих списках каталога, поэтому скрытие не меняет число карточек у соседних тестов.
// После себя тест возвращает тайтл в исходное состояние.

const ADMIN = { email: "admin@e2e.test", password: "Sakura-2026!", username: "admin_e2e" };

async function adminPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(95) } });
  const page = await context.newPage();
  await routeImages(page);
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/account$/);
  return { page, close: () => context.close() };
}

/** Гость в своём контексте: без cookies и без клиентского кэша прежних страниц. */
async function guestPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(94) } });
  const page = await context.newPage();
  await routeImages(page);
  return { page, close: () => context.close() };
}

const main = (page: Page) => page.getByRole("main").filter({ visible: true });
const notFound = (page: Page) => page.getByRole("heading", { name: "Страница не найдена" });
const animeNotFound = (page: Page) => page.getByRole("heading", { name: "Аниме не найдено" });
const cards = (page: Page) => page.getByTestId("anime-card").filter({ visible: true });
const title = (page: Page) => main(page).getByRole("heading", { level: 1 });

async function openTitle(page: Page, id: number) {
  await page.goto(`/admin/titles/${id}`);
  await expect(main(page).getByRole("form", { name: "Название и описание" })).toBeVisible();
}

test.describe("Админ-панель: тайтлы", () => {
  test.describe.configure({ timeout: 120_000 });

  test("гостю, пользователю и модератору — 404", async ({ page, browser }) => {
    const paths = ["/admin/titles", "/admin/titles/41"];
    for (const path of paths) {
      await page.goto(path);
      await expect(notFound(page)).toBeVisible();
    }
    await register(page, newUser("tn"));
    await expect(page).toHaveURL(/\/account$/);
    for (const path of paths) {
      await page.goto(path);
      await expect(notFound(page)).toBeVisible();
    }
    const moderator = await moderatorPage(browser);
    for (const path of paths) {
      await moderator.page.goto(path);
      await expect(notFound(moderator.page)).toBeVisible();
    }
    await moderator.close();
  });

  test("ручные название и описание: видны на сайте и в поиске, возврат к автоматическим", async ({ browser }) => {
    const manualTitle = `Правка ${unique()}`;
    const manualText = `Описание редакции ${unique()}.`;
    const admin = await adminPage(browser);
    const { page } = admin;

    // Раздел открывается из меню админки, тайтл — по id.
    await page.goto("/admin");
    await page.getByRole("navigation", { name: "Разделы админ-панели" }).getByRole("link", { name: "Тайтлы" }).click();
    await expect(page.getByRole("heading", { name: "Тайтлы", level: 1 })).toBeVisible();
    await input(page, "id тайтла на AniList").fill("41");
    await page.getByRole("button", { name: "Открыть тайтл" }).click();
    await expect(page).toHaveURL(/\/admin\/titles\/41$/);
    const form = main(page).getByRole("form", { name: "Название и описание" });
    await expect(form).toBeVisible();
    await expect(main(page).getByRole("heading", { name: "Editing Probe", level: 2 })).toBeVisible();
    await expect(form).toContainText("показывается автоматическое: «Editing Probe»");

    const save = form.getByRole("button", { name: "Сохранить" });
    await expect(save).toBeDisabled();
    await input(page, "Русское название").fill(`  ${manualTitle}  `);
    await input(page, "Описание").fill(manualText);
    await save.click();
    await expect(status(page).filter({ hasText: "Сохранено — текст уже на сайте" })).toBeVisible();
    await expect(main(page).getByRole("heading", { name: manualTitle, level: 2 })).toBeVisible();
    await expect(input(page, "Русское название")).toHaveValue(manualTitle);
    await expect(save).toBeDisabled();

    // Сайт: страница тайтла, поиск в каталоге; подписи источника у ручного описания нет.
    const guest = await guestPage(browser);
    await guest.page.goto("/anime/41");
    await expect(title(guest.page)).toHaveText(manualTitle);
    await expect(main(guest.page).getByText(manualText)).toBeVisible();
    await expect(main(guest.page).getByText("Описание: AniList.")).toHaveCount(0);
    await expect(main(guest.page).getByText(/показан оригинал на английском/)).toHaveCount(0);
    await guest.page.goto("/catalog?q=Editing+Probe");
    await expect(cards(guest.page)).toHaveCount(1);
    await expect(cards(guest.page).first()).toContainText(manualTitle);

    // Списки раздела и журнал.
    await page.goto("/admin/titles");
    const edited = page.getByRole("region", { name: "С ручным текстом" });
    await expect(edited.getByRole("listitem").filter({ hasText: manualTitle })).toContainText("название и описание");
    await expect(page.getByRole("region", { name: "Журнал" }).getByRole("listitem").filter({ hasText: manualTitle }).first()).toContainText(
      `Изменил название и описание`,
    );

    // Только описание: поле названия очищено — название снова автоматическое, описание остаётся ручным.
    await openTitle(page, 41);
    await input(page, "Русское название").fill("");
    await main(page).getByRole("form", { name: "Название и описание" }).getByRole("button", { name: "Сохранить" }).click();
    await expect(status(page).filter({ hasText: "Сохранено" })).toBeVisible();
    await guest.page.goto("/anime/41");
    await expect(title(guest.page)).toHaveText("Editing Probe");
    await expect(main(guest.page).getByText(manualText)).toBeVisible();

    // Возврат к автоматическому тексту — уборка за тестом.
    await main(page).getByRole("button", { name: "Вернуть автоматический текст" }).click();
    await expect(status(page).filter({ hasText: "Возвращён автоматический текст" })).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Вернуть автоматический текст" })).toHaveCount(0);
    await expect(input(page, "Описание")).toHaveValue("");
    await guest.page.goto("/anime/41");
    await expect(title(guest.page)).toHaveText("Editing Probe");
    await expect(main(guest.page).getByText(manualText)).toHaveCount(0);
    await expect(main(page).getByRole("region", { name: "Журнал тайтла" })).toContainText("Вернул автоматический текст");

    await guest.close();
    await admin.close();
  });

  test("скрытие: нет в поиске и среди связанных, страница — «не найдено» всем, кроме администратора; возврат", async ({ browser }) => {
    const reason = `Причина ${unique()}`;
    const guest = await guestPage(browser);
    await guest.page.goto("/anime/42");
    await expect(title(guest.page)).toHaveText("Hiding Probe");
    await guest.page.goto("/anime/43");
    await expect(main(guest.page).getByRole("region", { name: "Связанные произведения" })).toContainText("Hiding Probe");

    const admin = await adminPage(browser);
    const { page } = admin;
    await openTitle(page, 42);
    const visibility = main(page).getByRole("region", { name: "Видимость" });
    await expect(visibility).toContainText("Виден на сайте");
    await input(page, "Причина (необязательно, останется в журнале)").fill(reason);
    await visibility.getByRole("button", { name: "Скрыть с сайта" }).click();
    await expect(status(page).filter({ hasText: "Тайтл скрыт" })).toBeVisible();
    await expect(visibility.getByRole("button", { name: "Вернуть на сайт" })).toBeVisible();
    await expect(visibility.getByRole("button", { name: "Скрыть с сайта" })).toHaveCount(0);
    await expect(main(page).getByRole("region", { name: "Журнал тайтла" })).toContainText(reason);

    // Гость: страницы нет, в поиске и среди связанных тайтла нет.
    await guest.page.goto("/anime/42");
    await expect(animeNotFound(guest.page)).toBeVisible();
    await expect(guest.page).not.toHaveTitle(/Hiding Probe/);
    await guest.page.goto("/catalog?q=Hiding+Probe");
    await expect(main(guest.page).getByRole("heading", { level: 1 })).toBeVisible();
    await expect(cards(guest.page)).toHaveCount(0);
    await guest.page.goto("/anime/43");
    await expect(title(guest.page)).toHaveText("Relation Probe");
    await expect(main(guest.page).getByText("Hiding Probe")).toHaveCount(0);

    // Обычный вошедший пользователь — тоже «не найдено».
    const member = await secondUser(browser, "th");
    await member.page.goto("/anime/42");
    await expect(animeNotFound(member.page)).toBeVisible();
    await member.close();

    // Администратор видит страницу с плашкой и ссылкой в админку; тайтл — в списке скрытых.
    await page.goto("/anime/42");
    await expect(title(page)).toHaveText("Hiding Probe");
    const banner = main(page).getByRole("status").filter({ hasText: "Тайтл скрыт" });
    await expect(banner).toBeVisible();
    await banner.getByRole("link", { name: "Открыть в админке" }).click();
    await expect(page).toHaveURL(/\/admin\/titles\/42$/);
    await page.goto("/admin/titles");
    await expect(page.getByRole("region", { name: "Скрытые тайтлы" }).getByRole("link", { name: "Hiding Probe" })).toBeVisible();

    // Возврат на сайт — уборка за тестом.
    await openTitle(page, 42);
    await main(page).getByRole("region", { name: "Видимость" }).getByRole("button", { name: "Вернуть на сайт" }).click();
    await expect(status(page).filter({ hasText: "Тайтл снова виден на сайте" })).toBeVisible();
    await guest.page.goto("/anime/42");
    await expect(title(guest.page)).toHaveText("Hiding Probe");
    await guest.page.goto("/catalog?q=Hiding+Probe");
    await expect(cards(guest.page)).toHaveCount(1);
    await page.goto("/admin/titles");
    await expect(page.getByRole("region", { name: "Скрытые тайтлы" }).getByRole("link", { name: "Hiding Probe" })).toHaveCount(0);

    await guest.close();
    await admin.close();
  });

  test("скрытый тайтл в «Моём списке» остаётся с пометкой «Недоступен», после возврата — снова ссылка", async ({ page, browser }) => {
    await register(page, newUser("tl"));
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/44");
    await expect(title(page)).toHaveText("List Probe");
    await input(page, "Мой список").selectOption({ label: "Смотрю" });
    await expect(status(page).filter({ hasText: "Сохранено" })).toBeVisible();

    const admin = await adminPage(browser);
    await openTitle(admin.page, 44);
    await main(admin.page).getByRole("region", { name: "Видимость" }).getByRole("button", { name: "Скрыть с сайта" }).click();
    await expect(status(admin.page).filter({ hasText: "Тайтл скрыт" })).toBeVisible();

    await page.goto("/account");
    const watching = main(page).getByRole("region", { name: /Смотрю/ });
    const row = watching.getByRole("listitem").filter({ hasText: "List Probe" });
    await expect(row).toContainText("Недоступен");
    await expect(row.getByRole("link")).toHaveCount(0);

    await main(admin.page).getByRole("region", { name: "Видимость" }).getByRole("button", { name: "Вернуть на сайт" }).click();
    await expect(status(admin.page).filter({ hasText: "Тайтл снова виден на сайте" })).toBeVisible();
    await admin.close();

    await page.reload();
    await expect(row.getByRole("link", { name: /List Probe/ })).toBeVisible();
    await expect(row).not.toContainText("Недоступен");
  });
});
