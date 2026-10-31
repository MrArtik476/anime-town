/** Строка таблицы anime_localizations в виде, удобном коду. */
export type LocalizationRecord = {
  anilistId: number;
  malId: number | null;
  titleRu: string | null;
  synonymsRu: string[];
  descriptionRu: string | null;
  /** Источник descriptionRu; null — русского описания нет. */
  source: "shikimori" | "machine" | null;
  /** SHA-256 английского описания, с которого сделан машинный перевод. */
  sourceHash: string | null;
  shikimoriUrl: string | null;
  /** Когда строку последний раз сверяли с источниками (ISO). */
  updatedAt: string;
};

export type LocalizationInput = Omit<LocalizationRecord, "updatedAt">;

/** Хранилище переводов: Supabase в продакшене, память процесса — без Supabase (разработка, E2E). */
export interface LocalizationStore {
  readonly kind: "supabase" | "memory";
  getMany(anilistIds: number[]): Promise<Map<number, LocalizationRecord>>;
  upsertMany(records: LocalizationInput[]): Promise<void>;
}
