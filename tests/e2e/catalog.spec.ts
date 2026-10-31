import { expect, test } from "./fixtures";

const cards = (page: import("@playwright/test").Page) => page.getByTestId("anime-card");
const search = (page: import("@playwright/test").Page) => page.getByLabel("Поиск по названию");
const desktopFilter = (page: import("@playwright/test").Page, label: string) =>
  page.getByRole("complementary", { name: "Фильтры каталога" }).getByLabel(label);

test.describe("Каталог", () => {
  test("первая страница и «Загрузить ещё» до конца списка", async ({ page, consoleErrors }) => {
    await page.goto("/catalog");

    await expect(cards(page)).toHaveCount(24);
    await page.getByRole("button", { name: "Загрузить ещё" }).click();
    await expect(cards(page)).toHaveCount(30);
    await expect(page.getByRole("button", { name: "Загрузить ещё" })).toHaveCount(0);
    await expect(page.getByText("Это все тайтлы по выбранным условиям.")).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("поиск с задержкой, синхронизация с URL и очистка", async ({ page }) => {
    await page.goto("/catalog");

    await search(page).pressSequentially("Star", { delay: 50 });
    await expect(page).toHaveURL(/\?q=Star$/);
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText("Звёздный город");
    await expect(page.getByRole("button", { name: /«Star»/ })).toBeVisible();

    await page.getByRole("button", { name: "Очистить поиск" }).click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(cards(page)).toHaveCount(24);
  });

  test("поиск по русскому названию из синонимов", async ({ page }) => {
    await page.goto("/catalog");
    await search(page).fill("Звёздный");
    await search(page).press("Enter");
    await expect(page).toHaveURL(/q=%D0%97/);
    await expect(cards(page)).toHaveCount(1);
  });

  test("нет результатов — сообщение и сброс", async ({ page }) => {
    await page.goto("/catalog?q=несуществующее");

    await expect(page.getByText("Ничего не найдено")).toBeVisible();
    await page.getByRole("button", { name: "Сбросить фильтры" }).click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(cards(page)).toHaveCount(24);
  });

  test("фильтры работают совместно, видны как чипсы и сбрасываются", async ({ page }) => {
    await page.goto("/catalog");

    await desktopFilter(page, "Жанр").selectOption("Fantasy");
    await expect(page).toHaveURL(/genre=Fantasy/);
    await desktopFilter(page, "Формат").selectOption("TV");
    await expect(page).toHaveURL(/genre=Fantasy&format=TV/);

    const chips = page.getByRole("group", { name: "Активные фильтры" });
    await expect(chips.getByRole("button", { name: /Фэнтези/ })).toBeVisible();
    await expect(chips.getByRole("button", { name: /TV-сериал/ })).toBeVisible();
    for (const card of await cards(page).all()) {
      await expect(card).toContainText("TV-сериал");
    }

    await chips.getByRole("button", { name: /TV-сериал/ }).click();
    await expect(page).toHaveURL(/\?genre=Fantasy$/);

    await chips.getByRole("button", { name: "Сбросить всё" }).click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(chips).toHaveCount(0);
  });

  test("сортировка по рейтингу и по числу серий", async ({ page }) => {
    await page.goto("/catalog");

    await desktopFilter(page, "Сортировка").selectOption("score");
    await expect(page).toHaveURL(/sort=score/);
    await expect(cards(page).first()).toContainText("Звёздный город");
    await expect(cards(page).first()).toContainText("9.1");

    await desktopFilter(page, "Сортировка").selectOption("episodes");
    await expect(page).toHaveURL(/sort=episodes/);
    await expect(cards(page).first()).not.toContainText("Звёздный город");
  });

  test("состояние восстанавливается из URL после перезагрузки", async ({ page }) => {
    await page.goto("/catalog?genre=Action&status=RELEASING&sort=score");
    await page.reload();

    await expect(desktopFilter(page, "Жанр")).toHaveValue("Action");
    await expect(desktopFilter(page, "Статус")).toHaveValue("RELEASING");
    await expect(desktopFilter(page, "Сортировка")).toHaveValue("score");
    await expect(page).toHaveTitle("Каталог аниме: Экшен · Anime Town");
  });

  test("неполные данные и битая обложка отображаются аккуратно", async ({ page }) => {
    await page.goto("/catalog?q=Nazo");
    const incomplete = cards(page).first();
    await expect(incomplete).toContainText("Nazo no Kage");
    await expect(incomplete.getByText(/Рейтинг/)).toHaveCount(0);
    await expect(incomplete.getByTestId("poster-fallback")).toBeVisible();

    await page.goto("/catalog?q=Broken");
    await expect(cards(page).first().getByTestId("poster-fallback")).toBeVisible();
  });

  test("сбой AniList и превышение лимита — понятные сообщения", async ({ page }) => {
    await page.goto("/catalog?q=__error__");
    await expect(page.getByRole("alert").filter({ hasText: "AniList не отвечает" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();

    await page.goto("/catalog?q=__ratelimit__");
    await expect(page.getByRole("alert").filter({ hasText: "Слишком много запросов" })).toBeVisible();
  });

  test("управление с клавиатуры: поиск и фильтр", async ({ page }) => {
    await page.goto("/catalog");
    await search(page).focus();
    await page.keyboard.type("Test Anime 1");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=Test\+Anime\+1/);

    await desktopFilter(page, "Жанр").focus();
    await expect(desktopFilter(page, "Жанр")).toBeFocused();
  });
});

test.describe("API каталога", () => {
  test("отдаёт следующую страницу и проверяет параметры", async ({ request }) => {
    const ok = await request.get("/api/catalog?genre=Action&page=1");
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(body.ok).toBe(true);
    expect(body.data.items.every((item: { genres: string[] }) => item.genres.includes("Action"))).toBe(true);

    expect((await request.get("/api/catalog?page=0")).status()).toBe(400);
    const limited = await request.get("/api/catalog?q=__ratelimit__&page=2");
    expect(limited.status()).toBe(429);
    expect(limited.headers()["retry-after"]).toBe("60");
  });
});
