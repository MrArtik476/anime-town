const ANILIST_IMAGE_HOST = "s4.anilist.co";

/**
 * Обложки и баннеры AniList приходят готовых размеров (`large`, `extraLarge`) с CDN AniList.
 * Пропускать их через оптимизатор Vercel незачем — это лишние платные преобразования и задержка,
 * поэтому такие картинки выводятся с `unoptimized`.
 */
export function isAniListImage(src: string): boolean {
  try {
    return new URL(src).hostname === ANILIST_IMAGE_HOST;
  } catch {
    return false;
  }
}
