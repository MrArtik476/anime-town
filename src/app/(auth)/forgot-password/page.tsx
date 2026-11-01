import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { authLinkClass } from "@/features/auth/components/link-class";
import { ForgotPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = {
  title: "Восстановление пароля",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Восстановление пароля"
      description="Укажите почту аккаунта — пришлём ссылку для нового пароля."
      footer={
        <p>
          Вспомнили пароль?{" "}
          <Link href="/login" className={authLinkClass}>
            Войти
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
