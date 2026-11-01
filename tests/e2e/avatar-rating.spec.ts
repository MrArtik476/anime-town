import { header, input, newUser, register, status } from "./account-helpers";
import { expect, test } from "./fixtures";

// 1×1 PNG (настоящие первые байты PNG — сервер проверяет тип по ним).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4/7b+PwAIUQOYdg8rDwAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("Аватар и оценка зрителей", () => {
  test.describe.configure({ timeout: 60_000 });

  test("аватар: проверка типа, загрузка в шапку и профиль, удаление", async ({ page }) => {
    const user = newUser("av");
    await register(page, user);
    await expect(page).toHaveURL(/\/account$/);

    // Текст под видом картинки — отказ по содержимому файла.
    await input(page, "Аватар").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await page.getByRole("button", { name: "Загрузить аватар" }).click();
    await expect(page.getByText("Подходят только JPEG, PNG и WebP")).toBeVisible();

    await input(page, "Аватар").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Загрузить аватар" }).click();
    await expect(status(page).filter({ hasText: "Аватар обновлён." })).toBeVisible();
    const avatar = header(page).getByRole("link", { name: user.username }).locator("img");
    await expect(avatar).toHaveAttribute("src", /\/storage\/v1\/object\/public\/avatars\/.+\/avatar\?v=\d+/);
    // Картинка действительно отдаётся из хранилища.
    const src = await avatar.getAttribute("src");
    expect((await page.request.get(src!)).status()).toBe(200);

    await page.getByRole("button", { name: "Удалить аватар" }).click();
    await expect(status(page).filter({ hasText: "Аватар удалён." })).toBeVisible();
    await expect(header(page).getByRole("link", { name: user.username }).locator("img")).toHaveCount(0);
  });

  test("средняя оценка зрителей обновляется после своей оценки", async ({ page }) => {
    await register(page, newUser("rt"));
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/anime/3");
    const card = page.getByRole("region", { name: "Оценка зрителей Anime Town" });
    await expect(card).toBeVisible();
    const before = (await card.textContent()) ?? "";

    await input(page, "Моя оценка").selectOption("10");
    await expect(status(page).filter({ hasText: "Сохранено" })).toBeVisible();
    // Своя оценка учтена сразу (updateTag + refresh), не через 5 минут.
    await expect(card).not.toHaveText(before);
    await expect(card).toContainText(/\d,\d\s*из 10 · \d+ оцен/);
  });
});
