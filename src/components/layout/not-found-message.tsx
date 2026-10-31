import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotFoundMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <span aria-hidden className="font-heading text-7xl text-primary/30">
        404
      </span>
      <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-3 text-muted-foreground">{description}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/catalog" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
          Перейти в каталог
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5")}>
          На главную
        </Link>
      </div>
    </div>
  );
}
