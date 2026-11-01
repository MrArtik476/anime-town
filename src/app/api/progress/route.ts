import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/features/auth/session";
import { getEpisode } from "@/features/episodes/queries";
import { parseProgressInput } from "@/features/progress/model";
import { getLocalizedAnimeById } from "@/lib/anilist/api";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * POST /api/progress — позиция просмотра серии (плеер: раз в 10 с, на паузе, при уходе со страницы
 * через fetch keepalive). Route Handler, а не Server Action: запрос должен дойти и при закрытии вкладки.
 * Тело: { animeId, number, position, duration }. Серия, название и обложка — на сервере.
 */
export async function POST(request: NextRequest) {
  // Только со своего сайта: иначе чужая страница могла бы писать прогресс вошедшему пользователю.
  // Как проверка Server Actions в Next.js: хост из Origin должен совпасть с Host (или X-Forwarded-Host за прокси).
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  if (!getSupabaseEnv()) return new Response(null, { status: 503 });

  const input = parseProgressInput(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "invalid_body" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const [episode, anime] = await Promise.all([getEpisode(input.animeId, input.number), getLocalizedAnimeById(input.animeId)]);
  if (!episode) return new Response(null, { status: 404 });

  const supabase = await createClient();
  const { error } = await supabase.from("watch_progress").upsert(
    {
      user_id: user.id,
      episode_id: episode.id,
      anilist_id: input.animeId,
      episode_number: input.number,
      position_sec: input.position,
      duration_sec: input.duration,
      title: (anime.ok ? anime.data.title : `Аниме №${input.animeId}`).slice(0, 300),
      cover_url: anime.ok && anime.data.coverUrl?.startsWith("https://") ? anime.data.coverUrl : null,
    },
    { onConflict: "user_id,episode_id" },
  );
  if (error) {
    console.error("[progress] не сохранён", error.code);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
