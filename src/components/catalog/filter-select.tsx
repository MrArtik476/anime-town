import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type FilterSelectProps = {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  /** Подпись пустого значения («Любой»). Без неё выбор обязателен (сортировка). */
  emptyLabel?: string;
  onChange: (value: string) => void;
  active?: boolean;
};

/**
 * Нативный select: на телефоне открывает системный выбор, доступен с клавиатуры и экранных дикторов
 * без дополнительного JS.
 */
export function FilterSelect({ id, label, value, options, emptyLabel, onChange, active }: FilterSelectProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-11 w-full appearance-none truncate rounded-lg border bg-card pr-9 pl-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40",
            active ? "border-primary/70 text-foreground" : "border-input text-foreground/90",
          )}
        >
          {emptyLabel && <option value="">{emptyLabel}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
