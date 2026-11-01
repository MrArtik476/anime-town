import { cn } from "@/lib/utils";

type FadeInProps = {
  children: React.ReactNode;
  className?: string;
  /** Задержка в секундах. */
  delay?: number;
};

/**
 * Короткое появление снизу (opacity + transform, 300 мс) на CSS (tw-animate-css), без JavaScript.
 * Анимация стартует сразу при отрисовке HTML, а не после загрузки JS: раньше Motion держал героя
 * невидимым (opacity: 0) до гидратации и добавлял ~42 КБ gzip на каждую страницу.
 * При prefers-reduced-motion анимация выключена.
 */
export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out fill-mode-both motion-reduce:animate-none",
        className,
      )}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}
