/** ID AniList — положительное целое. Всё остальное сразу 404 без запроса к API. */
export function parseAnimeId(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}
