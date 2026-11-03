"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { type CommentTarget, type CommentView, encodeCursor, REPLY_PREVIEW } from "../model";
import { CommentForm } from "./comment-form";
import { CommentItem, type CommentViewer } from "./comment-item";

const LOAD_FAILED = "Не удалось загрузить — попробуйте ещё раз";

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Корни обсуждения с ответами и «Показать ещё». Первая страница приходит с сервера, следующие — из /api/comments. */
export function CommentsList({
  target,
  viewer,
  initial,
  initialCursor,
}: {
  target: CommentTarget;
  viewer: CommentViewer;
  initial: CommentView[];
  initialCursor: string | null;
}) {
  const [threads, setThreads] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ anime: String(target.animeId), cursor });
    if (target.episodeNumber !== undefined) params.set("episode", String(target.episodeNumber));
    const page = await fetchJson<{ comments: CommentView[]; nextCursor: string | null }>(`/api/comments?${params}`);
    setLoading(false);
    if (!page) return setError(LOAD_FAILED);
    const known = new Set(threads.map((thread) => thread.id));
    setThreads([...threads, ...page.comments.filter((thread) => !known.has(thread.id))]);
    setCursor(page.nextCursor);
  };

  // «Пока никто не написал» — только если и дальше ничего нет: пустая страница с курсором ведёт к «Показать ещё».
  if (threads.length === 0 && !cursor) {
    return <p className="text-sm text-muted-foreground">Пока никто не написал. Будьте первым!</p>;
  }

  return (
    <div>
      <ol className="space-y-6">
        {threads.map((thread) => (
          <li key={thread.id}>
            <Thread thread={thread} target={target} viewer={viewer} />
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {cursor && (
        <Button type="button" variant="outline" className="mt-6 w-full" onClick={loadMore} disabled={loading}>
          {loading && <LoaderCircle aria-hidden className="animate-spin" />}
          Показать ещё комментарии
        </Button>
      )}
    </div>
  );
}

function Thread({ thread, target, viewer }: { thread: CommentView; target: CommentTarget; viewer: CommentViewer }) {
  const [replies, setReplies] = useState(thread.replies);
  // Ответы, написанные здесь: показываются сразу и учитываются в счётчике «Показать ещё ответы».
  const [added, setAdded] = useState(0);
  const [replyingTo, setReplyingTo] = useState<CommentView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Курсор догрузки: undefined — ещё не догружали (продолжаем после превью), null — ответов больше нет.
  const [moreCursor, setMoreCursor] = useState<string | null | undefined>(undefined);
  // reply_count считает только видимые ответы, а модератор видит и скрытые — поэтому сравниваем с видимыми.
  const remaining = Math.max(thread.replyCount + added - replies.filter((reply) => reply.status === "visible").length, 0);
  const hasMore =
    moreCursor === undefined ? remaining > 0 || (viewer.isModerator && thread.replies.length >= REPLY_PREVIEW) : moreCursor !== null;

  const loadReplies = async () => {
    const previewLast = thread.replies.at(-1);
    const cursor = moreCursor ?? (previewLast ? encodeCursor({ createdAt: previewLast.createdAt, id: previewLast.id }) : null);
    const params = new URLSearchParams({ root: String(thread.id) });
    if (cursor) params.set("cursor", cursor);
    setLoading(true);
    setError(null);
    const page = await fetchJson<{ replies: CommentView[]; nextCursor: string | null }>(`/api/comments?${params}`);
    setLoading(false);
    if (!page) return setError(LOAD_FAILED);
    const known = new Set(replies.map((reply) => reply.id));
    setReplies([...replies, ...page.replies.filter((reply) => !known.has(reply.id))]);
    setMoreCursor(page.nextCursor);
  };

  return (
    <div>
      <CommentItem comment={thread} viewer={viewer} onReply={setReplyingTo} />
      {(replies.length > 0 || hasMore || replyingTo) && (
        <div className="mt-4 ml-[2.875rem] space-y-4 border-l border-border/60 pl-4">
          {replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} viewer={viewer} onReply={setReplyingTo} />
          ))}
          {hasMore && (
            <Button type="button" variant="link" className="h-auto px-0" onClick={loadReplies} disabled={loading}>
              {loading && <LoaderCircle aria-hidden className="animate-spin" />}
              {remaining > 0 ? `Показать ещё ответы (${remaining})` : "Показать ещё ответы"}
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {replyingTo && (
            <CommentForm
              target={target}
              replyTo={{ id: replyingTo.id, username: replyingTo.author?.username ?? null }}
              onDone={() => setReplyingTo(null)}
              onCreated={(created) => {
                if (replies.some((reply) => reply.id === created.id)) return;
                setReplies([...replies, created]);
                setAdded(added + 1);
              }}
              autoFocus
            />
          )}
        </div>
      )}
    </div>
  );
}
