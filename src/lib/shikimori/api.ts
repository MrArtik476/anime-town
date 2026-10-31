import { isRussianText } from "@/lib/localization/text";

import { shikimoriRequest, type ShikimoriRequestOptions } from "./client";
import {
  ANIMES_BY_IDS_QUERY,
  SEARCH_ANIMES_QUERY,
  type ShikimoriAnimesData,
  type ShikimoriSearchData,
} from "./queries";
import { cleanShikimoriText } from "./text";

/** Сколько тайтлов Shikimori отдаёт за один запрос. */
export const SHIKIMORI_BATCH_SIZE = 50;

export type ShikimoriLocalization = {
  malId: number;
  titleRu: string | null;
  synonymsRu: string[];
  descriptionRu: string | null;
  url: string | null;
};

const toId = (value: string | null) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** Русские названия и описания по MAL id — пачками по 50, через общую очередь лимита. */
export async function fetchShikimoriByMalIds(
  malIds: number[],
  options?: ShikimoriRequestOptions,
): Promise<Map<number, ShikimoriLocalization>> {
  const unique = [...new Set(malIds)];
  const result = new Map<number, ShikimoriLocalization>();

  for (let start = 0; start < unique.length; start += SHIKIMORI_BATCH_SIZE) {
    const batch = unique.slice(start, start + SHIKIMORI_BATCH_SIZE);
    const data = await shikimoriRequest<ShikimoriAnimesData>(
      ANIMES_BY_IDS_QUERY,
      { ids: batch.join(","), limit: batch.length },
      options,
    );
    for (const anime of data.animes) {
      const malId = toId(anime.malId);
      if (!malId) continue;
      const titleRu = anime.russian?.trim() || null;
      result.set(malId, {
        malId,
        titleRu,
        synonymsRu: (anime.synonyms ?? [])
          .map((synonym) => synonym.trim())
          .filter((synonym) => synonym && synonym !== titleRu && isRussianText(synonym)),
        descriptionRu: cleanShikimoriText(anime.description),
        url: anime.url?.startsWith("https://") ? anime.url : null,
      });
    }
  }
  return result;
}

/** Поиск по названию на Shikimori — MAL id в порядке релевантности. */
export async function searchShikimoriMalIds(query: string, options?: ShikimoriRequestOptions): Promise<number[]> {
  const data = await shikimoriRequest<ShikimoriSearchData>(
    SEARCH_ANIMES_QUERY,
    { search: query, limit: SHIKIMORI_BATCH_SIZE },
    options,
  );
  return [...new Set(data.animes.map((anime) => toId(anime.malId)).filter((id): id is number => id !== null))];
}
