/** Горячие клавиши плеера. Чистая функция — проверяется unit-тестами. */
export type PlayerAction =
  | { type: "toggle-play" }
  | { type: "seek"; by: number }
  | { type: "fullscreen" }
  | { type: "mute" }
  | { type: "subtitles" };

export const SEEK_STEP = 10;

/** Клавиша → действие. null — клавиша не наша (и событие не перехватывается). Модификаторы не трогаем. */
export function shortcutFor(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): PlayerAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key.toLowerCase()) {
    case " ":
    case "k":
    case "л":
      return { type: "toggle-play" };
    case "arrowleft":
    case "j":
    case "о":
      return { type: "seek", by: -SEEK_STEP };
    case "arrowright":
    case "l":
    case "д":
      return { type: "seek", by: SEEK_STEP };
    case "f":
    case "а":
      return { type: "fullscreen" };
    case "m":
    case "ь":
      return { type: "mute" };
    case "c":
    case "с":
      return { type: "subtitles" };
    default:
      return null;
  }
}

/** Новая позиция после перемотки — в пределах ролика. */
export function seekTarget(current: number, by: number, duration: number): number {
  const end = Number.isFinite(duration) && duration > 0 ? duration : current + Math.max(by, 0);
  return Math.min(Math.max(current + by, 0), end);
}

/** Подпись качества: «720p» по высоте кадра. */
export function levelLabel(level: { height?: number; name?: string }): string {
  return level.height ? `${level.height}p` : (level.name ?? "—");
}
