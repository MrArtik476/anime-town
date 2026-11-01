import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Аватар пользователя или первая буква ника. Картинка из Supabase Storage выводится без оптимизатора:
 * файл уже маленький (до 1 МБ), а адрес хранилища зависит от проекта.
 */
export function UserAvatar({ url, name, size, className }: { url: string | null; name: string; size: number; className?: string }) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        unoptimized
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
