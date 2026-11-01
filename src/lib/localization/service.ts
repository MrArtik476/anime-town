import { fetchShikimoriByMalIds } from "@/lib/shikimori/api";
import type { AnimeCard, AnimeDescription } from "@/types/anime";

import { descriptionHash } from "./hash";
import { mergeShikimori, needsShikimoriRefresh, resolveDescription, resolveTitles } from "./resolve";
import { getLocalizationStore } from "./store";
import type { LocalizationRecord, LocalizationStore } from "./types";

type Entry = { id: number; malId: number | null };

export type LocalizationBatch = {
  records: Map<number, LocalizationRecord>;
  /** false — хранилище или Shikimori не ответили: результат стоит кэшировать ненадолго. */
  complete: boolean;
};

export type StoredLocalizations = { records: Map<number, LocalizationRecord>; ok: boolean };

/**
 * Строки переводов из хранилища по id AniList. Для чтения не нужен MAL id, поэтому вызывающий код может
 * запустить его параллельно с запросом к AniList (страница тайтла). Сбой хранилища — пустой результат, ok: false.
 */
export async function readLocalizations(
  ids: number[],
  store: LocalizationStore = getLocalizationStore(),
): Promise<StoredLocalizations> {
  try {
    return { records: await store.getMany(ids), ok: true };
  } catch (error) {
    console.error("[localization] хранилище недоступно", error);
    return { records: new Map(), ok: false };
  }
}

/**
 * Русские данные для набора тайтлов: из хранилища, а устаревшие и новые — пачкой из Shikimori
 * с сохранением обратно. Любой сбой не ломает страницу: тайтлы остаются с данными AniList.
 * `stored` — строки, уже прочитанные через readLocalizations (чтобы не читать дважды).
 */
export async function loadLocalizations(
  entries: Entry[],
  store: LocalizationStore = getLocalizationStore(),
  stored?: StoredLocalizations,
): Promise<LocalizationBatch> {
  const initial = stored ?? (await readLocalizations(entries.map((entry) => entry.id), store));
  let complete = initial.ok;
  const records = new Map(initial.records);

  const stale = entries.filter((entry) => needsShikimoriRefresh(entry.malId, records.get(entry.id)));
  if (!stale.length) return { records, complete };

  try {
    const shikimori = await fetchShikimoriByMalIds(stale.map((entry) => entry.malId as number));
    const updated = stale.map((entry) =>
      mergeShikimori(entry.id, entry.malId as number, records.get(entry.id), shikimori.get(entry.malId as number)),
    );
    const now = new Date().toISOString();
    for (const record of updated) records.set(record.anilistId, { ...record, updatedAt: now });

    try {
      await store.upsertMany(updated);
    } catch (error) {
      complete = false;
      console.error("[localization] не удалось сохранить переводы", error);
    }
  } catch (error) {
    complete = false;
    console.error("[localization] Shikimori недоступен", error);
  }

  return { records, complete };
}

/** Карточки с русскими названиями. */
export async function localizeCards<T extends AnimeCard>(cards: T[]): Promise<{ items: T[]; complete: boolean }> {
  const { records, complete } = await loadLocalizations(cards);
  return { items: cards.map((card) => resolveTitles(card, records.get(card.id))), complete };
}

/** Описание для показа с учётом сохранённого перевода. */
export function localizeDescription(
  original: AnimeDescription | null,
  record: LocalizationRecord | undefined,
): AnimeDescription | null {
  const hash = original?.language === "en" ? descriptionHash(original.text) : null;
  return resolveDescription(original, record, hash);
}
