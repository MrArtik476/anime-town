import type { AnimeCard, AnimeDetails } from "@/types/anime";

/**
 * Данные карточки, по которой пользователь только что перешёл (память вкладки, без хранения).
 * Пока страница тайтла грузится, её шапка рисуется из них сразу — вместо пустого скелетона.
 */
const previews = new Map<number, AnimeCard>();
const MAX_PREVIEWS = 50;

export function rememberCardPreview(card: AnimeCard) {
  previews.delete(card.id);
  previews.set(card.id, card);
  if (previews.size > MAX_PREVIEWS) previews.delete(previews.keys().next().value as number);
}

/** Шапка тайтла из данных карточки: поля, которых в карточке нет, — пустые. */
export function previewDetails(id: number): AnimeDetails | null {
  const card = previews.get(id);
  if (!card) return null;
  return {
    ...card,
    nativeTitle: null,
    romajiTitle: null,
    englishTitle: null,
    synonyms: [],
    description: null,
    bannerUrl: null,
    popularity: null,
    favourites: null,
    duration: null,
    source: null,
    startDate: null,
    endDate: null,
    studios: [],
    relations: [],
  };
}
