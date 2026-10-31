import { expect, test } from "./fixtures";

// Русский контент: моки Shikimori и переводчика — tests/mock-shikimori, переводы хранятся в памяти процесса.

test.describe("Русский контент", () => {
  test("описание с Shikimori: без BB-кодов, с атрибуцией и русскими синонимами", async ({ page, consoleErrors }) => {
    await page.goto("/anime/1");

    const description = page.getByRole("region", { name: "Описание" });
    await expect(description).toContainText("Хоси охраняет звёздный город от тьмы.");
    await expect(description).toContainText("Вторая строка русского описания.");
    await expect(description).not.toContainText("[character");
    await expect(description.getByRole("link", { name: "Shikimori" })).toHaveAttribute(
      "href",
      "https://shikimori.io/animes/1001-hoshi-no-machi",
    );
    await expect(description.getByText("Машинный перевод")).toHaveCount(0);

    await expect(page.getByRole("region", { name: "Другие названия" })).toContainText("Хосимати");
    expect(consoleErrors).toEqual([]);
  });

  test("нет описания на Shikimori: сначала оригинал с пометкой, затем машинный перевод", async ({ page }) => {
    await page.goto("/anime/2");

    // Название — с Shikimori, английское становится альтернативным.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Звёздный город 2");
    await expect(page.getByText(/Star Town Season 2/).first()).toBeVisible();

    const description = page.getByRole("region", { name: "Описание" });
    const machineLabel = description.getByText("Машинный перевод", { exact: true });
    // Переводы живут в памяти сервера: при повторном прогоне (--repeat-each) тайтл уже переведён.
    if (!(await machineLabel.isVisible())) {
      await expect(description).toContainText("Русского описания пока нет");
      await expect(description).toContainText("Test anime 2 plot summary.");
      await expect(description.getByText("Описание: AniList.")).toBeVisible();
    }

    // Перевод выполняется в фоне после ответа (after) и сохраняется; следующий показ — уже на русском.
    await expect(async () => {
      await page.reload();
      await expect(machineLabel).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await expect(description).toContainText("Переведённое описание: Test anime 2 plot summary.");
    await expect(description).toContainText("Переведено автоматически с английского описания AniList.");
    await expect(description).not.toContainText("Русского описания пока нет");
  });

  test("поиск «Атака титанов» находит тайтл, которого AniList по-русски не знает", async ({ page }) => {
    await page.goto("/catalog");
    await page.getByLabel("Поиск по названию").fill("Атака титанов");
    await page.getByLabel("Поиск по названию").press("Enter");

    await expect(page).toHaveURL(/q=%D0%90%D1%82%D0%B0%D0%BA%D0%B0/);
    const cards = page.getByTestId("anime-card");
    // На Shikimori два совпадения, но второго тайтла нет в AniList — показывается один.
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Атака титанов");
    await expect(cards.first()).toContainText("Attack on Titan");

    await cards.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Атака титанов");
    await expect(page.getByRole("region", { name: "Описание" })).toContainText("С давних времён человечество ведёт борьбу с титанами.");
  });

  test("главная: анонс главного тайтла на русском с источником", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/Хоси охраняет звёздный город от тьмы/)).toBeVisible();
    await expect(page.getByText("Описание: Shikimori")).toBeVisible();
  });
});
