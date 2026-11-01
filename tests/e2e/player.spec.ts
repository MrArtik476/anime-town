import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// Плеер на собственном тестовом ролике public/media/test (6 с, 360p/180p, субтитры ru/en) — мок Supabase:
// у тайтла 1 серии 1 и 2 с правами, серия 3 — без прав.
// Next.js держит прошлые страницы скрытыми (<Activity>) — работаем только с видимым видео.
const video = (page: Page) => page.locator("video").filter({ visible: true });
const prop = <T,>(page: Page, fn: (v: HTMLVideoElement) => T) => video(page).evaluate(fn);

async function ready(page: Page) {
  await expect.poll(() => prop(page, (v) => v.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await video(page).evaluate((v: HTMLVideoElement) => (v.muted = true)); // автовоспроизведение со звуком браузер не даст
}

test.describe("Плеер", () => {
  test.describe.configure({ timeout: 60_000 });

  // Ролик длится 6 с: без этого автопереход уводил бы на следующую серию посреди проверок.
  test.beforeEach(async ({ page }, testInfo) => {
    if (!testInfo.title.includes("автопереход")) {
      await page.addInitScript(() => window.localStorage.setItem("anime-town:autoplay-next", "off"));
    }
  });

  test("со страницы тайтла открывается серия: заголовок, видео, атрибуция", async ({ page, consoleErrors }) => {
    await page.goto("/anime/1");
    await page.getByRole("region", { name: "Серии" }).getByRole("link", { name: /Серия 1/ }).click();
    await expect(page).toHaveURL(/\/anime\/1\/watch\/1$/);
    await expect(page.getByText("Серия 1 · Начало")).toBeVisible();
    await ready(page);
    await expect(page.getByText("Собственное видео")).toBeVisible();
    await expect(page.getByRole("link", { name: "Серия 1", exact: false }).and(page.locator('[aria-current="page"]'))).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("качество: Авто, 360p, 180p — переключение меняет кадр", async ({ page }) => {
    await page.goto("/anime/1/watch/1");
    await ready(page);
    const quality = page.getByLabel("Качество");
    await expect(quality.locator("option")).toHaveText(["Авто", "360p", "180p"]);
    await quality.selectOption({ label: "180p" });
    await video(page).evaluate((v: HTMLVideoElement) => v.play());
    await expect.poll(() => prop(page, (v) => v.videoHeight), { timeout: 15_000 }).toBe(180);
    await quality.selectOption({ label: "360p" });
    // Ролик короткий: перематываем в начало, чтобы новые кадры шли уже в 360p.
    await video(page).evaluate(async (v: HTMLVideoElement) => {
      v.currentTime = 0;
      await v.play();
    });
    await expect.poll(() => prop(page, (v) => v.videoHeight), { timeout: 15_000 }).toBe(360);
  });

  test("субтитры: русские по умолчанию, переключение и выключение", async ({ page }) => {
    await page.goto("/anime/1/watch/1");
    await ready(page);
    const showing = () => prop(page, (v) => Array.from(v.textTracks).filter((t) => t.mode === "showing").map((t) => t.language));
    await expect.poll(showing).toEqual(["ru"]);
    await page.getByLabel("Субтитры").selectOption({ label: "English" });
    await expect.poll(showing).toEqual(["en"]);
    await page.getByLabel("Субтитры").selectOption({ label: "Выключены" });
    await expect.poll(showing).toEqual([]);
  });

  test("горячие клавиши: пауза и перемотка", async ({ page }) => {
    await page.goto("/anime/1/watch/1");
    await ready(page);
    await video(page).focus();
    await page.keyboard.press("k");
    await expect.poll(() => prop(page, (v) => v.paused)).toBe(false);
    await page.keyboard.press("k");
    await expect.poll(() => prop(page, (v) => v.paused)).toBe(true);
    await video(page).evaluate((v: HTMLVideoElement) => (v.currentTime = 1));
    await page.keyboard.press("ArrowRight");
    // +10 с упирается в конец ролика (6 с).
    await expect.poll(() => prop(page, (v) => Math.round(v.currentTime))).toBe(6);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => prop(page, (v) => Math.round(v.currentTime))).toBe(0);
  });

  test("в конце — следующая серия: отсчёт и автопереход", async ({ page }) => {
    await page.goto("/anime/1/watch/1");
    await ready(page);
    await video(page).evaluate(async (v: HTMLVideoElement) => {
      v.currentTime = Math.max(v.duration - 0.3, 0);
      await v.play();
    });
    const overlay = page.getByRole("status").filter({ hasText: "Следующая серия" });
    await expect(overlay).toContainText("Серия 2 · Продолжение");
    await expect(overlay).toContainText(/Начнётся через \d с/);
    await expect(page).toHaveURL(/\/anime\/1\/watch\/2$/, { timeout: 15_000 });
    // Последняя серия — «Следующая» не предлагается.
    await expect(page.getByLabel("Автопереход к следующей серии").filter({ visible: true })).toHaveCount(0);
  });

  test("серия без прав и несуществующая — «Серия недоступна»", async ({ page }) => {
    for (const path of ["/anime/1/watch/3", "/anime/1/watch/99", "/anime/1/watch/abc"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Серия недоступна" })).toBeVisible();
      await expect(page.locator("video")).toHaveCount(0);
    }
  });

  test("на телефоне (390 px) страница серии без горизонтальной прокрутки", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/anime/1/watch/1");
    await ready(page);
    // Длинное название серии в списке (обрезается многоточием) не должно растягивать сетку страницы.
    await page.evaluate(() => {
      const title = document.querySelector("aside li a span:nth-child(2)");
      if (title) title.textContent = "Очень длинное название серии, которое не помещается в строку ".repeat(4);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
