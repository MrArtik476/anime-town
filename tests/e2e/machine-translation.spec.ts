import { E2E_CRON_SECRET } from "./constants";
import { expect, test } from "./fixtures";

// Машинный перевод через мок DeepL (tests/mock-deepl). Переводы хранятся в памяти сервера E2E,
// поэтому тесты идут по порядку: открытие страницы → фоновое заполнение → перевод на странице.
const CRON = "/api/cron/translate";
const auth = { Authorization: `Bearer ${E2E_CRON_SECRET}` };

test.describe.serial("Машинный перевод (DeepL)", () => {
  test("фоновое заполнение защищено CRON_SECRET и проверяет параметры", async ({ request }) => {
    expect((await request.get(CRON)).status()).toBe(401);
    expect((await request.get(CRON, { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
    expect((await request.get(`${CRON}?limit=0`, { headers: auth })).status()).toBe(400);
  });

  test("страница без перевода: оригинал с пометкой, без ожидания и без перевода на лету", async ({ page, request }) => {
    // При повторном прогоне (--repeat-each) тайтл уже переведён предыдущим заполнением.
    const before = await request.get("/anime/2");
    test.skip((await before.text()).includes("Машинный перевод"), "тайтл уже переведён предыдущим прогоном");

    for (let visit = 0; visit < 2; visit++) {
      await page.goto("/anime/2");
      const description = page.getByRole("region", { name: "Описание" });
      await expect(description).toContainText("Русского описания пока нет");
      await expect(description).toContainText("Test anime 2 plot summary.");
      await expect(description.getByText(/Машинный перевод/)).toHaveCount(0);
    }
  });

  test("заполнение переводит тайтлы без описания Shikimori; повторный запуск ничего не тратит", async ({ request }) => {
    const first = await request.get(CRON, { headers: auth });
    expect(first.status()).toBe(200);
    const { report } = await first.json();
    expect(report).toMatchObject({ translator: "deepl", stopped: null });
    expect(report.candidates).toBeGreaterThan(0);
    // В отчёте — только счётчики, без текстов и ключей.
    expect(JSON.stringify(report)).not.toContain("fake-deepl-key");

    const second = await request.get(CRON, { headers: auth });
    const { report: again } = await second.json();
    expect(again).toMatchObject({ pending: 0, translated: 0, characters: 0 });
    expect(again.usage.used).toBeGreaterThan(0);
    expect(again.usage.ownLimit).toBe(450_000);
  });

  test("на странице — перевод с пометкой «Машинный перевод (DeepL)»", async ({ page }) => {
    await page.goto("/anime/2");
    const description = page.getByRole("region", { name: "Описание" });

    await expect(description.getByText("Машинный перевод (DeepL)", { exact: true })).toBeVisible();
    await expect(description).toContainText("Перевод DeepL: Test anime 2 plot summary.");
    await expect(description).toContainText("Переведено автоматически с английского описания AniList.");
    await expect(description).not.toContainText("Русского описания пока нет");
  });

  test("описание Shikimori не заменяется переводом", async ({ page }) => {
    await page.goto("/anime/1");
    const description = page.getByRole("region", { name: "Описание" });
    await expect(description).toContainText("Хоси охраняет звёздный город от тьмы.");
    await expect(description.getByRole("link", { name: "Shikimori" })).toBeVisible();
    await expect(description.getByText(/Машинный перевод/)).toHaveCount(0);
  });
});
