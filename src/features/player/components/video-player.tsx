"use client";

import type Hls from "hls.js";
import { Loader2, RotateCcw, SkipForward } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { levelLabel, seekTarget, shortcutFor } from "../shortcuts";

export type PlayerSubtitle = { lang: string; label: string; url: string; isDefault: boolean };

type VideoPlayerProps = {
  src: string;
  title: string;
  subtitles: PlayerSubtitle[];
  /** Следующая серия: ссылка и подпись. */
  next?: { href: string; label: string } | null;
  /** С какой секунды начать (продолжение просмотра). */
  startAt?: number;
  /** Позиция каждые ~10 с, на паузе и при уходе со страницы (прогресс — часть 3 этапа 4). */
  onProgress?: (position: number, duration: number) => void;
};

type Level = { index: number; label: string };

const AUTOPLAY_KEY = "anime-town:autoplay-next";
const NEXT_COUNTDOWN = 5;

/**
 * Плеер HLS. Safari/iOS — нативный HLS; остальные браузеры — hls.js (грузится только на этой странице).
 * Нативные controls доступны с клавиатуры и экранных дикторов; своя панель — качество, субтитры, автопереход.
 */
export function VideoPlayer({ src, title, subtitles, next, startAt = 0, onProgress }: VideoPlayerProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [subtitle, setSubtitle] = useState(() => subtitles.find((sub) => sub.isDefault)?.lang ?? "");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState(NEXT_COUNTDOWN);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Настройка — в браузере: после монтирования, чтобы не расходиться с серверной разметкой.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoplayNext(window.localStorage.getItem(AUTOPLAY_KEY) !== "off");
  }, []);

  // Загрузка источника. Пересоздаётся при смене серии или по «Повторить».
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let lastMediaRecovery = 0;
    setStatus("loading");
    setEnded(false);
    setLevels([]);
    setLevel(-1);

    const onLoaded = () => {
      if (startAt > 0 && startAt < video.duration - 5) video.currentTime = startAt;
      setStatus("ready");
    };
    video.addEventListener("loadedmetadata", onLoaded, { once: true });

    // Порядок из документации hls.js: есть MSE — hls.js (с выбором качества), иначе — нативный HLS
    // (Safari/iOS без MSE). Свежий Chrome тоже умеет HLS нативно, но тогда нет выбора качества.
    import("hls.js").then(({ default: HlsClass }) => {
      if (cancelled) return;
      if (!HlsClass.isSupported()) {
        if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = src;
        else setStatus("error");
        return;
      }
      const hls = new HlsClass({ capLevelToPlayerSize: true });
      hlsRef.current = hls;
      hls.on(HlsClass.Events.MANIFEST_PARSED, (_event, data) => {
        setLevels(
          data.levels
            .map((item, index) => ({ index, label: levelLabel(item), height: item.height }))
            .sort((a, b) => b.height - a.height)
            .map(({ index, label }) => ({ index, label })),
        );
      });
      hls.on(HlsClass.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR && Date.now() - lastMediaRecovery > 5000) {
          // Ошибка декодирования — одна попытка восстановления раз в 5 с (документация hls.js).
          lastMediaRecovery = Date.now();
          hls.recoverMediaError();
          return;
        }
        // Сеть: повторы hls.js исчерпаны — сразу перезапускать нельзя (цикл), показываем «Повторить».
        setStatus("error");
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    });

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onLoaded);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [src, startAt, attempt]);

  // Субтитры: показываем выбранную дорожку, остальные скрываем.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => {
      for (const track of Array.from(video.textTracks)) track.mode = track.language === subtitle ? "showing" : "disabled";
    };
    apply();
    video.textTracks.addEventListener("addtrack", apply);
    return () => video.textTracks.removeEventListener("addtrack", apply);
  }, [subtitle, status]);

  // Прогресс: раз в 10 с во время просмотра, на паузе и при уходе со страницы.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onProgress) return;
    const report = () => {
      if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime > 0) {
        onProgress(video.currentTime, video.duration);
      }
    };
    const timer = window.setInterval(() => !video.paused && report(), 10_000);
    const onHidden = () => document.visibilityState === "hidden" && report();
    video.addEventListener("pause", report);
    video.addEventListener("ended", report);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", report);
    return () => {
      window.clearInterval(timer);
      video.removeEventListener("pause", report);
      video.removeEventListener("ended", report);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", report);
      report();
    };
  }, [onProgress, src]);

  // Отсчёт до следующей серии после окончания.
  useEffect(() => {
    if (!ended || !next || !autoplayNext) return;
    if (countdown <= 0) {
      router.push(next.href);
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [ended, next, autoplayNext, countdown, router]);

  const changeLevel = (value: number) => {
    setLevel(value);
    if (hlsRef.current) hlsRef.current.currentLevel = value;
  };

  const toggleAutoplay = (value: boolean) => {
    setAutoplayNext(value);
    window.localStorage.setItem(AUTOPLAY_KEY, value ? "on" : "off");
  };

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      // Клавиши в полях выбора (качество, субтитры) не перехватываем.
      if (!video || (event.target as HTMLElement).closest("select, input, button, a")) return;
      const action = shortcutFor(event);
      if (!action) return;
      event.preventDefault();
      switch (action.type) {
        case "toggle-play":
          if (video.paused) void video.play();
          else video.pause();
          break;
        case "seek":
          video.currentTime = seekTarget(video.currentTime, action.by, video.duration);
          break;
        case "mute":
          video.muted = !video.muted;
          break;
        case "fullscreen":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void containerRef.current?.requestFullscreen();
          break;
        case "subtitles":
          setSubtitle((current) => (current ? "" : (subtitles.find((sub) => sub.isDefault) ?? subtitles[0])?.lang ?? ""));
          break;
      }
    },
    [subtitles],
  );

  return (
    <div>
      <div
        ref={containerRef}
        // Фокусируемая область плеера: горячие клавиши работают после клика по видео или Tab.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative aspect-video w-full overflow-hidden rounded-xl bg-black outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          aria-label={`Видео: ${title}`}
          className="size-full"
          onEnded={() => {
            setEnded(true);
            setCountdown(NEXT_COUNTDOWN);
          }}
          onPlay={() => setEnded(false)}
        >
          {subtitles.map((sub) => (
            <track key={sub.lang} kind="subtitles" src={sub.url} srcLang={sub.lang} label={sub.label} default={sub.lang === subtitle} />
          ))}
        </video>

        {status === "loading" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status" aria-label="Загрузка видео">
            <Loader2 aria-hidden className="size-10 animate-spin text-white/80" />
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-white">
            <div>
              <p className="font-medium">Видео не загрузилось</p>
              <p className="mt-1 text-sm text-white/70">Проверьте соединение и попробуйте ещё раз.</p>
              <Button variant="outline" className="mt-4" onClick={() => setAttempt((value) => value + 1)}>
                <RotateCcw aria-hidden /> Повторить
              </Button>
            </div>
          </div>
        )}

        {ended && next && (
          <div role="status" className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center text-white">
            <div>
              <p className="text-sm text-white/70">Следующая серия</p>
              <p className="mt-1 font-heading text-lg font-semibold">{next.label}</p>
              {autoplayNext && <p className="mt-2 text-sm">Начнётся через {countdown} с</p>}
              <div className="mt-4 flex justify-center gap-3">
                <Link href={next.href} className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
                  <SkipForward aria-hidden /> Смотреть сейчас
                </Link>
                {autoplayNext && (
                  <Button variant="outline" size="lg" className="h-10" onClick={() => toggleAutoplay(false)}>
                    Отмена
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Качество</span>
          <select
            value={level}
            onChange={(event) => changeLevel(Number(event.target.value))}
            disabled={levels.length === 0}
            className="h-9 rounded-lg border border-input bg-card px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <option value={-1}>Авто</option>
            {levels.map((item) => (
              <option key={item.index} value={item.index}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Субтитры</span>
          <select
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            disabled={subtitles.length === 0}
            className="h-9 rounded-lg border border-input bg-card px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <option value="">Выключены</option>
            {subtitles.map((sub) => (
              <option key={sub.lang} value={sub.lang}>
                {sub.label}
              </option>
            ))}
          </select>
        </label>
        {next && (
          <label className="flex h-9 items-center gap-2">
            <input type="checkbox" checked={autoplayNext} onChange={(event) => toggleAutoplay(event.target.checked)} className="size-4 accent-primary" />
            Автопереход к следующей серии
          </label>
        )}
        <p className="ml-auto hidden text-xs text-muted-foreground lg:block">
          Пробел — пауза · ←/→ — 10 с · F — во весь экран · M — звук · C — субтитры
        </p>
      </div>
    </div>
  );
}
