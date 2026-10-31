const CYRILLIC = /[а-яё]/i;
/** Буквы украинского и белорусского алфавитов, которых нет в русском. */
const NON_RUSSIAN_CYRILLIC = /[іїєґў]/i;

/** В строке есть кириллица — такой поиск идёт через Shikimori (AniList по-русски не ищет). */
export function hasCyrillic(text: string | null | undefined): boolean {
  return !!text && CYRILLIC.test(text);
}

/** Русский текст: кириллица без украинских и белорусских букв. */
export function isRussianText(text: string | null | undefined): boolean {
  return hasCyrillic(text) && !NON_RUSSIAN_CYRILLIC.test(text ?? "");
}
