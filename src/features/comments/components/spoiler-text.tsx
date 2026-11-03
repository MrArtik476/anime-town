"use client";

import { useEffect, useRef, useState } from "react";

/** Текст спойлера размыт, пока читатель сам не нажмёт «Показать спойлер». Только текст — без разметки. */
export function SpoilerText({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Кнопка исчезает — фокус переходит на открытый текст, а не теряется на <body>.
  useEffect(() => {
    if (revealed) textRef.current?.focus();
  }, [revealed]);

  if (revealed) {
    return (
      <p ref={textRef} tabIndex={-1} className="whitespace-pre-wrap break-words outline-none">
        {text}
      </p>
    );
  }
  return (
    <div className="relative">
      <p aria-hidden="true" className="pointer-events-none whitespace-pre-wrap break-words blur-sm select-none">
        {text}
      </p>
      <button
        type="button"
        aria-expanded="false"
        onClick={() => setRevealed(true)}
        className="absolute inset-0 grid place-items-center rounded-md text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <span className="rounded-md bg-background/90 px-2.5 py-1 shadow-sm">Показать спойлер</span>
      </button>
    </div>
  );
}
