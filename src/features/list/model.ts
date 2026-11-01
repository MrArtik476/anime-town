/** Личный список: статусы просмотра и оценка 1–10 (таблица anime_list). Общий код сервера и клиента. */

export const LIST_STATUSES = ["planned", "watching", "completed", "on_hold", "dropped"] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

export const LIST_STATUS_LABELS: Record<ListStatus, string> = {
  planned: "Хочу посмотреть",
  watching: "Смотрю",
  completed: "Просмотрено",
  on_hold: "Отложено",
  dropped: "Брошено",
};

export const SCORES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export type ListEntry = {
  animeId: number;
  status: ListStatus | null;
  score: number | null;
  title: string;
  coverUrl: string | null;
  updatedAt: string;
};

export type ListInput = { status: ListStatus | null; score: number | null };

export function isListStatus(value: unknown): value is ListStatus {
  return typeof value === "string" && (LIST_STATUSES as readonly string[]).includes(value);
}

/** Проверка ввода (Server Action принимает данные от клиента — доверять им нельзя). null — неверные данные. */
export function parseListInput(input: unknown): ListInput | null {
  if (typeof input !== "object" || input === null) return null;
  const { status, score } = input as Record<string, unknown>;
  if (status !== null && !isListStatus(status)) return null;
  if (score !== null && !(typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 10)) {
    return null;
  }
  return { status, score: score as number | null };
}

/** Пустая запись (ни статуса, ни оценки) не хранится: тайтл удаляется из списка. */
export function isEmptyInput(input: ListInput): boolean {
  return input.status === null && input.score === null;
}

type Row = {
  anilist_id: number;
  status: string | null;
  score: number | null;
  title: string;
  cover_url: string | null;
  updated_at: string;
};

export function rowToEntry(row: Row): ListEntry {
  return {
    animeId: row.anilist_id,
    status: isListStatus(row.status) ? row.status : null,
    score: row.score,
    title: row.title,
    coverUrl: row.cover_url,
    updatedAt: row.updated_at,
  };
}

/** Группы для профиля: по статусу в порядке LIST_STATUSES, затем «Только оценка». */
export function groupByStatus(entries: ListEntry[]): { key: ListStatus | "rated"; label: string; items: ListEntry[] }[] {
  const groups = LIST_STATUSES.map((status) => ({
    key: status as ListStatus | "rated",
    label: LIST_STATUS_LABELS[status],
    items: entries.filter((entry) => entry.status === status),
  }));
  groups.push({ key: "rated", label: "Только оценка", items: entries.filter((entry) => entry.status === null) });
  return groups.filter((group) => group.items.length > 0);
}
