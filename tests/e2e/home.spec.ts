import { expect, test } from "./fixtures";

test.describe("Главная", () => {
  test("показывает подборки из AniList и ведёт в каталог", async ({ page, consoleErrors }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Anime Town — аниме-каталог: популярное, рейтинг, новинки сезона");
    // Главный тайтл — первый в тренде с баннером; русское название из синонимов.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Звёздный город");
    await expect(page.getByText("Сейчас в тренде")).toBeVisible();

    for (const title of ["Популярное сейчас", "Высокий рейтинг", "Сезонные новинки"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    expect(await page.getByTestId("anime-card").count()).toBeGreaterThan(20);

    const topRated = page.locator("section", { has: page.getByRole("heading", { name: "Высокий рейтинг" }) });
    await expect(topRated.getByRole("link", { name: "Смотреть все" })).toHaveAttribute("href", "/catalog?sort=score");

    await page.getByRole("link", { name: "Весь каталог" }).first().click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole("heading", { level: 1, name: "Каталог аниме" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("карточка открывает страницу тайтла", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Подробнее" }).click();
    await expect(page).toHaveURL(/\/anime\/1$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Звёздный город");
  });
});
