/**
 * Источник видео — ЕДИНСТВЕННОЕ место, где серия превращается в адрес для плеера (ADR-022).
 * Сейчас: HLS-плейлисты с открытой лицензией или собственные тестовые ролики (`/media/test/…`).
 * На этапе 8 сюда подключается выбранный легальный источник (подписанные ссылки Storage/CDN и т. п.)
 * или режим «каталог + трейлеры AniList + ссылки на легальные площадки» — остальной код не меняется.
 */

export const LICENSE_STATUSES = ["licensed", "own", "open_license", "none"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export type EpisodeSourceInput = {
  hlsUrl: string;
  licenseStatus: LicenseStatus;
  attribution: string | null;
  attributionUrl: string | null;
};

export type PlaybackSource = {
  kind: "hls";
  url: string;
  license: Exclude<LicenseStatus, "none">;
  attribution: { text: string; url: string | null } | null;
};

const ALLOWED_URL = /^(https:\/\/|\/media\/)[^\s]*\.m3u8(\?[^\s]*)?$/;

export function isLicenseStatus(value: unknown): value is LicenseStatus {
  return typeof value === "string" && (LICENSE_STATUSES as readonly string[]).includes(value);
}

/** Адрес для плеера или null: без прав (`none`) или с недопустимым адресом видео не показывается. */
export function resolvePlaybackSource(episode: EpisodeSourceInput): PlaybackSource | null {
  if (episode.licenseStatus === "none") return null;
  if (!ALLOWED_URL.test(episode.hlsUrl)) return null;
  return {
    kind: "hls",
    url: episode.hlsUrl,
    license: episode.licenseStatus,
    attribution: episode.attribution ? { text: episode.attribution, url: episode.attributionUrl } : null,
  };
}

export const LICENSE_LABELS: Record<Exclude<LicenseStatus, "none">, string> = {
  licensed: "Лицензия",
  own: "Собственное видео",
  open_license: "Открытая лицензия",
};
