import { getCurrentUser } from "@/features/auth/session";

import { getUnreadCount } from "../queries";
import { BellPoller } from "./bell-poller";

/**
 * Колокольчик в шапке: читает сессию — рендерится в своём <Suspense>. Гостю не показывается;
 * ошибка счётчика (null) — колокольчик без бейджа.
 */
export async function NotificationBell() {
  if (!(await getCurrentUser())) return null;
  // Новый объект на каждый серверный рендер: BellPoller по нему понимает, что пришёл свежий счётчик.
  return <BellPoller initial={{ count: await getUnreadCount() }} />;
}
