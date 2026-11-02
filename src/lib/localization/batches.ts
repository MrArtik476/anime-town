/** Накладные расходы JSON-тела запроса без текстов (поля языков, скобки) — с запасом. */
const BODY_OVERHEAD_BYTES = 256;

// TextEncoder вместо Buffer: модуль работает и в Edge Function (Deno).
const utf8 = new TextEncoder();

/** Сколько байт текст займёт в JSON-массиве `text` (с кавычками, экранированием и запятой). */
export function jsonTextBytes(text: string): number {
  return utf8.encode(JSON.stringify(text)).length + 1;
}

/**
 * Делит элементы на пачки для одного запроса к переводчику: не больше maxTexts текстов
 * и maxBytes байт тела. Элемент, который один не помещается в запрос, попадает в `oversized`.
 */
export function chunkForTranslation<T extends { text: string }>(
  items: T[],
  maxTexts: number,
  maxBytes: number,
): { batches: T[][]; oversized: T[] } {
  const batches: T[][] = [];
  const oversized: T[] = [];
  let current: T[] = [];
  let bytes = BODY_OVERHEAD_BYTES;

  for (const item of items) {
    const size = jsonTextBytes(item.text);
    if (size + BODY_OVERHEAD_BYTES > maxBytes) {
      oversized.push(item);
      continue;
    }
    if (current.length >= maxTexts || bytes + size > maxBytes) {
      batches.push(current);
      current = [];
      bytes = BODY_OVERHEAD_BYTES;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return { batches, oversized };
}
