import { expect, test } from "./fixtures";

test.describe("Страница аниме", () => {
  test("показывает данные тайтла, жанры и связанные произведения", async ({ page, consoleErrors }) => {
    await page.goto("/anime/1");

    await expect(page).toHaveTitle("Звёздный город · Anime Town");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Звёздный город");
    await expect(page.getByText("Hoshi no Machi · Star Town · 星の町")).toBeVisible();
    await expect(page.getByText("Хоси охраняет звёздный город от тьмы.")).toBeVisible();

    const facts = page.getByRole("region", { name: "Информация" });
    for (const [label, value] of [
      ["Формат", "TV-сериал"],
      ["Статус", "Выходит"],
      ["Студия", "Studio Test"],
      ["Первоисточник", "Манга"],
      ["Длительность серии", "24 мин"],
      ["Рейтинг AniList", "9.1 из 10"],
    ]) {
      await expect(facts.getByText(label, { exact: true }).locator("..")).toContainText(value);
    }

    await expect(page.getByRole("heading", { name: "Другие названия" })).toBeVisible();
    await expect(page.getByText("Hoshimachi")).toBeVisible();

    const relations = page.getByRole("region", { name: "Связанные произведения" });
    await expect(relations.getByRole("link", { name: /Продолжение/ })).toHaveAttribute("href", "/anime/2");
    // Манга показана справочно — без ссылки.
    await expect(relations.getByText("Hoshi no Machi (Manga)")).toBeVisible();
    await expect(relations.getByRole("link", { name: /Manga/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Фэнтези" }).click();
    await expect(page).toHaveURL(/\/catalog\?genre=Fantasy$/);
    expect(consoleErrors).toEqual([]);
  });

  test("переход из каталога и возврат с теми же фильтрами", async ({ page }) => {
    await page.goto("/catalog?genre=Fantasy&sort=score");
    await page.getByTestId("anime-card").first().click();
    await expect(page).toHaveURL(/\/anime\/\d+$/);

    await page.getByRole("link", { name: "Вернуться в каталог" }).click();
    await expect(page).toHaveURL(/\/catalog\?genre=Fantasy&sort=score$/);
    await expect(page.getByRole("button", { name: /Фэнтези/ })).toBeVisible();
  });

  test("отсутствующие данные — аккуратные заглушки", async ({ page }) => {
    await page.goto("/anime/3");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nazo no Kage");
    await expect(page.getByText("Описание пока не добавлено.")).toBeVisible();
    expect(await page.getByText("Нет данных").count()).toBeGreaterThan(3);
    await expect(page.getByTestId("poster-fallback")).toBeVisible();
  });

  test("несуществующий и некорректный ID — страница «не найдено»", async ({ page }) => {
    await page.goto("/anime/999999");
    await expect(page.getByRole("heading", { name: "Аниме не найдено" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);

    await page.goto("/anime/abc");
    await expect(page.getByRole("heading", { name: "Аниме не найдено" })).toBeVisible();
    await page.getByRole("link", { name: "Перейти в каталог" }).click();
    await expect(page).toHaveURL(/\/catalog$/);
  });

  test("сбой AniList — сообщение с повтором", async ({ page }) => {
    await page.goto("/anime/500500");
    await expect(page.getByRole("alert").filter({ hasText: "AniList не отвечает" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
  });
});
