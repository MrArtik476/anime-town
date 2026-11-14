"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";

import { parseAnimeId } from "../model";
import { adminInputClass } from "./styles";

/**
 * «Открыть тайтл по id AniList»: в разделе серий — чтобы добавить первую серию тайтлу, которого ещё нет в списке,
 * в разделе тайтлов — чтобы править текст и видимость. basePath — куда вести.
 */
export function OpenTitleForm({ basePath = "/admin/episodes" }: { basePath?: "/admin/episodes" | "/admin/titles" }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const open = (event: React.FormEvent) => {
    event.preventDefault();
    const animeId = parseAnimeId(value);
    setError(!animeId);
    if (animeId) router.push(`${basePath}/${animeId}`);
  };

  return (
    <form onSubmit={open} className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor={id} className="mb-1 block text-sm">
          id тайтла на AniList
        </label>
        <input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="например, 21"
          aria-invalid={error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={adminInputClass}
        />
      </div>
      <Button type="submit" size="lg" className="h-10">
        Открыть тайтл
      </Button>
      {error && (
        <p id={`${id}-error`} role="alert" className="basis-full text-sm text-destructive">
          Введите id числом — он есть в адресе страницы тайтла: /anime/21
        </p>
      )}
    </form>
  );
}
