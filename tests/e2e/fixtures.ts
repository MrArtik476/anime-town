import { expect, type Page, test as base } from "@playwright/test";

// 1×1 PNG в цвете акцента — заменяет обложки CDN AniList в E2E.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4/7b+PwAIUQOYdg8rDwAAAABJRU5ErkJggg==",
  "base64",
);

/** Картинки AniList: обычные — локальный пиксель, `broken` — 404 (проверка запасного постера). */
export async function routeImages(page: Page) {
  await page.route("https://s4.anilist.co/**", (route) =>
    route.request().url().includes("broken")
      ? route.fulfill({ status: 404, body: "" })
      : route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
  );
}

type Fixtures = { consoleErrors: string[] };

let ipCounter = 0;

/**
 * Каждому тесту — свой адрес клиента: proxy.ts ограничивает запросы каталога по IP (x-forwarded-for),
 * и без этого параллельные тесты с одного 127.0.0.1 упирались бы в общий лимит.
 */
export function uniqueClientIp(workerIndex: number): string {
  ipCounter++;
  return `10.${workerIndex % 256}.${(ipCounter >> 8) % 256}.${ipCounter % 256}`;
}

export const test = base.extend<Fixtures>({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide, testInfo) => {
    await provide({ ...extraHTTPHeaders, "x-forwarded-for": uniqueClientIp(testInfo.workerIndex) });
  },
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      // 404 битой обложки — ожидаемая часть сценария, остальное считается ошибкой.
      if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await provide(errors);
  },
  page: async ({ page }, provide) => {
    await routeImages(page);
    await provide(page);
  },
});

export { expect };

/** Нет горизонтальной прокрутки страницы. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "горизонтальная прокрутка страницы").toBeLessThanOrEqual(0);
}
