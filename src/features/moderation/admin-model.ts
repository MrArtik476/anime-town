/**
 * Модерация в админ-панели (этап 6b, ADR-028): фильтры журнала, подписи действий и статусов, состояние бана.
 * Общий код сервера и клиента, без обращения к базе.
 */

export const MOD_ACTIONS = ["hide", "restore", "dismiss_reports", "ban", "unban"] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];
export const MOD_ACTION_LABELS: Record<ModAction, string> = {
  hide: "Скрыл комментарий",
  restore: "Вернул комментарий",
  dismiss_reports: "Отклонил жалобы",
  ban: "Забанил",
  unban: "Снял бан",
};

export function parseModAction(raw: unknown): ModAction | null {
  return MOD_ACTIONS.find((action) => action === raw) ?? null;
}

export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Открыта",
  resolved: "Принята — комментарий скрыт",
  dismissed: "Отклонена",
};

export function parseReportStatus(raw: unknown): ReportStatus | null {
  return REPORT_STATUSES.find((status) => status === raw) ?? null;
}

export const BAN_FILTERS = ["active", "ended", "all"] as const;
export type BanFilter = (typeof BAN_FILTERS)[number];
export const BAN_FILTER_LABELS: Record<BanFilter, string> = {
  active: "Действующие",
  ended: "Завершённые",
  all: "Все",
};

/** Без параметра и при мусоре — действующие: это то, с чем администратор работает чаще всего. */
export function parseBanFilter(raw: unknown): BanFilter {
  return BAN_FILTERS.find((filter) => filter === raw) ?? "active";
}

export type BanState = "active" | "expired" | "revoked";

/** Состояние бана на момент nowMs. Снятие важнее срока: снятый бан остаётся «снятым» и после даты окончания. */
export function banState(ban: { expires_at: string | null; revoked_at: string | null }, nowMs: number): BanState {
  if (ban.revoked_at) return "revoked";
  if (ban.expires_at !== null && Date.parse(ban.expires_at) <= nowMs) return "expired";
  return "active";
}

export type LogFilters = {
  /** Ник модератора и ник цели (без «@»); null — фильтра нет. */
  moderator: string | null;
  target: string | null;
  action: ModAction | null;
  /** Границы периода для запроса: from включительно, to — начало следующего дня, исключительно. */
  from: string | null;
  to: string | null;
  /** Те же даты в виде ГГГГ-ММ-ДД — для полей формы и ссылок. */
  fromDate: string;
  toDate: string;
};

type Params = Record<string, string | string[] | undefined>;

const MAX_NICK = 40;

/** В нике только буквы, цифры и «_» (как в userSearchPattern) — остальное отбрасывается. */
function parseNick(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return raw.replace(/[^A-Za-z0-9_А-Яа-яЁё]/g, "").slice(0, MAX_NICK) || null;
}

/** Шаблон ilike для точного совпадения ника без учёта регистра: «_» в шаблоне — «любой символ», экранируется. */
export function exactNickPattern(nick: string): string {
  return nick.replace(/_/g, "\\_");
}

/** Сутки считаются по Минску: там нет перехода на летнее время, смещение всегда +03:00. */
const DAY_START = "T00:00:00+03:00";

/** ГГГГ-ММ-ДД существующего дня, иначе null (2026-02-30 и 2026-13-45 отклоняются). */
function parseDay(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Параметры адреса → фильтры журнала. Всё неверное молча игнорируется: адрес мог прийти откуда угодно. */
export function parseLogFilters(params: Params): LogFilters {
  const fromDate = parseDay(params.from);
  const toDate = parseDay(params.to);
  return {
    moderator: parseNick(params.moderator),
    target: parseNick(params.target),
    action: parseModAction(params.action),
    from: fromDate ? `${fromDate}${DAY_START}` : null,
    to: toDate ? `${nextDay(toDate)}${DAY_START}` : null,
    fromDate: fromDate ?? "",
    toDate: toDate ?? "",
  };
}

/** Адрес страницы с непустыми параметрами — «Показать ещё» и ссылки фильтров сохраняют остальные условия. */
export function pageHref(base: string, params: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}
