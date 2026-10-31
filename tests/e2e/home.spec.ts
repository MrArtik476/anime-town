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

    const popular = page.locator("section", { has: page.getByRole("heading", { name: "Популярное сейчас" }) });
    await expect(popular.getByRole("link", { name: "Смотреть все" })).toHaveAttribute("href", "/catalog?sort=trending");
    const topRated = page.locator("section", { has: page.getByRole("heading", { name: "Высокий рейтинг" }) });
    await expect(topRated.getByRole("link", { name: "Смотреть все" })).toHaveAttribute("href", "/catalog?sort=score");

    await page.getByRole("link", { name: "Весь каталог" }).first().click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole("heading", { level: 1, name: "Каталог аниме" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("«Смотреть все» у «Популярное сейчас» открывает каталог «В тренде»", async ({ page }) => {
    await page.goto("/");
    const popular = page.locator("section", { has: page.getByRole("heading", { name: "Популярное сейчас" }) });
    await popular.getByRole("link", { name: "Смотреть все" }).click();

    await expect(page).toHaveURL(/\/catalog\?sort=trending$/);
    await expect(page.getByRole("complementary", { name: "Фильтры каталога" }).getByLabel("Сортировка")).toHaveValue("trending");
    await expect(page.getByTestId("anime-card").first()).toContainText("Meteor Sprint");
  });

  test("карточка открывает страницу тайтла", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Подробнее" }).click();
    await expect(page).toHaveURL(/\/anime\/1$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Звёздный город");
  });
});
