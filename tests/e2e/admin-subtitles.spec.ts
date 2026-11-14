import type { APIRequestContext, Browser, Locator, Page } from "@playwright/test";

import { input, login } from "./account-helpers";
import { E2E_SUPABASE_URL } from "./constants";
import { expect, routeImages, test, uniqueClientIp } from "./fixtures";

// Субтитры в закрытом бакете subtitles (этап 6d, ADR-030) против мока Supabase: мок повторяет политики бакета
// (читать файл можно, если видна строка субтитров), настоящие проверяет npm run rls:check.
// Тайтлы 45 и 46 — только для этого файла. Тесты идут по очереди: оба считают файлы в общем бакете мока.
// Лимит — как у остальных длинных тестов админки (admin-titles, admin-moderation): при полном параллельном прогоне
// два контекста и ~20 шагов не укладывались в общие 30 с — больше всего уходило на закрытие контекста (сохранение trace).
test.describe.configure({ mode: "serial", timeout: 120_000 });

const ADMIN = { email: "admin@e2e.test", password: "Sakura-2026!" };
const VIDEO = "/media/test/master.m3u8";
const vtt = (text: string) => ({ name: "subtitles.vtt", mimeType: "text/vtt", buffer: Buffer.from(`WEBVTT\n\n00:00.000 --> 00:05.000\n${text}\n`) });
const STORED = /^\/media\/subtitles\/[0-9a-f-]{36}\.vtt$/;

async function adminPage(browser: Browser, viewport?: { width: number; height: number }): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueClientIp(96) }, ...(viewport ? { viewport } : {}) });
  const page = await context.newPage();
  await routeImages(page);
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/account$/);
  return { page, close: () => context.close() };
}

const filesInBucket = async (request: APIRequestContext) =>
  ((await (await request.get(`${E2E_SUPABASE_URL}/storage/v1/__mock/subtitles-count`)).json()) as { count: number }).count;
const status = (page: Page) => page.getByRole("main").getByRole("status");
const episodeItem = (page: Page) => page.getByRole("listitem", { name: "Серия 1", exact: true });
const fileLink = (page: Page, lang: string) => page.getByRole("link", { name: `Открыть файл субтитров ${lang}` });

/** Новая серия 1 (по умолчанию — черновик). */
async function createEpisode(page: Page, animeId: number, published: boolean) {
  await page.goto(`/admin/episodes/${animeId}`);
  await expect(page.getByText("У этого тайтла пока нет серий.")).toBeVisible();
  await page.getByRole("button", { name: "Добавить серию", exact: true }).click();
  const form = page.getByRole("form", { name: "Новая серия" });
  await input(page, "Адрес видео").fill(VIDEO);
  if (published) await input(page, "Статус прав").selectOption({ label: "Собственное видео" });
  await form.getByRole("button", { name: "Добавить серию" }).click();
  await expect(episodeItem(page)).toBeVisible();
}

async function openNewSubtitles(page: Page): Promise<Locator> {
  await episodeItem(page).getByRole("button", { name: "Добавить субтитры" }).click();
  const form = page.getByRole("form", { name: "Новые субтитры серии 1" });
  await expect(form).toBeVisible();
  // По умолчанию — файл с компьютера.
  await expect(form.getByRole("radio", { name: "С компьютера" })).toBeChecked();
  return form;
}

async function deleteEpisode(page: Page) {
  await episodeItem(page).getByRole("button", { name: "Удалить", exact: true }).click();
  await page.getByRole("group", { name: "Удаление серии 1" }).getByRole("button", { name: "Удалить серию" }).click();
  await expect(page.getByText("У этого тайтла пока нет серий.")).toBeVisible();
}

test.describe("Субтитры в закрытом хранилище", () => {
  test("загрузка с компьютера: плохой файл и повтор языка не оставляют файлов, замена и удаление убирают старый", async ({ browser, page: guest, request }) => {
    const admin = await adminPage(browser);
    const { page } = admin;
    const before = await filesInBucket(request);
    await createEpisode(page, 45, true);

    // Не WebVTT — понятная ошибка, в бакете ничего не появилось.
    const form = await openNewSubtitles(page);
    await input(page, "Файл .vtt").setInputFiles({ name: "notes.vtt", mimeType: "text/vtt", buffer: Buffer.from("Hello\n") });
    await form.getByRole("button", { name: "Добавить субтитры" }).click();
    await expect(form.getByRole("alert")).toHaveText("Это не файл WebVTT: первая строка должна быть WEBVTT");
    expect(await filesInBucket(request)).toBe(before);

    await input(page, "Файл .vtt").setInputFiles(vtt("Первая версия"));
    await form.getByRole("button", { name: "Добавить субтитры" }).click();
    await expect(status(page).filter({ hasText: "Субтитры ru сохранены" })).toBeVisible();
    await expect(fileLink(page, "ru")).toHaveText("загруженный файл");
    const firstUrl = (await fileLink(page, "ru").getAttribute("href")) ?? "";
    expect(firstUrl).toMatch(STORED);
    expect(await filesInBucket(request)).toBe(before + 1);

    // Гость: дорожка в плеере ведёт на наш адрес, файл отдаётся как text/vtt без кэша.
    await guest.goto("/anime/45/watch/1");
    await expect(guest.locator('video track[srclang="ru"]')).toHaveAttribute("src", firstUrl);
    const served = await guest.request.get(firstUrl);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toBe("text/vtt; charset=utf-8");
    expect(served.headers()["cache-control"]).toBe("private, no-store");
    expect(await served.text()).toContain("Первая версия");

    // Повтор языка: строка не сохранилась — загруженный файл удалён.
    const again = await openNewSubtitles(page);
    await input(page, "Файл .vtt").setInputFiles(vtt("Дубль"));
    await again.getByRole("button", { name: "Добавить субтитры" }).click();
    await expect(again.getByRole("alert")).toHaveText("Субтитры на этом языке уже есть");
    expect(await filesInBucket(request)).toBe(before + 1);
    await again.getByRole("button", { name: "Отмена" }).click();

    // Замена файла: новый адрес, старый файл удалён.
    await page.getByRole("button", { name: "Изменить субтитры ru" }).click();
    const edit = page.getByRole("form", { name: "Изменить субтитры ru серии 1" });
    await input(page, "Новый файл (необязательно)").setInputFiles(vtt("Вторая версия"));
    await edit.getByRole("button", { name: "Сохранить субтитры" }).click();
    await expect(status(page).filter({ hasText: "Субтитры ru сохранены" })).toBeVisible();
    await expect(fileLink(page, "ru")).not.toHaveAttribute("href", firstUrl);
    const secondUrl = (await fileLink(page, "ru").getAttribute("href")) ?? "";
    expect(secondUrl).toMatch(STORED);
    expect((await page.request.get(firstUrl)).status()).toBe(404);
    expect(await (await guest.request.get(secondUrl)).text()).toContain("Вторая версия");
    expect(await filesInBucket(request)).toBe(before + 1);

    // Изменение без нового файла сохраняет прежний.
    await page.getByRole("button", { name: "Изменить субтитры ru" }).click();
    await input(page, "Подпись в плеере").fill("Русские (полные)");
    await page.getByRole("form", { name: "Изменить субтитры ru серии 1" }).getByRole("button", { name: "Сохранить субтитры" }).click();
    await expect(status(page).filter({ hasText: "Субтитры ru сохранены" })).toBeVisible();
    await expect(fileLink(page, "ru")).toHaveAttribute("href", secondUrl);

    // Удаление субтитров удаляет и файл.
    await page.getByRole("button", { name: "Удалить субтитры ru" }).click();
    await expect(status(page).filter({ hasText: "Субтитры ru удалены" })).toBeVisible();
    expect((await page.request.get(secondUrl)).status()).toBe(404);
    expect(await filesInBucket(request)).toBe(before);

    await deleteEpisode(page);
    await admin.close();
  });

  test("файл черновика и скрытого тайтла гостю не отдаётся, администратору — да", async ({ browser, page: guest, request }) => {
    const admin = await adminPage(browser);
    const { page } = admin;
    const before = await filesInBucket(request);
    await createEpisode(page, 46, false);

    const form = await openNewSubtitles(page);
    await input(page, "Файл .vtt").setInputFiles(vtt("Секрет"));
    await form.getByRole("button", { name: "Добавить субтитры" }).click();
    await expect(status(page).filter({ hasText: "Субтитры ru сохранены" })).toBeVisible();
    const url = (await fileLink(page, "ru").getAttribute("href")) ?? "";
    expect(url).toMatch(STORED);

    // Черновик: «нет» и «нельзя» — одинаковый 404.
    expect((await guest.request.get(url)).status()).toBe(404);
    expect((await guest.request.get(url.replace(/[0-9a-f]{4}\.vtt$/, "0000.vtt"))).status()).toBe(404);
    expect((await guest.request.get("/media/subtitles/..%2Ftest%2Fsubtitles.ru.vtt")).status()).toBe(404);
    expect((await page.request.get(url)).status()).toBe(200);

    // Публикация открывает файл.
    await episodeItem(page).getByRole("button", { name: "Изменить", exact: true }).click();
    await input(page, "Статус прав").selectOption({ label: "Собственное видео" });
    await page.getByRole("form", { name: "Изменить серию 1" }).getByRole("button", { name: "Сохранить серию" }).click();
    await expect(status(page).filter({ hasText: "Серия 1 сохранена" })).toBeVisible();
    expect((await guest.request.get(url)).status()).toBe(200);

    // Скрытие тайтла закрывает файл сразу, возврат — открывает.
    await page.goto("/admin/titles/46");
    const visibility = page.getByRole("main").getByRole("region", { name: "Видимость" });
    await visibility.getByRole("button", { name: "Скрыть с сайта" }).click();
    await expect(status(page).filter({ hasText: "Тайтл скрыт" })).toBeVisible();
    expect((await guest.request.get(url)).status()).toBe(404);
    expect((await page.request.get(url)).status()).toBe(200);
    await visibility.getByRole("button", { name: "Вернуть на сайт" }).click();
    await expect(status(page).filter({ hasText: "Тайтл снова виден на сайте" })).toBeVisible();
    expect((await guest.request.get(url)).status()).toBe(200);

    // Удаление серии удаляет и её файлы.
    await page.goto("/admin/episodes/46");
    await deleteEpisode(page);
    expect((await page.request.get(url)).status()).toBe(404);
    expect(await filesInBucket(request)).toBe(before);
    await admin.close();
  });

  test("телефон 360 px: сводка и форма загрузки субтитров без горизонтальной прокрутки", async ({ browser }) => {
    const admin = await adminPage(browser, { width: 360, height: 800 });
    const { page } = admin;
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.goto("/admin");
    await expect(page.getByRole("region", { name: "Сводка по сайту" }).getByRole("listitem")).toHaveCount(6);
    await noOverflow();

    await createEpisode(page, 45, true);
    const form = await openNewSubtitles(page);
    await input(page, "Файл .vtt").setInputFiles({ ...vtt("Узкий экран"), name: `${"очень-длинное-имя-файла-субтитров".repeat(3)}.vtt` });
    await noOverflow();
    await form.getByRole("radio", { name: "По адресу" }).check();
    await expect(input(page, "Адрес файла субтитров")).toBeVisible();
    await noOverflow();
    await form.getByRole("button", { name: "Отмена" }).click();
    await deleteEpisode(page);
    await admin.close();
  });
});
