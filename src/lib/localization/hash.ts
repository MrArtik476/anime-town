import { createHash } from "node:crypto";

/**
 * SHA-256 английского описания AniList. Хранится рядом с машинным переводом:
 * если AniList изменил текст, хеш не совпадёт и перевод будет считаться устаревшим.
 */
export function descriptionHash(text: string): string {
  return createHash("sha256").update(text.normalize("NFC").trim()).digest("hex");
}
