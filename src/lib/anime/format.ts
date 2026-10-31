import type { FuzzyDate, MediaFormat, MediaSeason, MediaStatus } from "@/lib/anilist/types";

export const FORMAT_LABELS: Record<MediaFormat, string> = {
  TV: "TV-сериал",
  TV_SHORT: "Короткий сериал",
  MOVIE: "Фильм",
  OVA: "OVA",
  ONA: "ONA",
  SPECIAL: "Спешл",
};

export const STATUS_LABELS: Record<MediaStatus, string> = {
  RELEASING: "Выходит",
  FINISHED: "Завершён",
  NOT_YET_RELEASED: "Анонс",
  CANCELLED: "Отменён",
  HIATUS: "Приостановлен",
};

export const SEASON_LABELS: Record<MediaSeason, string> = {
  WINTER: "Зима",
  SPRING: "Весна",
  SUMMER: "Лето",
  FALL: "Осень",
};

const GENRE_LABELS: Record<string, string> = {
  Action: "Экшен",
  Adventure: "Приключения",
  Comedy: "Комедия",
  Drama: "Драма",
  Ecchi: "Этти",
  Fantasy: "Фэнтези",
  Horror: "Ужасы",
  "Mahou Shoujo": "Махо-сёдзё",
  Mecha: "Меха",
  Music: "Музыка",
  Mystery: "Детектив",
  Psychological: "Психологическое",
  Romance: "Романтика",
  "Sci-Fi": "Научная фантастика",
  "Slice of Life": "Повседневность",
  Sports: "Спорт",
  Supernatural: "Сверхъестественное",
  Thriller: "Триллер",
};

const SOURCE_LABELS: Record<string, string> = {
  ORIGINAL: "Оригинальная история",
  MANGA: "Манга",
  LIGHT_NOVEL: "Ранобэ",
  VISUAL_NOVEL: "Визуальная новелла",
  VIDEO_GAME: "Видеоигра",
  OTHER: "Другое",
  NOVEL: "Роман",
  DOUJINSHI: "Додзинси",
  ANIME: "Аниме",
  WEB_NOVEL: "Веб-роман",
  LIVE_ACTION: "Игровое кино",
  GAME: "Игра",
  COMIC: "Комикс",
  MULTIMEDIA_PROJECT: "Мультимедийный проект",
  PICTURE_BOOK: "Книга с иллюстрациями",
};

const RELATION_LABELS: Record<string, string> = {
  ADAPTATION: "Адаптация",
  PREQUEL: "Предыстория",
  SEQUEL: "Продолжение",
  PARENT: "Основная история",
  SIDE_STORY: "Побочная история",
  CHARACTER: "Общие персонажи",
  SUMMARY: "Пересказ",
  ALTERNATIVE: "Альтернативная версия",
  SPIN_OFF: "Спин-офф",
  OTHER: "Другое",
  SOURCE: "Первоисточник",
  COMPILATION: "Компиляция",
  CONTAINS: "Содержит",
};

const RELATED_FORMAT_LABELS: Record<string, string> = {
  ...FORMAT_LABELS,
  MUSIC: "Музыкальное видео",
  MANGA: "Манга",
  NOVEL: "Ранобэ",
  ONE_SHOT: "Ваншот",
};

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export const formatFormat = (format: string | null | undefined) =>
  format ? (RELATED_FORMAT_LABELS[format] ?? null) : null;

export const formatStatus = (status: MediaStatus | null | undefined) =>
  status ? (STATUS_LABELS[status] ?? null) : null;

export const formatSeason = (season: MediaSeason | null | undefined) =>
  season ? (SEASON_LABELS[season] ?? null) : null;

export const formatGenre = (genre: string) => GENRE_LABELS[genre] ?? genre;

export const formatSource = (source: string | null | undefined) =>
  source ? (SOURCE_LABELS[source] ?? null) : null;

export const formatRelation = (relation: string | null | undefined) =>
  relation ? (RELATION_LABELS[relation] ?? null) : null;

/** 87 → «8.7». Оценки вне 1–100 считаются отсутствующими. */
export function formatScore(score: number | null | undefined): string | null {
  if (typeof score !== "number" || score <= 0 || score > 100) return null;
  return (score / 10).toFixed(1);
}

const numberFormatter = new Intl.NumberFormat("ru-RU");

export function formatNumber(value: number | null | undefined): string | null {
  return typeof value === "number" && value > 0 ? numberFormatter.format(value) : null;
}

/** Склонение: plural(5, ["серия", "серии", "серий"]) → «серий». */
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function formatEpisodes(episodes: number | null | undefined): string | null {
  if (typeof episodes !== "number" || episodes <= 0) return null;
  return `${episodes} ${plural(episodes, ["серия", "серии", "серий"])}`;
}

export function formatDuration(minutes: number | null | undefined): string | null {
  if (typeof minutes !== "number" || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

const MONTHS_NOMINATIVE = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

/** FuzzyDate AniList может быть неполной: «2024», «март 2024», «12 марта 2024». */
export function formatFuzzyDate(date: FuzzyDate | null | undefined): string | null {
  if (!date?.year) return null;
  const index = (date.month ?? 0) - 1;
  if (index < 0 || index > 11) return String(date.year);
  if (date.day) return `${date.day} ${MONTHS_GENITIVE[index]} ${date.year}`;
  return `${MONTHS_NOMINATIVE[index]} ${date.year}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  times: "×",
};

/**
 * Декодирует HTML-сущности за один проход: именованные (&hellip;, &ndash; …) и числовые (&#39;, &#x27;).
 * Один проход важен: `&amp;lt;` должен стать текстом `&lt;`, а не `<`. Неизвестные сущности остаются как есть.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

/** Хвосты-атрибуции в конце строки: «(Source: Crunchyroll)», «[Written by MAL Rewrite]». */
const ATTRIBUTION = /[ \t]*[([]\s*(?:source|written by)\b[^)\]\n]*[)\]][ \t]*(?=\n|$)/gi;

/** Описание AniList приходит с тегами <br>, <i>, <b> и HTML-сущностями — превращаем в чистый текст. */
export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = decodeEntities(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(ATTRIBUTION, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}
