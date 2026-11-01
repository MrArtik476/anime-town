import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// Аккаунты против мока Supabase (tests/mock-supabase): данные в памяти мока общие для всех тестов,
// поэтому у каждого теста свои почта и ник.
let counter = 0;
function newUser(prefix = "u") {
  const id = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return { email: `${prefix}-${id}@example.com`, username: `${prefix}_${id}`.slice(0, 24), password: "Sakura-2026!" };
}

async function register(page: Page, user: { email: string; username: string; password: string }) {
  await page.goto("/register");
  await input(page, "Ник").fill(user.username);
  await input(page, "Почта").fill(user.email);
  await input(page, "Пароль").fill(user.password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
}

async function login(page: Page, email: string, password: string, path = "/login") {
  await page.goto(path);
  await input(page, "Почта").fill(email);
  await input(page, "Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}

const header = (page: Page) => page.getByRole("banner");
// Next.js 16 (Cache Components) держит прошлые страницы в DOM скрытыми (<Activity>) — getByLabel находит и их,
// поэтому поля ищем только среди видимых.
const input = (page: Page, label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true });
// В <main>: у Next.js есть свой скрытый role="alert" (объявление смены маршрута).
const alert = (page: Page) => page.getByRole("main").getByRole("alert");
const status = (page: Page) => page.getByRole("main").getByRole("status");

test.describe("Аккаунты", () => {
  // Сценарии с двумя-тремя регистрациями подряд: под полной параллельной нагрузкой 30 с бывает мало.
  test.describe.configure({ timeout: 60_000 });

  test("гость видит «Войти», а профиль ведёт на вход с возвратом", async ({ page }) => {
    await page.goto("/");
    await expect(header(page).getByRole("link", { name: "Войти" })).toBeVisible();

    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
    await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
  });

  test("регистрация создаёт профиль с ником, выход возвращает гостя", async ({ page, consoleErrors }) => {
    const user = newUser();
    await register(page, user);

    await expect(page).toHaveURL(/\/account$/);
    await expect(input(page, "Ник")).toHaveValue(user.username);
    await expect(page.getByText(user.email)).toBeVisible();
    await expect(page.getByText("Зритель")).toBeVisible();
    await expect(header(page).getByRole("link", { name: user.username })).toBeVisible();

    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(header(page).getByRole("link", { name: "Войти" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("вход: неверный пароль, затем успешный вход с возвратом на исходную страницу", async ({ page }) => {
    const user = newUser();
    await register(page, user);
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(header(page).getByRole("link", { name: "Войти" })).toBeVisible();

    await login(page, user.email, "wrong-password");
    await expect(alert(page)).toHaveText("Неверная почта или пароль");
    // Почта после ошибки не стирается.
    await expect(input(page, "Почта")).toHaveValue(user.email);

    await login(page, user.email, user.password, "/login?next=%2Fcatalog%3Fgenre%3DAction");
    await expect(page).toHaveURL(/\/catalog\?genre=Action$/);
    await expect(header(page).getByRole("link", { name: user.username })).toBeVisible();
  });

  test("next с чужим адресом игнорируется (защита от open redirect)", async ({ page }) => {
    const user = newUser();
    await register(page, user);
    await page.getByRole("button", { name: "Выйти" }).click();

    await login(page, user.email, user.password, "/login?next=%2F%2Fevil.example.com");
    await expect(page).toHaveURL(/127\.0\.0\.1:3100\/account$/);
  });

  test("проверка полей на русском и занятый ник", async ({ page }) => {
    await page.goto("/register");
    await input(page, "Ник").fill("x");
    await input(page, "Почта").fill("not-an-email");
    await input(page, "Пароль").fill("short");
    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(page.getByText("Ник — 3–24 символа: буквы, цифры и «_»")).toBeVisible();
    await expect(page.getByText("Проверьте адрес почты")).toBeVisible();
    await expect(page.getByText("Пароль — не короче 8 символов")).toBeVisible();
    await expect(input(page, "Ник")).toHaveAttribute("aria-invalid", "true");

    const first = newUser();
    await register(page, first);
    await expect(page).toHaveURL(/\/account$/);
    await page.getByRole("button", { name: "Выйти" }).click();

    // Тот же ник другим регистром — занят.
    await register(page, { ...newUser(), username: first.username.toUpperCase() });
    await expect(page.getByText("Этот ник уже занят")).toBeVisible();
  });

  test("с подтверждением почты — сообщение «проверьте письмо», войти до подтверждения нельзя", async ({ page }) => {
    const user = newUser("confirm");
    await register(page, user);
    await expect(status(page)).toContainText(`мы отправили письмо на ${user.email}`);

    await login(page, user.email, user.password);
    await expect(alert(page)).toHaveText("Подтвердите почту: ссылка — в письме после регистрации");
  });

  test("редактирование профиля: новый ник в шапке, чужой ник занят", async ({ page }) => {
    // Сначала другой пользователь занимает ник и выходит.
    const other = newUser("o");
    await register(page, other);
    await expect(page).toHaveURL(/\/account$/);
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(header(page).getByRole("link", { name: "Войти" })).toBeVisible();

    const user = newUser();
    await register(page, user);
    // Пока идёт действие, на экране ещё форма регистрации — с таким же полем «Ник».
    await expect(page).toHaveURL(/\/account$/);
    const renamed = `${user.username.slice(0, 20)}_new`;
    await input(page, "Ник").fill(renamed);
    await input(page, "Имя (необязательно)").fill("Сакура");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(status(page)).toHaveText("Профиль сохранён.");
    await expect(header(page).getByRole("link", { name: renamed })).toBeVisible();

    await input(page, "Ник").fill(other.username);
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Этот ник уже занят")).toBeVisible();
  });

  test("восстановление и смена пароля", async ({ page }) => {
    await page.goto("/forgot-password");
    await input(page, "Почта").fill("someone@example.com");
    await page.getByRole("button", { name: "Прислать ссылку" }).click();
    await expect(status(page)).toContainText("Если этот адрес зарегистрирован");

    // Смена пароля доступна только после входа.
    await page.goto("/auth/update-password");
    await expect(page).toHaveURL(/\/login\?next=%2Fauth%2Fupdate-password$/);

    const user = newUser();
    await register(page, user);
    await expect(page).toHaveURL(/\/account$/);
    await page.getByRole("link", { name: "Сменить пароль" }).click();
    await input(page, "Новый пароль").fill("New-Password-1");
    await input(page, "Повторите пароль").fill("Different-1");
    await page.getByRole("button", { name: "Сохранить пароль" }).click();
    await expect(page.getByText("Пароли не совпадают")).toBeVisible();

    await input(page, "Новый пароль").fill("New-Password-1");
    await input(page, "Повторите пароль").fill("New-Password-1");
    await page.getByRole("button", { name: "Сохранить пароль" }).click();
    await expect(status(page)).toHaveText("Пароль обновлён.");
  });

  test("неверная ссылка из письма → вход с пояснением", async ({ page }) => {
    await page.goto("/auth/callback?next=/account");
    await expect(page).toHaveURL(/\/login\?error=link$/);
    await expect(alert(page)).toContainText("Ссылка из письма недействительна");
  });
});
