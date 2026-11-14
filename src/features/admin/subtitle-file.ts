/**
 * Файлы субтитров в закрытом бакете subtitles (этап 6d, ADR-030). Чистые функции: проверка файла WebVTT
 * и имена объектов. Адрес файла на сайте — /media/subtitles/<uuid>.vtt (Route Handler), он проходит
 * check-ограничение subtitles.url.
 */

export const SUBTITLE_BUCKET = "subtitles";
export const SUBTITLE_PREFIX = "/media/subtitles/";
/** Тот же лимит, что file_size_limit бакета. */
export const MAX_SUBTITLE_BYTES = 524_288;

const OBJECT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.vtt$/;
const BOM = [0xef, 0xbb, 0xbf];
// После «WEBVTT» по спецификации — пробел, таб, перевод строки или конец файла.
const HEADER = /^WEBVTT(?:[ \t\r\n]|$)/;

export type VttCheck = { ok: true; text: string } | { ok: false; message: string };

/** Файл годится для бакета: не пустой, не больше 512 КБ, UTF-8, первая строка — WEBVTT (BOM убирается). */
export function checkVttFile(bytes: Uint8Array): VttCheck {
  if (bytes.length === 0) return { ok: false, message: "Выберите файл субтитров" };
  if (bytes.length > MAX_SUBTITLE_BYTES) return { ok: false, message: "Файл субтитров — не больше 512 КБ" };
  const body = BOM.every((byte, index) => bytes[index] === byte) ? bytes.subarray(BOM.length) : bytes;
  let text: string;
  try {
    // ignoreBOM: BOM уже снят выше, второй не пропускаем молча.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
  } catch {
    return { ok: false, message: "Файл субтитров — в кодировке UTF-8" };
  }
  if (!HEADER.test(text)) return { ok: false, message: "Это не файл WebVTT: первая строка должна быть WEBVTT" };
  return { ok: true, text };
}

/** Новое случайное имя объекта: адрес не угадать, и он не раскрывает серию. */
export const newSubtitleObjectName = () => `${crypto.randomUUID()}.vtt`;

export const subtitleUrl = (name: string) => `${SUBTITLE_PREFIX}${name}`;

/** Имя объекта из адреса запроса — только наш формат, иначе null (без «..», «/» и кодирования). */
export const parseSubtitleObjectName = (raw: string): string | null => (OBJECT_NAME.test(raw) ? raw : null);

/** Имя объекта, если адрес субтитров ведёт в наш бакет; внешние и тестовые адреса — null. */
export function storedObjectName(url: string | null): string | null {
  if (!url?.startsWith(SUBTITLE_PREFIX)) return null;
  return parseSubtitleObjectName(url.slice(SUBTITLE_PREFIX.length));
}
