import type { ShikimoriLocalization } from "@/lib/shikimori/api";
import type { AnimeCard, AnimeDescription } from "@/types/anime";

import { isRussianText } from "./text";
import { translatorLabel } from "./translator";
import type { LocalizationInput, LocalizationRecord } from "./types";

/** Через сколько перепроверять Shikimori: там могли появиться название или описание. */
export const SHIKIMORI_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** Нужно ли сходить в Shikimori за этим тайтлом. Без MAL id сопоставить не с чем. */
export function needsShikimoriRefresh(
  malId: number | null,
  record: LocalizationRecord | undefined,
  now = Date.now(),
): boolean {
  if (!malId) return false;
  if (!record || record.malId !== malId) return true;
  return now - Date.parse(record.updatedAt) > SHIKIMORI_REFRESH_MS;
}

/**
 * Новая строка после сверки с Shikimori. Описание Shikimori важнее машинного перевода;
 * если на Shikimori описания нет, сохранённый машинный перевод остаётся.
 * Тайтла нет на Shikimori — прежние данные не теряются.
 */
export function mergeShikimori(
  anilistId: number,
  malId: number,
  previous: LocalizationRecord | undefined,
  shikimori: ShikimoriLocalization | undefined,
): LocalizationInput {
  const base: LocalizationInput = {
    anilistId,
    malId,
    titleRu: previous?.titleRu ?? null,
    synonymsRu: previous?.synonymsRu ?? [],
    descriptionRu: previous?.descriptionRu ?? null,
    source: previous?.source ?? null,
    sourceHash: previous?.sourceHash ?? null,
    translator: previous?.translator ?? null,
    shikimoriUrl: previous?.shikimoriUrl ?? null,
  };
  if (!shikimori) return base;

  const keepMachine = !shikimori.descriptionRu && previous?.source === "machine";
  return {
    ...base,
    titleRu: shikimori.titleRu,
    synonymsRu: shikimori.synonymsRu,
    shikimoriUrl: shikimori.url,
    descriptionRu: shikimori.descriptionRu ?? (keepMachine ? base.descriptionRu : null),
    source: shikimori.descriptionRu ? "shikimori" : keepMachine ? "machine" : null,
    sourceHash: shikimori.descriptionRu ? null : keepMachine ? base.sourceHash : null,
    translator: shikimori.descriptionRu ? null : keepMachine ? base.translator : null,
  };
}

/** Строка с машинным переводом поверх существующей (название и ссылка Shikimori сохраняются). */
export function withMachineTranslation(
  anilistId: number,
  malId: number | null,
  previous: LocalizationRecord | undefined,
  translation: string,
  sourceHash: string,
  translator: string,
): LocalizationInput {
  return {
    anilistId,
    malId: previous?.malId ?? malId,
    titleRu: previous?.titleRu ?? null,
    synonymsRu: previous?.synonymsRu ?? [],
    shikimoriUrl: previous?.shikimoriUrl ?? null,
    descriptionRu: translation,
    source: "machine",
    sourceHash,
    translator,
  };
}

/**
 * Нужен ли машинный перевод: только если на Shikimori нет описания и нет перевода текущего английского текста
 * (хеш совпал — повторно не переводим).
 */
export function needsMachineTranslation(record: LocalizationRecord | undefined, originalHash: string): boolean {
  if (record?.descriptionRu && record.source === "shikimori") return false;
  return !(record?.descriptionRu && record.source === "machine" && record.sourceHash === originalHash);
}

/**
 * Описание для показа: Shikimori → машинный перевод (если сделан с текущего английского текста) →
 * английский оригинал AniList.
 */
export function resolveDescription(
  original: AnimeDescription | null,
  record: LocalizationRecord | undefined,
  originalHash: string | null,
): AnimeDescription | null {
  if (record?.descriptionRu && record.source === "shikimori") {
    return { language: "ru", source: "shikimori", text: record.descriptionRu, sourceUrl: record.shikimoriUrl };
  }
  if (record?.descriptionRu && record.source === "machine" && originalHash && record.sourceHash === originalHash) {
    return { language: "ru", source: "machine", text: record.descriptionRu, translator: translatorLabel(record.translator) };
  }
  return original;
}

/**
 * Названия: Shikimori → русский синоним AniList (уже в card.title) → английское/ромадзи.
 * Прежнее основное название становится альтернативным, если оно не русское.
 */
export function resolveTitles<T extends AnimeCard>(card: T, record: LocalizationRecord | undefined): T {
  const titleRu = record?.titleRu;
  if (!titleRu || titleRu === card.title) return card;
  const altTitle = isRussianText(card.title) ? card.altTitle : card.title;
  return { ...card, title: titleRu, altTitle: altTitle === titleRu ? null : altTitle };
}
