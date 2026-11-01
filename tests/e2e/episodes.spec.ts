import { expect, test } from "./fixtures";

// Серии против мока Supabase: у тайтла 1 — две серии с правами и одна без прав (не показывается).
test.describe("Серии на странице тайтла", () => {
  test("видны только серии с правами, со ссылками на просмотр", async ({ page }) => {
    await page.goto("/anime/1");
    const list = page.getByRole("region", { name: "Серии" });
    await expect(list.getByRole("link")).toHaveCount(2);
    await expect(list.getByRole("link", { name: /Серия 1\s*Начало/ })).toHaveAttribute("href", "/anime/1/watch/1");
    await expect(list.getByRole("link", { name: /Серия 2/ })).toHaveAttribute("href", "/anime/1/watch/2");
    await expect(list).not.toContainText("Без прав");
  });

  test("без серий — пояснение про права", async ({ page }) => {
    await page.goto("/anime/2");
    await expect(page.getByRole("region", { name: "Серии" })).toContainText("Для этого тайтла их пока нет");
  });
});
