import { Languages } from "lucide-react";

import type { AnimeDescription as Description } from "@/types/anime";

/** «Машинный перевод (DeepL)»; без известного провайдера — просто «Машинный перевод». */
export function machineTranslationLabel(translator: string | null): string {
  return translator ? `Машинный перевод (${translator})` : "Машинный перевод";
}

/** Описание тайтла с честной пометкой источника: Shikimori, машинный перевод или английский оригинал. */
export function AnimeDescription({ description }: { description: Description | null }) {
  if (!description) {
    return <p className="mt-4 text-muted-foreground">Описание пока не добавлено.</p>;
  }

  return (
    <>
      {description.source === "machine" && (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted px-2.5 py-1 text-xs font-medium text-foreground/90">
          <Languages aria-hidden className="size-3.5" />
          {machineTranslationLabel(description.translator)}
        </p>
      )}
      {description.language === "en" && (
        <p className="mt-4 text-sm font-medium text-foreground/90">Русского описания пока нет — показан оригинал на английском.</p>
      )}

      <p
        lang={description.language}
        className="mt-4 max-w-3xl leading-relaxed whitespace-pre-line text-foreground/90"
      >
        {description.text}
      </p>

      {/* Описание, заданное администратором, — без подписи источника. */}
      {description.source !== "manual" && (
      <p className="mt-3 text-xs text-muted-foreground">
        {description.source === "shikimori" &&
          (description.sourceUrl ? (
            <>
              Описание:{" "}
              <a
                href={description.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Shikimori
              </a>
            </>
          ) : (
            "Описание: Shikimori"
          ))}
        {description.source === "machine" && "Переведено автоматически с английского описания AniList."}
        {description.source === "anilist" && "Описание: AniList."}
      </p>
      )}
    </>
  );
}
