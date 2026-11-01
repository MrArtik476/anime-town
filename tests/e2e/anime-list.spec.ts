import { header, input, newUser, register, status } from "./account-helpers";
import { expect, test } from "./fixtures";

// Личный список (статус и оценка) против мока Supabase: RLS «только свои строки» мок повторяет.
test.describe("Мой список", () => {
  test.describe.configure({ timeout: 60_000 });

  test("гость видит приглашение войти с возвратом на тайтл", async ({ page }) => {
    await page.goto("/anime/1");
    const login = page.getByRole("link", { name: "Войти, чтобы добавить" });
    await expect(login).toBeVisible();
    await expect(login).toHaveAttribute("href", "/login?next=%2Fanime%2F1");
  });

  test("статус и оценка сохраняются, видны в профиле, убираются из списка", async ({ page, consoleErrors }) => {
    await register(page, newUser("l"));
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText("Список пока пуст")).toBeVisible();

    await page.goto("/anime/1");
    const title = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
    await input(page, "Мой список").selectOption({ label: "Смотрю" });
    await expect(status(page).filter({ hasText: "Сохранено" })).toBeVisible();
    await input(page, "Моя оценка").selectOption("8");
    await expect(status(page).filter({ hasText: "Сохранено" })).toBeVisible();

    // После перезагрузки значения из базы.
    await page.reload();
    await expect(input(page, "Мой список")).toHaveValue("watching");
    await expect(input(page, "Моя оценка")).toHaveValue("8");

    await header(page).getByRole("link", { name: /^l_/ }).click();
    await expect(page).toHaveURL(/\/account$/);
    const watching = page.getByRole("region", { name: /Смотрю/ });
    await expect(watching.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await expect(watching.getByText("Моя оценка:")).toBeAttached();
    await expect(watching).toContainText("8");

    // Только оценка без статуса — отдельная группа; затем «Убрать из списка».
    await page.goto("/anime/1");
    await input(page, "Мой список").selectOption({ label: "Нет в списке" });
    await expect(status(page).filter({ hasText: "Сохранено" })).toBeVisible();
    await page.goto("/account");
    await expect(page.getByRole("region", { name: /Только оценка/ })).toBeVisible();

    await page.goto("/anime/1");
    await page.getByRole("button", { name: "Убрать из списка" }).click();
    await expect(status(page).filter({ hasText: "Сохранено" })).toBeVisible();
    await expect(input(page, "Мой список")).toHaveValue("");
    await expect(input(page, "Моя оценка")).toHaveValue("");
    await page.goto("/account");
    await expect(page.getByText("Список пока пуст")).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("чужой список не виден: у второго пользователя свой пустой список", async ({ page }) => {
    await register(page, newUser("a"));
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/anime/2");
    await input(page, "Мой список").selectOption({ label: "Хочу посмотреть" });
    await expect(status(page).filter({ hasText: "Сохранено" })).toBeVisible();
    await page.goto("/account");
    await expect(page.getByRole("region", { name: /Хочу посмотреть/ })).toBeVisible();
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(header(page).getByRole("link", { name: "Войти" })).toBeVisible();

    await register(page, newUser("b"));
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText("Список пока пуст")).toBeVisible();
    await page.goto("/anime/2");
    await expect(input(page, "Мой список")).toHaveValue("");
  });
});
