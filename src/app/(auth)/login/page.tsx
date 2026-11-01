import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { authLinkClass } from "@/features/auth/components/link-class";
import { LoginForm } from "@/features/auth/components/auth-forms";
import { getCurrentUser } from "@/features/auth/session";
import { safeNextPath } from "@/features/auth/validation";

export const metadata: Metadata = {
  title: "Вход",
  robots: { index: false },
};

const LINK_ERROR = "Ссылка из письма недействительна или устарела. Войдите или запросите новую.";

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  // Уже вошёл — сразу туда, куда шёл.
  if (await getCurrentUser()) redirect(next);

  return (
    <>
      {params.error === "link" && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {LINK_ERROR}
        </p>
      )}
      <LoginForm next={next} />
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell
      title="Вход"
      description="Войдите, чтобы сохранять избранное, ставить оценки и продолжать просмотр."
      footer={
        <p>
          Нет аккаунта?{" "}
          <Link href="/register" className={authLinkClass}>
            Зарегистрироваться
          </Link>
        </p>
      }
    >
      <Suspense fallback={<div className="h-72" aria-hidden />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
