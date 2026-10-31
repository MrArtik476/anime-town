import { after } from "next/server";

import { fetchShikimoriByMalIds } from "@/lib/shikimori/api";
import type { AnimeCard, AnimeDescription } from "@/types/anime";

import { descriptionHash } from "./hash";
import { mergeShikimori, needsShikimoriRefresh, resolveDescription, resolveTitles, withMachineTranslation } from "./resolve";
import { getLocalizationStore } from "./store";
import { getTranslator } from "./translator";
import type { LocalizationRecord, LocalizationStore } from "./types";

type Entry = { id: number; malId: number | null };

export type LocalizationBatch = {
  records: Map<number, LocalizationRecord>;
  /** false — хранилище или Shikimori не ответили: результат стоит кэшировать ненадолго. */
  complete: boolean;
};

/**
 * Русские данные для набора тайтлов: из хранилища, а устаревшие и новые — пачкой из Shikimori
 * с сохранением обратно. Любой сбой не ломает страницу: тайтлы остаются с данными AniList.
 */
export async function loadLocalizations(
  entries: Entry[],
  store: LocalizationStore = getLocalizationStore(),
): Promise<LocalizationBatch> {
  let complete = true;
  let records = new Map<number, LocalizationRecord>();

  try {
    records = await store.getMany(entries.map((entry) => entry.id));
  } catch (error) {
    complete = false;
    console.error("[localization] хранилище недоступно", error);
  }

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

const pending = globalThis as typeof globalThis & {
  __animeTownTranslations?: { inFlight: Set<number>; failedAt: Map<number, number> };
};
/** После сбоя перевода не повторять раньше, чем через 10 минут. */
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

/**
 * Машинный перевод английского описания — в фоне после ответа (after), один раз на тайтл:
 * результат сохраняется вместе с хешем исходного текста. Без провайдера ничего не делает.
 */
export function scheduleMachineTranslation(anime: Entry, original: AnimeDescription | null): boolean {
  if (original?.language !== "en") return false;
  const translator = getTranslator();
  if (!translator) return false;

  pending.__animeTownTranslations ??= { inFlight: new Set(), failedAt: new Map() };
  const { inFlight, failedAt } = pending.__animeTownTranslations;
  const failed = failedAt.get(anime.id);
  if (inFlight.has(anime.id) || (failed && Date.now() - failed < RETRY_AFTER_FAILURE_MS)) return false;
  inFlight.add(anime.id);

  const text = original.text;
  after(async () => {
    const store = getLocalizationStore();
    try {
      const translation = await translator.translate(text);
      const previous = (await store.getMany([anime.id])).get(anime.id);
      await store.upsertMany([withMachineTranslation(anime.id, anime.malId, previous, translation, descriptionHash(text))]);
      failedAt.delete(anime.id);
    } catch (error) {
      failedAt.set(anime.id, Date.now());
      console.error(`[translator] не удалось перевести описание ${anime.id}`, error);
    } finally {
      inFlight.delete(anime.id);
    }
  });
  return true;
}
