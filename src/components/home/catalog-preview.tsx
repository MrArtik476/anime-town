const PLACEHOLDER_COUNT = 12;

// Ровно два ряда при любой ширине: 2 → 3 → 4 → 6 колонок.
function visibilityClass(index: number) {
  if (index >= 8) return "hidden lg:block";
  if (index >= 6) return "hidden md:block";
  if (index >= 4) return "hidden sm:block";
  return undefined;
}

/** Макет сетки каталога (2 → 3 → 4 → 6 колонок) до появления реальных данных. */
export function CatalogPreview() {
  return (
    <section id="catalog" className="scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Каталог
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Здесь появятся тайтлы — после подключения данных на этапе 2.
            </p>
          </div>
          <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
            Скоро
          </span>
        </div>

        <ul
          aria-hidden
          className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        >
          {Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
            <li key={index} className={visibilityClass(index)}>
              <div className="aspect-[2/3] rounded-lg bg-gradient-to-b from-muted to-card" />
              <div className="mt-3 h-3 w-4/5 rounded bg-muted" />
              <div className="mt-2 h-3 w-2/5 rounded bg-muted/70" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
