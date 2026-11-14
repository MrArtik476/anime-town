/** Список без скрытых тайтлов (этап 6c). Чистая функция — общая для сервера и тестов. */
export function withoutHidden<T extends { id: number }>(items: T[], hiddenIds: number[]): T[] {
  if (hiddenIds.length === 0) return items;
  const hidden = new Set(hiddenIds);
  return items.filter((item) => !hidden.has(item.id));
}
