import type { APIRequestContext, Browser, Page } from "@playwright/test";

import { header, newUser, register, status, type TestUser } from "./account-helpers";
import { comment, discussion, menu, moderatorPage, post, reply, secondUser, unique } from "./comments-helpers";
import { E2E_SUPABASE_URL } from "./constants";
import { expect, test } from "./fixtures";

// Уведомления против мока Supabase: «триггер» ответа и тестовый вход «серия вышла» (POST /__test/episode-released,
// только в моке) повторяют контракт базы; настоящие триггеры проверяет npm run rls:check. Опрос колокольчика
// (60 с, скрытая вкладка) — unit-тест bell-poller. Данные мока общие — у каждого теста свои пользователи и тайтлы
// обсуждений; выход серии ограничен своим пользователем (emails), чтобы параллельные прогоны не мешали.

const bell = (page: Page) => header(page).getByRole("link", { name: /^Уведомления:/ });
const unreadLabel = (n: string | number) => `Уведомления: ${n} непрочитанных`;
const rows = (page: Page) => page.getByRole("main").getByRole("listitem").getByRole("link");
const row = (page: Page, text: string | RegExp) => rows(page).filter({ hasText: text });

async function releaseEpisode(request: APIRequestContext, animeId: number, number: number, user: TestUser) {
  const response = await request.post(`${E2E_SUPABASE_URL}/__test/episode-released`, {
    data: { anilist_id: animeId, number, emails: [user.email] },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { notified: number };
}

async function addToList(page: Page, animeId: number, label = "Смотрю") {
  await page.goto(`/anime/${animeId}`);
  await page.getByLabel("Мой список", { exact: true }).filter({ visible: true }).selectOption({ label });
  await expect(status(page).filter({ hasText: "Сохранено" })).toBeVisible();
}

/** Автор пишет корень на странице, второй пользователь отвечает; возвращает id ответа. */
async function replyFromSecond(browser: Browser, path: string, author: TestUser, root: string, answers: string[]) {
  const second = await secondUser(browser, "nb");
  await second.page.goto(path);
  let replyId = "";
  for (const text of answers) {
    await reply(second.page, root, author.username, text);
    const created = comment(second.page, text);
    await expect(created).toBeVisible();
    replyId = ((await created.getAttribute("id")) ?? "").replace("comment-", "");
  }
  const username = second.user.username;
  await second.close();
  return { replyId, username };
}

async function registerAndPost(page: Page, path: string, root: string) {
  const author = newUser("na");
  await register(page, author);
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(path);
  await post(page, root);
  await expect(comment(page, root)).toBeVisible();
  return author;
}

test.describe("Уведомления", () => {
  test.describe.configure({ timeout: 120_000 });

  test("гость: /notifications → /login?next=/notifications, колокольчика нет", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page).toHaveURL(/\/login\?next=%2Fnotifications$/);
    await expect(header(page).getByRole("link", { name: "Войти" })).toBeVisible();
    await expect(bell(page)).toHaveCount(0);
  });

  test("после ответа у автора колокольчик показывает 1; клик ведёт к #comment-<id> и снимает выделение", async ({ page, browser, consoleErrors }) => {
    const root = `Корень ${unique()}`;
    const author = await registerAndPost(page, "/anime/7", root);
    await expect(bell(page)).toHaveAccessibleName(unreadLabel(0));

    const { replyId, username } = await replyFromSecond(browser, "/anime/7", author, root, [`Ответ ${unique()}`]);

    await page.reload();
    await expect(bell(page)).toHaveAccessibleName(unreadLabel(1));
    await expect(bell(page)).toHaveText("1");
    await bell(page).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole("heading", { level: 1, name: "Уведомления" })).toBeVisible();

    const item = row(page, `${username} ответил(а) на ваш комментарий`);
    await expect(item).toContainText("Непрочитанное");
    await expect(item).toHaveAttribute("href", `/anime/7#comment-${replyId}`);
    await item.click();
    await expect(page).toHaveURL(new RegExp(`/anime/7#comment-${replyId}$`));
    await expect(page.locator(`#comment-${replyId}`)).toBeVisible();
    // markRead дошёл до сервера: после обновления маршрута счётчик в шапке — 0.
    await expect(bell(page)).toHaveAccessibleName(unreadLabel(0));

    await page.goto("/notifications");
    await expect(row(page, `${username} ответил(а)`)).toBeVisible();
    await expect(row(page, `${username} ответил(а)`)).not.toContainText("Непрочитанное");
    expect(consoleErrors).toEqual([]);
  });

  test("«Прочитать все» — счётчик пропадает, выделение снято", async ({ page, browser }) => {
    const root = `Корень ${unique()}`;
    const author = await registerAndPost(page, "/anime/8", root);
    await replyFromSecond(browser, "/anime/8", author, root, [`Первый ${unique()}`, `Второй ${unique()}`]);

    await page.goto("/notifications");
    await expect(bell(page)).toHaveAccessibleName(unreadLabel(2));
    await expect(rows(page).filter({ hasText: "Непрочитанное" })).toHaveCount(2);
    await page.getByRole("button", { name: "Прочитать все" }).click();
    await expect(bell(page)).toHaveAccessibleName(unreadLabel(0));
    await expect(bell(page)).toHaveText("");
    await expect(rows(page).filter({ hasText: "Непрочитанное" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Прочитать все" })).toHaveCount(0);
  });

  test("выход серии из «Смотрю» — «Вышла серия N»; повторный выход — новое непрочитанное; серии нет — страница тайтла", async ({ page, request, consoleErrors }) => {
    const user = newUser("ne");
    await register(page, user);
    await expect(page).toHaveURL(/\/account$/);
    await addToList(page, 1);
    await addToList(page, 3, "Хочу посмотреть");

    expect(await releaseEpisode(request, 1, 2, user)).toEqual({ notified: 1 });
    // Тайтл 3 в моке без серий и без обложки: ссылка — на страницу тайтла, у строки — заглушка обложки.
    expect(await releaseEpisode(request, 3, 1, user)).toEqual({ notified: 1 });

    await page.goto("/notifications");
    await expect(bell(page)).toHaveAccessibleName(unreadLabel(2));
    const episode = row(page, "Вышла серия 2");
    await expect(episode).toHaveAttribute("href", "/anime/1/watch/2");
    await expect(episode).toContainText("Непрочитанное");
    const missing = row(page, "Вышла серия 1");
    await expect(missing).toHaveAttribute("href", "/anime/3");
    await expect(missing.getByTestId("poster-fallback")).toBeVisible();

    // С клавиатуры: строка — настоящая ссылка, Enter открывает плеер и отмечает прочитанным.
    await expect(episode).toBeVisible();
    await episode.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/anime\/1\/watch\/2$/);
    await expect(bell(page)).toHaveAccessibleName(unreadLabel(1));

    // Повторный выход той же серии (ADR-026): новое непрочитанное, прочитанное остаётся.
    expect(await releaseEpisode(request, 1, 2, user)).toEqual({ notified: 1 });
    await page.goto("/notifications");
    await expect(row(page, "Вышла серия 2")).toHaveCount(2);
    await expect(row(page, "Вышла серия 2").first()).toContainText("Непрочитанное");
    await expect(row(page, "Вышла серия 2").last()).not.toContainText("Непрочитанное");

    await row(page, "Вышла серия 1").click();
    await expect(page).toHaveURL(/\/anime\/3$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("ответ в ветке, чей корень скрыл модератор, — ссылка на серию без якоря, без ошибки", async ({ page, browser, consoleErrors }) => {
    const root = `Скроют ${unique()}`;
    const author = await registerAndPost(page, "/anime/1/watch/2", root);
    const { replyId, username } = await replyFromSecond(browser, "/anime/1/watch/2", author, root, [`Ответ ${unique()}`]);

    await page.goto("/notifications");
    await expect(row(page, `${username} ответил(а)`)).toHaveAttribute("href", `/anime/1/watch/2#comment-${replyId}`);

    const moderator = await moderatorPage(browser);
    await moderator.page.goto("/anime/1/watch/2");
    await menu(moderator.page, root, "Скрыть");
    await expect(comment(moderator.page, root)).toContainText("Скрыт");
    await moderator.close();

    await page.reload();
    const item = row(page, `${username} ответил(а)`);
    await expect(item).toHaveAttribute("href", "/anime/1/watch/2");
    await item.click();
    await expect(page).toHaveURL(/\/anime\/1\/watch\/2$/);
    await expect(discussion(page)).toBeVisible();
    await expect(discussion(page).getByText(root)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test("настройка выключена — уведомления нет", async ({ page, browser, request }) => {
    const user = newUser("np");
    await register(page, user);
    await expect(page).toHaveURL(/\/account$/);

    const prefs = page.getByRole("region", { name: "Уведомления", exact: true });
    const replies = prefs.getByRole("switch", { name: "Ответы на мои комментарии" });
    const episodes = prefs.getByRole("switch", { name: "Новые серии из моего списка" });
    await expect(replies).toHaveAttribute("aria-checked", "true");
    await replies.click();
    await expect(prefs.getByRole("status")).toHaveText("Сохранено");
    await expect(episodes).toBeVisible();
    await episodes.focus();
    await page.keyboard.press("Space");
    await expect(episodes).toHaveAttribute("aria-checked", "false");
    await expect(prefs.getByRole("status")).toHaveText("Сохранено");

    // После перезагрузки — значения из базы.
    await page.reload();
    await expect(replies).toHaveAttribute("aria-checked", "false");
    await expect(episodes).toHaveAttribute("aria-checked", "false");

    const root = `Тихо ${unique()}`;
    await page.goto("/anime/9");
    await post(page, root);
    await expect(comment(page, root)).toBeVisible();
    await replyFromSecond(browser, "/anime/9", user, root, [`Ответ ${unique()}`]);
    await addToList(page, 9);
    expect(await releaseEpisode(request, 9, 1, user)).toEqual({ notified: 0 });

    await page.goto("/notifications");
    await expect(page.getByText("Уведомлений пока нет")).toBeVisible();
    await expect(bell(page)).toHaveAccessibleName(unreadLabel(0));
  });
});
