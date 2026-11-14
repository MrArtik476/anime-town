import { randomUUID } from "node:crypto";

import { SUBTITLE_BUCKET, parseSubtitleObjectName } from "@/features/admin/subtitle-file";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Файл субтитров из закрытого бакета subtitles (этап 6d, ADR-030): /media/subtitles/<uuid>.vtt.
 * Файл читается от имени смотрящего (сессия из cookies или гость) — пустит ли Storage, решает политика
 * storage.objects: строка subtitles с этим адресом должна быть видна читающему (черновики и скрытые тайтлы — нет).
 * Служебный ключ здесь не используется. «Нет файла» и «нельзя» — одинаковый 404.
 */

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, ctx: RouteContext<"/media/subtitles/[file]">) {
  const name = parseSubtitleObjectName((await ctx.params).file);
  const env = getSupabaseEnv();
  if (!name || !env) return NOT_FOUND();

  const supabase = await createClient();
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? env.publishableKey;
  // CDN Storage кэширует ответ для каждого входа (cf-cache-status: HIT даже при max-age=0): без одноразового
  // параметра пользователь получал бы файл и после скрытия тайтла. С ним политика проверяется на каждый запрос.
  const response = await fetch(`${env.url}/storage/v1/object/authenticated/${SUBTITLE_BUCKET}/${name}?fresh=${randomUUID()}`, {
    headers: { apikey: env.publishableKey, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    // 400/404 — нет файла или нет права (Storage отвечает одинаково); остальное — сбой, в лог только статус.
    if (response.status !== 400 && response.status !== 404) console.error("[subtitles] файл не прочитан", response.status);
    return NOT_FOUND();
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
