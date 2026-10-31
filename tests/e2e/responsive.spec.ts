import { expect, expectNoHorizontalScroll, test } from "./fixtures";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-360", width: 360, height: 800 },
];

const SCREENSHOTS = "test-results/screenshots";

for (const viewport of VIEWPORTS) {
  test.describe(`Адаптивность ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    const isDesktop = viewport.width >= 1024;

    test("главная", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "Каталог" })).toBeInViewport();
      await expectNoHorizontalScroll(page);

      // Подборки: лента с прокруткой на телефоне/планшете, сетка из 6 на десктопе.
      const row = page.locator("section", { has: page.getByRole("heading", { name: "Высокий рейтинг" }) }).locator("ul");
      const scrollable = await row.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(scrollable).toBe(!isDesktop);

      await page.screenshot({ path: `${SCREENSHOTS}/home-${viewport.name}.png`, fullPage: true });
    });

    test("каталог и фильтры", async ({ page }) => {
      await page.goto("/catalog");
      await expect(page.getByTestId("anime-card")).toHaveCount(24);
      // Потоковый контент сначала лежит в скрытом контейнере — меряем сетку только после показа.
      await expect(page.getByTestId("anime-card").nth(9)).toBeVisible();
      await expectNoHorizontalScroll(page);

      const columns = await page
        .getByTestId("anime-card")
        .evaluateAll((els) => new Set(els.slice(0, 10).map((el) => Math.round(el.getBoundingClientRect().left))).size);
      expect(columns).toBe(viewport.width >= 1280 ? 5 : viewport.width >= 768 ? 4 : 2);

      if (isDesktop) {
        const sidebar = page.getByRole("complementary", { name: "Фильтры каталога" });
        await expect(sidebar).toBeVisible();
        await sidebar.getByLabel("Жанр").selectOption("Comedy");
      } else {
        await expect(page.getByRole("complementary", { name: "Фильтры каталога" })).toBeHidden();
        await page.getByRole("button", { name: /^Фильтры/ }).click();
        const sheet = page.getByRole("dialog", { name: "Фильтры" });
        await expect(sheet).toBeVisible();
        await sheet.getByLabel("Жанр").selectOption("Comedy");
        await page.screenshot({ path: `${SCREENSHOTS}/catalog-filters-${viewport.name}.png` });
        await sheet.getByRole("button", { name: "Показать" }).click();
        await expect(sheet).toBeHidden();
        await expect(page.getByRole("button", { name: /^Фильтры 1/ })).toBeVisible();
      }

      await expect(page).toHaveURL(/genre=Comedy/);
      await expect(page.getByRole("group", { name: "Активные фильтры" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: `${SCREENSHOTS}/catalog-${viewport.name}.png`, fullPage: true });
    });

    test("страница аниме", async ({ page }) => {
      await page.goto("/anime/1");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Вернуться в каталог" })).toBeInViewport();
      await expectNoHorizontalScroll(page);

      const title = await page.getByRole("heading", { level: 1 }).boundingBox();
      expect(title && title.x >= 0 && title.x + title.width <= viewport.width).toBe(true);

      await page.screenshot({ path: `${SCREENSHOTS}/anime-${viewport.name}.png`, fullPage: true });
    });
  });
}
