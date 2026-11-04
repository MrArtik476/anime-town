import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/features/auth/session";
import { getNotifications } from "@/features/notifications/queries";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/notifications?cursor=… — следующая страница списка («Показать ещё»). Свои уведомления
 * (RLS), ответ зависит от пользователя — не кэшируется. Без сессии — 401.
 */
export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return new Response(null, { status: 401, headers: NO_STORE });
  const page = await getNotifications(request.nextUrl.searchParams.get("cursor"));
  if (page.failed) return new Response(null, { status: 502, headers: NO_STORE });
  return Response.json({ items: page.items, nextCursor: page.nextCursor }, { headers: NO_STORE });
}
