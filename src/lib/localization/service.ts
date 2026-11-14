import { fetchShikimoriByMalIds } from "@/lib/shikimori/api";
import type { AnimeCard, AnimeDescription } from "@/types/anime";

import { descriptionHash } from "./hash";
import { mergeShikimori, needsShikimoriRefresh, resolveDescription, resolveTitles } from "./resolve";
import { createPublicClient } from "@/lib/supabase/public";

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
    const records = await store.getMany(ids);
    if (store.kind === "memory") await addManualText(records, ids);
    return { records, ok: true };
  } catch (error) {
    console.error("[localization] хранилище недоступно", error);
    return { records: new Map(), ok: false };
  }
}

/**
 * Ручной текст для хранилища в памяти (нет служебного ключа: разработка и E2E). Автоматические данные там живут
 * в процессе, а правки администратора — в базе: их читает публичный клиент (таблица открыта на чтение всем).
 * С хранилищем Supabase этот запрос не нужен — ручные колонки приходят вместе со строкой.
 */
async function addManualText(records: Map<number, LocalizationRecord>, ids: number[]): Promise<void> {
  const client = ids.length ? createPublicClient() : null;
  if (!client) return;
  const { data, error } = await client
    .from("anime_localizations")
    .select("anilist_id, manual_title_ru, manual_description_ru")
    .in("anilist_id", ids)
    .or("manual_title_ru.not.is.null,manual_description_ru.not.is.null");
  if (error) throw new Error(`anime_localizations: ${error.message}`);
  for (const row of data) {
    const manual = { manualTitleRu: row.manual_title_ru, manualDescriptionRu: row.manual_description_ru };
    const existing = records.get(row.anilist_id);
    records.set(
      row.anilist_id,
      existing
        ? { ...existing, ...manual }
        : {
            anilistId: row.anilist_id,
            malId: null,
            titleRu: null,
            synonymsRu: [],
            descriptionRu: null,
            source: null,
            sourceHash: null,
            translator: null,
            shikimoriUrl: null,
            ...manual,
            // Строки перевода ещё нет — «давно не сверяли», чтобы сверка с Shikimori не откладывалась.
            updatedAt: new Date(0).toISOString(),
          },
    );
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
    // Сверка не знает о ручном тексте (и не пишет его) — в ответе он остаётся таким, каким был прочитан.
    for (const record of updated) {
      const previous = records.get(record.anilistId);
      records.set(record.anilistId, {
        ...record,
        manualTitleRu: previous?.manualTitleRu ?? null,
        manualDescriptionRu: previous?.manualDescriptionRu ?? null,
        updatedAt: now,
      });
    }

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
