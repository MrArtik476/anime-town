import { getCurrentUser } from "@/features/auth/session";
import { getUnreadCount } from "@/features/notifications/queries";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/notifications/unread-count — { count } для клиентского опроса колокольчика. Без сессии — 401. */
export async function GET() {
  if (!(await getCurrentUser())) return new Response(null, { status: 401, headers: NO_STORE });
  const count = await getUnreadCount();
  if (count === null) return new Response(null, { status: 502, headers: NO_STORE });
  return Response.json({ count }, { headers: NO_STORE });
}
