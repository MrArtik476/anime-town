import { roadmapStages, type StageStatus } from "@/config/roadmap";
import { cn } from "@/lib/utils";

const statusLabel: Record<StageStatus, string> = {
  done: "Готово",
  active: "В работе",
  planned: "Запланировано",
};

export function RoadmapSection() {
  return (
    <section id="roadmap" className="scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Этапы разработки
        </h2>
        <ol className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {roadmapStages.map((stage) => (
            <li
              key={stage.id}
              className={cn(
                "rounded-xl border bg-card p-5",
                stage.status === "active" ? "border-primary/60" : "border-border/70",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-heading text-sm text-muted-foreground">Этап {stage.id}</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    stage.status === "done" && "bg-muted text-foreground",
                    stage.status === "active" && "bg-primary text-primary-foreground",
                    stage.status === "planned" && "border border-border/70 text-muted-foreground",
                  )}
                >
                  {statusLabel[stage.status]}
                </span>
              </div>
              <h3 className="mt-3 font-heading text-lg font-semibold">{stage.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{stage.summary}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
