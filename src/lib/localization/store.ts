import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

import type { LocalizationInput, LocalizationRecord, LocalizationStore } from "./types";

type Row = Database["public"]["Tables"]["anime_localizations"]["Row"];

const SOURCES = ["shikimori", "machine"] as const;

export function rowToRecord(row: Row): LocalizationRecord {
  return {
    anilistId: row.anilist_id,
    malId: row.mal_id,
    titleRu: row.title_ru,
    synonymsRu: row.synonyms_ru ?? [],
    descriptionRu: row.description_ru,
    source: SOURCES.find((source) => source === row.source) ?? null,
    sourceHash: row.source_hash,
    shikimoriUrl: row.shikimori_url,
    updatedAt: row.updated_at,
  };
}

function recordToRow(record: LocalizationInput): Database["public"]["Tables"]["anime_localizations"]["Insert"] {
  return {
    anilist_id: record.anilistId,
    mal_id: record.malId,
    title_ru: record.titleRu,
    synonyms_ru: record.synonymsRu,
    description_ru: record.descriptionRu,
    source: record.source,
    source_hash: record.sourceHash,
    shikimori_url: record.shikimoriUrl,
    // Триггер выставляет updated_at при UPDATE; при INSERT — значение по умолчанию.
  };
}

export function createSupabaseStore(client: SupabaseClient<Database>): LocalizationStore {
  return {
    kind: "supabase",
    async getMany(anilistIds) {
      const result = new Map<number, LocalizationRecord>();
      if (!anilistIds.length) return result;
      const { data, error } = await client.from("anime_localizations").select("*").in("anilist_id", anilistIds);
      if (error) throw new Error(`anime_localizations: ${error.message}`);
      for (const row of data) result.set(row.anilist_id, rowToRecord(row));
      return result;
    },
    async upsertMany(records) {
      if (!records.length) return;
      const { error } = await client
        .from("anime_localizations")
        .upsert(records.map(recordToRow), { onConflict: "anilist_id" });
      if (error) throw new Error(`anime_localizations: ${error.message}`);
    },
  };
}

/** Хранилище в памяти процесса — когда Supabase не настроен (разработка, E2E). */
export function createMemoryStore(now: () => Date = () => new Date()): LocalizationStore {
  const records = new Map<number, LocalizationRecord>();
  return {
    kind: "memory",
    async getMany(anilistIds) {
      const result = new Map<number, LocalizationRecord>();
      for (const id of anilistIds) {
        const record = records.get(id);
        if (record) result.set(id, { ...record });
      }
      return result;
    },
    async upsertMany(input) {
      for (const record of input) {
        records.set(record.anilistId, { ...record, updatedAt: now().toISOString() });
      }
    },
  };
}

const holder = globalThis as typeof globalThis & { __animeTownLocalizationStore?: LocalizationStore };

/** Supabase, если задан service role; иначе память процесса. E2E-сборка никогда не пишет в настоящую базу. */
export function getLocalizationStore(): LocalizationStore {
  if (!holder.__animeTownLocalizationStore) {
    const client = process.env.ANIME_TOWN_E2E === "1" ? null : createAdminClient();
    holder.__animeTownLocalizationStore = client ? createSupabaseStore(client) : createMemoryStore();
  }
  return holder.__animeTownLocalizationStore;
}
