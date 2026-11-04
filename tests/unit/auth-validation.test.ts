// @vitest-environment node
import { describe, expect, it } from "vitest";

import { authErrorMessage, GENERIC_AUTH_ERROR, isUniqueViolation } from "@/features/auth/errors";
import {
  escapeLike,
  field,
  isProtectedPath,
  rawField,
  safeNextPath,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateUsername,
} from "@/features/auth/validation";

describe("safeNextPath — защита от open redirect", () => {
  it.each(["/account", "/catalog?genre=Action", "/anime/1#top"])("%s — свой путь", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([null, "", "account", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/a\nb"])(
    "%s → путь по умолчанию",
    (path) => {
      expect(safeNextPath(path)).toBe("/account");
      expect(safeNextPath(path, "/")).toBe("/");
    },
  );
});

describe("проверка полей", () => {
  it("ник: 3–24 символа, латиница, кириллица, цифры, «_»", () => {
    for (const ok of ["abc", "Сакура_2026", "Ёжик", "a".repeat(24)]) expect(validateUsername(ok)).toBeNull();
    for (const bad of ["", "ab", "a".repeat(25), "с пробелом", "dash-name", "emoji😀"]) {
      expect(validateUsername(bad)).not.toBeNull();
    }
  });

  it("почта и пароль", () => {
    expect(validateEmail("user@example.com")).toBeNull();
    expect(validateEmail("")).toBe("Укажите почту");
    expect(validateEmail("user@")).toBe("Проверьте адрес почты");
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("1234567")).toBe("Пароль — не короче 8 символов");
    expect(validatePassword("x".repeat(73))).toBe("Пароль — не длиннее 72 символов");
    expect(validateDisplayName("x".repeat(51))).not.toBeNull();
    expect(validateDisplayName("")).toBeNull();
  });

  it("поля формы: обрезка пробелов, пароль как есть", () => {
    const data = new FormData();
    data.set("email", "  user@example.com ");
    data.set("password", " pass with spaces ");
    expect(field(data, "email")).toBe("user@example.com");
    expect(rawField(data, "password")).toBe(" pass with spaces ");
    expect(field(data, "missing")).toBe("");
  });

  it("защищённые пути и экранирование для ilike", () => {
    expect(isProtectedPath("/account")).toBe(true);
    expect(isProtectedPath("/account/x")).toBe(true);
    expect(isProtectedPath("/accounting")).toBe(false);
    expect(isProtectedPath("/notifications")).toBe(true);
    expect(isProtectedPath("/notifications/x")).toBe(true);
    expect(isProtectedPath("/notificationsx")).toBe(false);
    expect(escapeLike("a_b%c\\")).toBe("a\\_b\\%c\\\\");
  });
});

describe("ошибки Supabase Auth на русском", () => {
  it("по коду ошибки", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe("Неверная почта или пароль");
    expect(authErrorMessage({ code: "email_not_confirmed" })).toContain("Подтвердите почту");
    expect(authErrorMessage({ code: "weak_password" })).toContain("слишком простой");
  });

  it("429 без кода и неизвестные ошибки", () => {
    expect(authErrorMessage({ status: 429 })).toContain("Слишком много попыток");
    expect(authErrorMessage({ code: "something_new", status: 500 })).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
  });

  it("нарушение уникальности Postgres", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23514" })).toBe(false);
  });
});
