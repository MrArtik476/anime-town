/** Прогресс просмотра: проверка ввода и выбор «Продолжить просмотр». Чистые функции — unit-тесты. */

export type ProgressInput = { animeId: number; number: number; position: number; duration: number };

/** Тело POST /api/progress (данные от браузера — проверяем всё). null — неверные данные. */
export function parseProgressInput(body: unknown): ProgressInput | null {
  if (typeof body !== "object" || body === null) return null;
  const { animeId, number, position, duration } = body as Record<string, unknown>;
  const isInt = (value: unknown, max: number): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
  const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (!isInt(animeId, 999_999_999) || !isInt(number, 10_000) || !isTime(position) || !isTime(duration) || duration <= 0) {
    return null;
  }
  if (duration > 24 * 3600) return null;
  // Позиция не дальше конца серии (погрешность плеера в конце ролика).
  return { animeId, number, position: Math.round(Math.min(position, duration) * 10) / 10, duration: Math.round(duration * 10) / 10 };
}

/**
 * Позиция, с которой продолжать: не с самого начала (5 с, но не больше 10 % серии — для коротких роликов)
 * и не досмотренную серию.
 */
export function resumePosition(progress: { position: number; duration: number; completed: boolean } | null): number {
  if (!progress || progress.completed || progress.position < Math.min(5, progress.duration * 0.1)) return 0;
  return progress.position;
}

export type ProgressRow = {
  anilistId: number;
  episodeNumber: number;
  position: number;
  duration: number;
  completed: boolean;
  title: string;
  coverUrl: string | null;
  updatedAt: string;
};

export type ContinueItem = {
  anilistId: number;
  episodeNumber: number;
  /** Доля просмотренного 0–1; 0 — следующая серия, ещё не начата. */
  fraction: number;
  position: number;
  title: string;
  coverUrl: string | null;
  isNext: boolean;
};

/**
 * «Продолжить просмотр»: по каждому тайтлу — последняя тронутая серия. Не досмотрена — продолжить её;
 * досмотрена — предложить следующую (если она есть), иначе тайтл не показывается.
 * rows — свежие сверху; nextEpisode(anilistId, number) — номер следующей доступной серии или null.
 */
export function selectContinueItems(
  rows: ProgressRow[],
  nextEpisode: (anilistId: number, number: number) => number | null,
  limit = 8,
): ContinueItem[] {
  const seen = new Set<number>();
  const items: ContinueItem[] = [];
  for (const row of rows) {
    if (seen.has(row.anilistId)) continue;
    seen.add(row.anilistId);
    if (!row.completed) {
      items.push({
        anilistId: row.anilistId,
        episodeNumber: row.episodeNumber,
        fraction: Math.min(row.position / row.duration, 1),
        position: row.position,
        title: row.title,
        coverUrl: row.coverUrl,
        isNext: false,
      });
    } else {
      const next = nextEpisode(row.anilistId, row.episodeNumber);
      if (next !== null) {
        items.push({ anilistId: row.anilistId, episodeNumber: next, fraction: 0, position: 0, title: row.title, coverUrl: row.coverUrl, isNext: true });
      }
    }
    if (items.length >= limit) break;
  }
  return items;
}

/** «12:05» / «1:02:03». */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
