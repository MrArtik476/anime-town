import type { Page } from "@playwright/test";

import { newUser, register, status } from "./account-helpers";
import { expect, test } from "./fixtures";

// Прогресс просмотра на тестовом ролике (6 с) против мока Supabase.
const video = (page: Page) => page.locator("video").filter({ visible: true });

async function ready(page: Page) {
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
}

/** Перемотать на позицию и поставить на паузу — плеер сохраняет прогресс на паузе. */
async function pauseAt(page: Page, seconds: number) {
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/progress") && r.request().method() === "POST");
  await video(page).evaluate(async (v: HTMLVideoElement, at) => {
    v.muted = true;
    v.currentTime = at;
    await v.play();
    v.pause();
  }, seconds);
  expect((await saved).status()).toBe(204);
}

test.describe("Прогресс просмотра", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    // Без автоперехода: ролик короткий, проверяем позицию в пределах серии.
    await page.addInitScript(() => window.localStorage.setItem("anime-town:autoplay-next", "off"));
  });

  test("позиция сохраняется и восстанавливается; «С начала»; блок «Продолжить просмотр»", async ({ page }) => {
    await register(page, newUser("pr"));
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/anime/1/watch/1");
    await ready(page);
    await pauseAt(page, 3);

    await page.reload();
    await expect(status(page).filter({ hasText: "Продолжаем с 0:03" })).toBeVisible();
    await ready(page);
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(3);

    await page.getByRole("button", { name: "С начала" }).click();
    await expect(status(page).filter({ hasText: "Продолжаем с" })).toHaveCount(0);
    await ready(page);
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(0);

    await page.goto("/");
    const block = page.getByRole("region", { name: "Продолжить просмотр" });
    await expect(block.getByRole("link", { name: /Серия 1 · 0:03/ })).toHaveAttribute("href", "/anime/1/watch/1");
    await expect(block.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

    // Досмотрели серию 1 → предлагается следующая.
    await page.goto("/anime/1/watch/1");
    await ready(page);
    await pauseAt(page, 5.9);
    await page.goto("/account");
    await expect(page.getByRole("region", { name: "Продолжить просмотр" }).getByRole("link", { name: /Следующая: серия 2/ })).toHaveAttribute(
      "href",
      "/anime/1/watch/2",
    );
  });

  test("гость: прогресс не отправляется, блока нет; /api/progress защищён", async ({ page, request }) => {
    const posts: string[] = [];
    page.on("request", (r) => r.url().endsWith("/api/progress") && posts.push(r.method()));
    await page.goto("/anime/1/watch/1");
    await ready(page);
    await video(page).evaluate(async (v: HTMLVideoElement) => {
      v.muted = true;
      v.currentTime = 2;
      await v.play();
      v.pause();
    });
    await page.waitForTimeout(500);
    expect(posts).toEqual([]);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Продолжить просмотр" })).toHaveCount(0);

    const body = { animeId: 1, number: 1, position: 1, duration: 6 };
    const base = "http://127.0.0.1:3100";
    expect((await request.post("/api/progress", { data: body })).status()).toBe(403); // без Origin
    expect((await request.post("/api/progress", { data: body, headers: { Origin: "https://evil.example" } })).status()).toBe(403);
    expect((await request.post("/api/progress", { data: { ...body, position: -1 }, headers: { Origin: base } })).status()).toBe(400);
    expect((await request.post("/api/progress", { data: body, headers: { Origin: base } })).status()).toBe(401);
  });
});
