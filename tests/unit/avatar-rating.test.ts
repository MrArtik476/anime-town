// @vitest-environment node
import { describe, expect, it } from "vitest";

import { AVATAR_MAX_BYTES, avatarPath, checkAvatarFile, detectImageType } from "@/features/auth/avatar";
import { toRatingSummary } from "@/features/list/rating";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map((char) => char.charCodeAt(0)));

describe("аватар: тип по первым байтам", () => {
  it("JPEG, PNG, WebP", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(detectImageType(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("всё остальное — нет (GIF, SVG, текст с «картиночным» расширением)", () => {
    expect(detectImageType(ascii("GIF89a"))).toBeNull();
    expect(detectImageType(ascii("<svg xmlns"))).toBeNull();
    expect(detectImageType(ascii("hello.png"))).toBeNull();
  });

  it("размер и пустой файл", () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(checkAvatarFile(0, null)).toEqual({ ok: false, message: "Выберите картинку" });
    expect(checkAvatarFile(AVATAR_MAX_BYTES + 1, null)).toEqual({ ok: false, message: "Картинка больше 1 МБ — уменьшите её" });
    expect(checkAvatarFile(png.length, png)).toEqual({ ok: true, type: "image/png" });
    expect(checkAvatarFile(5, ascii("hello"))).toEqual({ ok: false, message: "Подходят только JPEG, PNG и WebP" });
  });

  it("путь — папка пользователя (политики Storage)", () => {
    expect(avatarPath("0f0e-uid")).toBe("0f0e-uid/avatar");
  });
});

describe("средняя оценка зрителей", () => {
  it("среднее с одной цифрой после запятой", () => {
    expect(toRatingSummary({ score_sum: 25, score_count: 3 })).toEqual({ average: 8.3, count: 3 });
    expect(toRatingSummary({ score_sum: 10, score_count: 1 })).toEqual({ average: 10, count: 1 });
  });

  it("нет оценок — null", () => {
    expect(toRatingSummary(null)).toBeNull();
    expect(toRatingSummary({ score_sum: 0, score_count: 0 })).toBeNull();
  });
});
