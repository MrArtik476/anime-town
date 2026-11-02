/**
 * Edge Function `translate-cron` (ADR-024): фоновый машинный перевод по расписанию Supabase Cron.
 * pg_cron раз в сутки (03:17 UTC) делает POST через pg_net с заголовком `x-cron-secret`;
 * работа — тот же runTranslationBackfill, что у `npm run translate` и `/api/cron/translate`.
 *
 * Исходник — этот файл; деплоится собранный `index.js` (`npm run functions:build`, esbuild разворачивает
 * импорты `@/` из src/ в один файл). Код намеренно без `Deno.*`: окружение — через node:process,
 * обработчик — `export default { fetch }`, поэтому файл проверяют и tsc, и eslint проекта.
 *
 * Секреты функции: CRON_SECRET, TRANSLATOR_PROVIDER, DEEPL_API_KEY (+ необязательные TRANSLATE_*_LIMIT).
 * Ключ базы Supabase подставляет сам: SUPABASE_SECRET_KEYS (новые ключи sb_secret_, берётся default);
 * TRANSLATE_SUPABASE_SECRET_KEY — ручная замена, если подставленный ключ не подходит.
 */
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import { runTranslationBackfill } from "@/lib/localization/backfill";
import { createSupabaseRunJournal, handleTranslateCronRequest, supabaseSecretKey } from "@/lib/localization/runs";
import { createMemoryStore, createSupabaseStore } from "@/lib/localization/store";
import type { Database } from "@/types/database";

// Модули src/ читают глобальный process.env при вызове; в Deno он есть не во всех версиях рантайма.
if (!("process" in globalThis)) Object.assign(globalThis, { process });

async function handle(request: Request): Promise<Response> {
  const env = process.env;
  const url = env.SUPABASE_URL;
  const secretKey = supabaseSecretKey(env);
  const client =
    url && secretKey
      ? createClient<Database>(url, secretKey.key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null;
  if (!client) console.error("[translator] translate-cron: нет SUPABASE_URL или ключа service role");
  else console.info(`[translator] translate-cron: ключ базы из ${secretKey?.source}`);

  return handleTranslateCronRequest(request, {
    secret: env.CRON_SECRET,
    journal: client ? createSupabaseRunJournal(client) : null,
    // Без базы runTranslationBackfill остановится с no_store и ничего не потратит.
    backfill: ({ limit }) =>
      runTranslationBackfill({
        limit,
        env,
        store: client ? createSupabaseStore(client) : createMemoryStore(),
      }),
  });
}

const translateCron = { fetch: handle };
export default translateCron;
