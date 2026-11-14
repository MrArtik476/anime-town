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
  /** Провайдер машинного перевода (deepl, yandex…); null для описаний Shikimori. */
  translator: string | null;
  shikimoriUrl: string | null;
  /** Название и описание, заданные администратором (этап 6c): важнее автоматических; null — их нет. */
  manualTitleRu: string | null;
  manualDescriptionRu: string | null;
  /** Когда строку последний раз сверяли с источниками (ISO). */
  updatedAt: string;
};

/**
 * То, что пишут сверка с Shikimori и машинный перевод. Ручных полей здесь нет намеренно:
 * импорт не может их ни задать, ни стереть — их меняет только администратор через журнал title_actions.
 */
export type LocalizationInput = Omit<LocalizationRecord, "updatedAt" | "manualTitleRu" | "manualDescriptionRu">;

/** Хранилище переводов: Supabase в продакшене, память процесса — без Supabase (разработка, E2E). */
export interface LocalizationStore {
  readonly kind: "supabase" | "memory";
  getMany(anilistIds: number[]): Promise<Map<number, LocalizationRecord>>;
  upsertMany(records: LocalizationInput[]): Promise<void>;
}
