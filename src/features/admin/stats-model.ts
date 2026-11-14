/** Сводка по сайту на главной админки (этап 6d). null — число не загрузилось. */
export type SiteStats = {
  users: number | null;
  newUsers: number | null;
  published: number | null;
  drafts: number | null;
  hidden: number | null;
  openReports: number | null;
  activeBans: number | null;
  newComments: number | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Начало «последних 7 дней» — ISO для фильтра created_at. */
export const weekAgo = (nowMs: number) => new Date(nowMs - WEEK_MS).toISOString();

export const statsFailed = (stats: SiteStats) => Object.values(stats).some((value) => value === null);
