"use client";

import Image from "next/image";
import { useState } from "react";

import { isAniListImage } from "@/lib/anilist/images";
import { cn } from "@/lib/utils";

type PosterImageProps = {
  src: string | null;
  alt: string;
  sizes: string;
  /** Цвет обложки из AniList — фон, пока картинка грузится. */
  color?: string | null;
  priority?: boolean;
  className?: string;
};

/** Постер с фоном-плейсхолдером и запасным вариантом, если картинки нет или она не загрузилась. */
export function PosterImage({ src, alt, sizes, color, priority, className }: PosterImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <div
      className={cn("relative size-full overflow-hidden bg-muted", className)}
      style={color ? { backgroundColor: color } : undefined}
    >
      {showImage ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={isAniListImage(src)}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          data-testid="poster-fallback"
          className="grid size-full place-items-center bg-gradient-to-b from-muted to-card"
        >
          <span aria-hidden className="font-heading text-4xl text-foreground/25">
            町
          </span>
        </div>
      )}
    </div>
  );
}
