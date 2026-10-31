/**
 * Описания Shikimori размечены BB-кодами: [character=123]Имя[/character], [anime=5]…[/anime], [i]…[/i],
 * [url=…]…[/url], [br]. Оставляем только текст: теги снимаем, содержимое сохраняем, [br] — перенос строки.
 * Блоки [spoiler] и служебные [source] удаляются целиком.
 */
export function cleanShikimoriText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\[(spoiler|source)(?:=[^\]]*)?\][\s\S]*?\[\/\1\]/gi, "")
    .replace(/\[br\]/gi, "\n")
    .replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}
