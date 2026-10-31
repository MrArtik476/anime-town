export const RATE_LIMIT_TITLE = "Слишком много запросов";

export function rateLimitMessage(retryAfter: number): string {
  return `Вы слишком часто меняете поиск и фильтры. Подождите ${retryAfter} с и попробуйте снова.`;
}

/** Ответ API: тот же формат `{ ok, error }`, что и у остальных ошибок каталога. */
export function rateLimitedJson(retryAfter: number): Response {
  return Response.json(
    { ok: false, error: { code: "RATE_LIMITED", retryAfter, message: rateLimitMessage(retryAfter) } },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}

/**
 * Ответ страницы: proxy отвечает до отрисовки, поэтому страница — самодостаточный HTML без JS.
 * Через Retry-After она сама перезагружается, ссылка на каталог без фильтров лимитом не ограничена.
 */
export function rateLimitedHtml(retryAfter: number): Response {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="${retryAfter}">
<title>${RATE_LIMIT_TITLE} — Anime Town</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
    background: oklch(0.16 0.015 270); color: oklch(0.97 0.005 270); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 440px; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 1.5rem; }
  p { margin: 0 0 24px; color: oklch(0.74 0.015 270); }
  a { display: inline-block; margin: 4px; padding: 10px 18px; border-radius: 10px; text-decoration: none; font-weight: 600; }
  .primary { background: oklch(0.68 0.19 28); color: oklch(0.16 0.015 270); }
  .secondary { border: 1px solid oklch(1 0 0 / 10%); color: oklch(0.97 0.005 270); }
  a:focus-visible { outline: 2px solid oklch(0.68 0.19 28); outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <h1>${RATE_LIMIT_TITLE}</h1>
  <p>${rateLimitMessage(retryAfter)} Страница обновится автоматически.</p>
  <a class="primary" href="/catalog">Открыть каталог</a>
  <a class="secondary" href="/">На главную</a>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 429,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": String(retryAfter),
      "Cache-Control": "no-store",
    },
  });
}
