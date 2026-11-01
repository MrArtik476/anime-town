import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { UpdatePasswordForm } from "@/features/auth/components/auth-forms";
import { getCurrentUser } from "@/features/auth/session";

export const metadata: Metadata = {
  title: "Новый пароль",
  robots: { index: false },
};

/** Сюда ведёт ссылка из письма сброса пароля (через /auth/callback) или профиль. Гостя proxy отправит на вход. */
async function UpdatePasswordContent() {
  if (!(await getCurrentUser())) redirect("/login?next=/auth/update-password");
  return <UpdatePasswordForm />;
}

export default function UpdatePasswordPage() {
  return (
    <AuthShell title="Новый пароль" description="Придумайте новый пароль для входа.">
      <Suspense fallback={<div className="h-64" aria-hidden />}>
        <UpdatePasswordContent />
      </Suspense>
    </AuthShell>
  );
}
