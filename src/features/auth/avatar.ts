/** Проверка файла аватара. Тип определяется по первым байтам файла, а не по заявленному браузером. */

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 1024 * 1024; // как file_size_limit бакета (миграция 20261101190000)
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

export type AvatarType = "image/jpeg" | "image/png" | "image/webp";

export function detectImageType(bytes: Uint8Array): AvatarType | null {
  const at = (index: number) => bytes[index];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => at(index) === byte)) {
    return "image/png";
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export type AvatarCheck = { ok: true; type: AvatarType } | { ok: false; message: string };

export function checkAvatarFile(size: number, bytes: Uint8Array | null): AvatarCheck {
  if (size === 0) return { ok: false, message: "Выберите картинку" };
  if (size > AVATAR_MAX_BYTES) return { ok: false, message: "Картинка больше 1 МБ — уменьшите её" };
  const type = bytes ? detectImageType(bytes) : null;
  if (!type) return { ok: false, message: "Подходят только JPEG, PNG и WebP" };
  return { ok: true, type };
}

/** Один файл на пользователя в своей папке (политики Storage пускают только в avatars/<user id>/…). */
export const avatarPath = (userId: string) => `${userId}/avatar`;
