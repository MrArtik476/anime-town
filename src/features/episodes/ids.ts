/** Номер серии из адреса: целое 1–10000. Иначе — 404 без запросов. */
export function parseEpisodeNumber(raw: string): number | null {
  if (!/^\d{1,5}$/.test(raw)) return null;
  const number = Number(raw);
  return number >= 1 && number <= 10_000 ? number : null;
}
