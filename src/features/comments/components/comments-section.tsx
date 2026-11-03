import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { banMessage } from "../errors";
import type { CommentTarget } from "../model";
import { getCommentsPage, getViewer } from "../queries";
import { CommentForm } from "./comment-form";
import { CommentsList } from "./comments-list";

const targetPath = (target: CommentTarget) =>
  target.episodeNumber === undefined ? `/anime/${target.animeId}` : `/anime/${target.animeId}/watch/${target.episodeNumber}`;

/**
 * Обсуждение тайтла или серии. Читает сессию — поэтому рендерится в своём <Suspense>: данные тайтла
 * остаются в кэше (ADR-019), а комментарии приходят отдельно и на каждый запрос.
 */
export async function CommentsSection({ target }: { target: CommentTarget }) {
  const [viewer, page] = await Promise.all([getViewer(), getCommentsPage(target, null)]);
  const title = target.episodeNumber === undefined ? "Обсуждение" : `Обсуждение серии ${target.episodeNumber}`;
  // Ключ меняется после refresh() (новый, изменённый, удалённый комментарий) — список берёт свежую первую страницу.
  const listKey = page.comments
    .map((thread) => `${thread.id}:${thread.status}:${thread.editedAt}:${thread.replyCount}:${thread.replies.map((reply) => `${reply.id}${reply.status}${reply.editedAt}`).join()}`)
    .join("|");

  return (
    <section aria-labelledby="comments-title" id="comments" className="scroll-mt-20">
      <h2 id="comments-title" className="font-heading text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-4 rounded-xl border border-border/70 bg-card/60 p-4">
        {!viewer.userId ? (
          <Link
            href={`/login?next=${encodeURIComponent(`${targetPath(target)}#comments`)}`}
            className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full")}
          >
            Войдите, чтобы написать
          </Link>
        ) : viewer.bannedUntil ? (
          <p role="status" className="text-sm text-destructive">
            {banMessage(viewer.bannedUntil)}
          </p>
        ) : (
          <CommentForm target={target} />
        )}
      </div>
      <div className="mt-6">
        {page.failed ? (
          <p role="alert" className="text-sm text-destructive">
            Не удалось загрузить комментарии — обновите страницу
          </p>
        ) : (
          <CommentsList
            key={listKey}
            target={target}
            viewer={{ userId: viewer.userId, isModerator: viewer.isModerator, banned: viewer.bannedUntil !== null }}
            initial={page.comments}
            initialCursor={page.nextCursor}
          />
        )}
      </div>
    </section>
  );
}

export function CommentsSkeleton() {
  return (
    <div role="status" aria-label="Загрузка комментариев" className="space-y-4">
      <Skeleton aria-hidden className="h-7 w-40" />
      <Skeleton aria-hidden className="h-28 rounded-xl" />
      <Skeleton aria-hidden className="h-16 rounded-xl" />
    </div>
  );
}
