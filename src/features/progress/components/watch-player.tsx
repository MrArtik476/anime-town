"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { type PlayerSubtitle, VideoPlayer } from "@/features/player/components/video-player";

import { formatClock } from "../model";

type WatchPlayerProps = {
  animeId: number;
  number: number;
  src: string;
  title: string;
  subtitles: PlayerSubtitle[];
  next: { href: string; label: string } | null;
  signedIn: boolean;
  /** Сохранённая позиция (0 — с начала). */
  resumeAt: number;
};

/** Плеер серии + сохранение прогресса для вошедшего пользователя и «Продолжаем с …». */
export function WatchPlayer({ animeId, number, signedIn, resumeAt, ...player }: WatchPlayerProps) {
  const [startAt, setStartAt] = useState(resumeAt);
  const lastSent = useRef<number | null>(null);

  const onProgress = useCallback(
    (position: number, duration: number) => {
      const rounded = Math.round(position);
      if (lastSent.current === rounded) return;
      lastSent.current = rounded;
      // keepalive — запрос доходит и при закрытии вкладки (pagehide).
      void fetch("/api/progress", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, number, position, duration }),
      }).catch(() => {
        lastSent.current = null;
      });
    },
    [animeId, number],
  );

  return (
    <div>
      {startAt > 0 && (
        <p role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          Продолжаем с {formatClock(startAt)}
          <Button variant="ghost" size="sm" onClick={() => setStartAt(0)}>
            <RotateCcw aria-hidden /> С начала
          </Button>
        </p>
      )}
      <VideoPlayer {...player} startAt={startAt} onProgress={signedIn ? onProgress : undefined} />
    </div>
  );
}
