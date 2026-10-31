"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Непредвиденная ошибка рендеринга. Сбои AniList обрабатываются на месте и сюда не доходят. */
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center px-4 py-24 text-center">
      <h1 className="font-heading text-2xl font-bold tracking-tight">Что-то пошло не так</h1>
      <p className="mt-3 text-muted-foreground">Страницу не удалось показать. Попробуйте ещё раз.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button size="lg" className="h-11 px-5" onClick={() => retry()}>
          Повторить
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5")}>
          На главную
        </Link>
      </div>
    </main>
  );
}
