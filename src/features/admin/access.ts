import { notFound } from "next/navigation";

import { getCurrentProfile } from "@/features/auth/session";

/**
 * Страницы /admin — только администратору: остальным 404, как и несуществующий адрес.
 * Это удобство интерфейса; читать черновики и писать не даст RLS (private.is_admin()).
 * Вызывается внутри <Suspense>: читает cookies.
 */
export async function requireAdmin() {
  const current = await getCurrentProfile();
  if (current?.profile?.role !== "admin") notFound();
  return current;
}
