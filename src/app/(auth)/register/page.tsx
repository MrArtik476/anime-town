import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { authLinkClass } from "@/features/auth/components/link-class";
import { RegisterForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = {
  title: "Регистрация",
  robots: { index: false },
};

export default function RegisterPage() {
  return (
    <AuthShell
      title="Регистрация"
      description="Аккаунт нужен для избранного, оценок и истории просмотра."
      footer={
        <p>
          Уже есть аккаунт?{" "}
          <Link href="/login" className={authLinkClass}>
            Войти
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
