import { FadeIn } from "@/components/motion/fade-in";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Декоративные «постеры» 2:3 — без названий тайтлов: каталога ещё нет.
const posterTiles = [
  { glyph: "夢", className: "-rotate-6 translate-y-6 from-primary/70 to-primary/10" },
  { glyph: "町", className: "z-10 from-accent to-card" },
  { glyph: "星", className: "rotate-6 translate-y-6 from-chart-2/70 to-card" },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_70%_20%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
        <FadeIn>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Этап 1 · фундамент платформы
          </p>
          <h1 className="font-heading text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Anime Town —{" "}
            <span className="text-primary">город, где живут ваши тайтлы</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground text-pretty sm:text-lg">
            Каталог с удобными фильтрами, просмотр серий с субтитрами, личная
            библиотека и «продолжить просмотр» — всё в одном месте. Сейчас мы
            строим основу платформы.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#roadmap" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-sm")}>
              Посмотреть этапы
            </a>
            <a
              href="#about"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-sm")}
            >
              Что будет на платформе
            </a>
          </div>
        </FadeIn>

        <FadeIn delay={0.1} className="hidden justify-center lg:flex">
          <div aria-hidden className="relative flex items-end -space-x-10 pb-6">
            {posterTiles.map((tile) => (
              <div
                key={tile.glyph}
                className={cn(
                  "grid aspect-[2/3] w-40 place-items-center rounded-xl border border-border/70 bg-gradient-to-b shadow-2xl shadow-black/40 xl:w-44",
                  tile.className,
                )}
              >
                <span className="font-heading text-6xl text-foreground/80">{tile.glyph}</span>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
