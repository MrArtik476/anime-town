import { Clapperboard, LayoutGrid, Library, MessagesSquare } from "lucide-react";

const features = [
  {
    icon: LayoutGrid,
    title: "Каталог",
    text: "Тайтлы с жанрами, сезонами и рейтингом, фильтры и поиск с учётом опечаток.",
    stage: "Этап 2",
  },
  {
    icon: Clapperboard,
    title: "Просмотр",
    text: "Плеер с выбором качества и субтитрами. Только лицензированный контент.",
    stage: "Этап 4",
  },
  {
    icon: Library,
    title: "Библиотека",
    text: "Избранное, история и «продолжить просмотр» с того же места.",
    stage: "Этапы 3–4",
  },
  {
    icon: MessagesSquare,
    title: "Сообщество",
    text: "Оценки, комментарии с ответами и уведомления о новых сериях.",
    stage: "Этап 5",
  },
];

export function FeaturesSection() {
  return (
    <section id="about" className="scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Что будет в Anime Town
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Платформа собирается поэтапно — каждая часть появится, когда будет готова целиком.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text, stage }) => (
            <li key={title} className="flex flex-col rounded-xl border border-border/70 bg-card p-5">
              <Icon aria-hidden className="size-6 text-primary" />
              <h3 className="mt-4 font-heading text-lg font-semibold">{title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{text}</p>
              <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                {stage}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
