import type { NextRequest } from "next/server";

import { parseCommentTarget } from "@/features/comments/model";
import { getCommentsPage, getReplies } from "@/features/comments/queries";
import { parseEpisodeNumber } from "@/features/episodes/ids";
import { parseAnimeId } from "@/lib/anime/ids";

const PRIVATE = { "Cache-Control": "private, no-store" };
const invalid = () =>
  Response.json({ ok: false, error: { code: "INVALID_PARAMS", message: "Неверные параметры" } }, { status: 400, headers: PRIVATE });

/**
 * GET /api/comments?anime=<id>[&episode=<n>]&cursor=… — следующая страница корней обсуждения;
 * GET /api/comments?root=<id>&cursor=… — следующие ответы ветки («Показать ещё»).
 * Ответ зависит от пользователя (модератор видит скрытые) — не кэшируется.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cursor = params.get("cursor");
  const rawRoot = params.get("root");

  if (rawRoot !== null) {
    const rootId = parseAnimeId(rawRoot);
    if (!rootId) return invalid();
    const page = await getReplies(rootId, cursor);
    return Response.json({ ok: !page.failed, ...page }, { status: page.failed ? 502 : 200, headers: PRIVATE });
  }

  const animeId = parseAnimeId(params.get("anime") ?? "");
  const rawEpisode = params.get("episode");
  const episodeNumber = rawEpisode === null ? undefined : parseEpisodeNumber(rawEpisode);
  const target = animeId && episodeNumber !== null ? parseCommentTarget({ animeId, episodeNumber }) : null;
  if (!target) return invalid();
  const page = await getCommentsPage(target, cursor);
  return Response.json({ ok: !page.failed, ...page }, { status: page.failed ? 502 : 200, headers: PRIVATE });
}
