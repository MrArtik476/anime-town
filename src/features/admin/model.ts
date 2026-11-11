import { isLicenseStatus, type LicenseStatus } from "@/features/player/source";

/** Чистая логика админ-панели: разбор и проверка форм, подписи, сообщения об ошибках базы. */

export const ROLES = ["user", "moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  user: "Пользователь",
  moderator: "Модератор",
  admin: "Администратор",
};

export const LICENSE_LABELS: Record<LicenseStatus, string> = {
  none: "Черновик — не показывается",
  own: "Собственное видео",
  licensed: "Лицензия",
  open_license: "Открытая лицензия",
};

export const MAX_TITLE = 300;
export const MAX_ATTRIBUTION = 500;
export const MAX_LABEL = 60;
export const MAX_EPISODE_NUMBER = 10_000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): Parsed<never> => ({ ok: false, message });

export function parseRole(raw: unknown): Role | null {
  return ROLES.find((role) => role === raw) ?? null;
}

/** id тайтла AniList из адреса или формы: положительное целое до 9 цифр. */
export function parseAnimeId(raw: unknown): number | null {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{1,9}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}

/**
 * Длительность из формы: «24:10», «1:02:03» или секунды числом. Пусто — null (не указана).
 * undefined — ввод не разобран.
 */
export function parseDuration(raw: unknown): number | null | undefined {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 && raw <= 86_400 ? raw : undefined;
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  if (!text) return null;
  const match = text.match(/^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/);
  let seconds: number;
  if (match) {
    const minutes = Number(match[2]);
    if (match[1] !== undefined && minutes > 59) return undefined;
    seconds = Number(match[1] ?? 0) * 3600 + minutes * 60 + Number(match[3]);
  } else if (/^\d{1,5}$/.test(text)) seconds = Number(text);
  else return undefined;
  return seconds > 0 && seconds <= 86_400 ? seconds : undefined;
}

/** Секунды → «мм:сс» или «ч:мм:сс» для поля формы. */
export function durationToInput(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${minutes}:${pad(seconds % 60)}`;
}

// Те же правила, что check-ограничения таблиц episodes и subtitles (миграция 20261101210000).
const HLS_URL = /^(https:\/\/|\/media\/)[^\s]*\.m3u8(\?[^\s]*)?$/;
const VTT_URL = /^(https:\/\/|\/media\/)[^\s]*\.vtt(\?[^\s]*)?$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/;
const LANG = /^[a-z]{2}(-[A-Z]{2})?$/;

const text = (raw: unknown): string | null => {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  return raw.trim() || null;
};

export type EpisodeInput = {
  number: number;
  title: string | null;
  durationSec: number | null;
  licenseStatus: LicenseStatus;
  hlsUrl: string;
  attribution: string | null;
  attributionUrl: string | null;
};

export function parseEpisodeInput(raw: unknown): Parsed<EpisodeInput> {
  if (!raw || typeof raw !== "object") return fail("Неверные данные");
  const source = raw as Record<string, unknown>;

  const number = typeof source.number === "string" ? Number(source.number.trim() || NaN) : source.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > MAX_EPISODE_NUMBER) {
    return fail(`Номер серии — целое число от 1 до ${MAX_EPISODE_NUMBER}`);
  }
  const title = text(source.title);
  if (title && title.length > MAX_TITLE) return fail(`Название — не длиннее ${MAX_TITLE} символов`);
  const durationSec = parseDuration(source.duration);
  if (durationSec === undefined) return fail("Длительность — в виде 24:10, 1:02:03 или числом секунд");
  if (!isLicenseStatus(source.licenseStatus)) return fail("Выберите статус прав");
  const hlsUrl = text(source.hlsUrl);
  if (!hlsUrl || !HLS_URL.test(hlsUrl)) return fail("Адрес видео — плейлист .m3u8: https://… или /media/…");
  const attribution = text(source.attribution);
  if (attribution && attribution.length > MAX_ATTRIBUTION) return fail(`Атрибуция — не длиннее ${MAX_ATTRIBUTION} символов`);
  if (source.licenseStatus === "open_license" && !attribution) return fail("Для открытой лицензии укажите атрибуцию (автор и лицензия)");
  const attributionUrl = text(source.attributionUrl);
  if (attributionUrl && !HTTPS_URL.test(attributionUrl)) return fail("Ссылка на источник должна начинаться с https://");

  return { ok: true, value: { number, title, durationSec, licenseStatus: source.licenseStatus, hlsUrl, attribution, attributionUrl } };
}

export type SubtitleInput = { lang: string; label: string; url: string; isDefault: boolean };

export function parseSubtitleInput(raw: unknown): Parsed<SubtitleInput> {
  if (!raw || typeof raw !== "object") return fail("Неверные данные");
  const source = raw as Record<string, unknown>;
  const lang = text(source.lang);
  if (!lang || !LANG.test(lang)) return fail("Язык — код из двух букв: ru, en или pt-BR");
  const label = text(source.label);
  if (!label || label.length > MAX_LABEL) return fail(`Подпись — от 1 до ${MAX_LABEL} символов`);
  const url = text(source.url);
  if (!url || !VTT_URL.test(url)) return fail("Адрес субтитров — файл .vtt: https://… или /media/…");
  return { ok: true, value: { lang, label, url, isDefault: source.isDefault === true } };
}

/**
 * Строка поиска по нику → шаблон ilike. В нике только буквы, цифры и «_» — остальное отбрасывается,
 * «_» экранируется (в шаблоне это «любой символ»). null — искать нечего.
 */
export function userSearchPattern(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(/[^A-Za-z0-9_А-Яа-яЁё]/g, "").slice(0, 24);
  return clean ? `%${clean.replace(/_/g, "\\_")}%` : null;
}

export type AdminTable = "episodes" | "subtitles" | "admin_actions";
type DbError = { code?: string; message?: string } | null | undefined;

const ROLE_ERRORS: Record<string, string> = {
  own_role: "Свою роль менять нельзя",
  role_unchanged: "У пользователя уже эта роль",
  user_not_found: "Пользователь не найден",
};

/** Ошибка базы → сообщение на русском. */
export function adminErrorMessage(error: DbError, table: AdminTable): string {
  switch (error?.code) {
    case "23505":
      return table === "subtitles" ? "Субтитры на этом языке уже есть" : "Серия с таким номером уже есть";
    case "23514":
      return "База отклонила данные — проверьте поля";
    case "42501":
      return "Недостаточно прав";
    case "PT422":
      return ROLE_ERRORS[error.message ?? ""] ?? "Это действие недоступно";
    default:
      return "Не получилось — попробуйте ещё раз";
  }
}

export type TitleSummary = { animeId: number; total: number; published: number };

/** Серии, сгруппированные по тайтлам: сколько всего и сколько опубликовано. Сначала тайтлы с черновиками. */
export function summarizeTitles(rows: { anilist_id: number; license_status: string }[]): TitleSummary[] {
  const byAnime = new Map<number, TitleSummary>();
  for (const row of rows) {
    const item = byAnime.get(row.anilist_id) ?? { animeId: row.anilist_id, total: 0, published: 0 };
    item.total += 1;
    if (row.license_status !== "none") item.published += 1;
    byAnime.set(row.anilist_id, item);
  }
  return [...byAnime.values()].sort(
    (a, b) => Number(b.total > b.published) - Number(a.total > a.published) || a.animeId - b.animeId,
  );
}
