"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { type DataErrorCode, ERROR_MESSAGES } from "@/lib/anilist/errors";
import { cn } from "@/lib/utils";

type DataErrorProps = {
  code: DataErrorCode;
  /** Для RATE_LIMITED — через сколько секунд можно повторить. */
  retryAfter?: number | null;
  /** Своя повторная попытка; по умолчанию — перезапрос серверных данных страницы. */
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
};

export function DataError({ code, retryAfter, onRetry, compact, className }: DataErrorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const message = ERROR_MESSAGES[code];

  const retry = () => {
    if (onRetry) onRetry();
    else startTransition(() => router.refresh());
  };

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-card text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
        className,
      )}
    >
      <TriangleAlert aria-hidden className="size-7 text-primary" />
      <div>
        <p className="font-heading text-base font-semibold">{message.title}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message.description}</p>
        {code === "RATE_LIMITED" && retryAfter ? (
          <p className="mt-1 text-sm text-muted-foreground">{`Повторить можно через ${retryAfter} с.`}</p>
        ) : null}
      </div>
      {code !== "NOT_FOUND" && (
        <Button variant="outline" onClick={retry} disabled={isPending} className="mt-1">
          <RefreshCw aria-hidden className={cn("size-4", isPending && "animate-spin")} />
          Повторить
        </Button>
      )}
    </div>
  );
}
