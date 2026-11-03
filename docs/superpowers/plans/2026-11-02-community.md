# Этап 5 «Сообщество» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Комментарии к тайтлам и сериям с ответами, жалобами и модерацией; уведомления на сайте об ответах и новых сериях.

**Architecture:** Server Actions пишут от имени пользователя. Права, флуд-лимит, баны, журнал и уведомления живут в Postgres: RLS, права на колонки и триггеры `security definer` в схеме `private`. UI — серверные компоненты в своих `<Suspense>`, догрузка — Route Handlers. Realtime нет.

**Tech Stack:** Next.js 16 (App Router, Cache Components), React 19.2, Supabase (Postgres, PostgREST, `@supabase/ssr`), Vitest, Playwright с `tests/mock-supabase`.

**Spec:** `docs/superpowers/specs/2026-11-02-community-design.md` — номера разделов ниже (§N) ссылаются на него.

## Global Constraints

- Одна задача = одна ветка = один PR. Ветка — от свежего `main`. Слияние — только при полностью зелёном `npm run verify` (CI нет).
- **Миграция:**
  - сначала коммитится в `supabase/migrations/<timestamp>_<name>.sql`, потом применяется в Supabase (`apply_migration`);
  - после применения запустить `get_advisors` security и performance — новых предупреждений быть не должно;
  - затем `npm run db:types` и закоммитить `src/types/database.ts`;
  - затем `npm run rls:check` — все ✅. Он не входит в `verify`: идёт на настоящий проект.
- **Функции в базе:**
  - триггерные — `security definer`, `set search_path = ''`, в схеме `private`, `revoke execute … from public, anon, authenticated`;
  - `private.is_moderator()` и `private.is_banned()` — без аргументов, `security definer stable`, `set search_path = ''`; в политиках только `(select private.…())`; `grant usage on schema private` и `execute` на эти две функции — только `authenticated`; схему `private` в Data API не открывать.
- Коды ошибок базы: `PT429` — флуд, `PT403` — бан, `PT422` — недопустимое действие (PostgREST отдаёт HTTP 429/403/422); повторная жалоба — `23505`.
- Лимиты: текст 1–2000 символов после `btrim`; 5 комментариев в минуту и 30 в час; по 20 на страницу; 3 ответа в превью; причина бана и пояснение к жалобе ≤ 500.
- Тексты интерфейса — на русском, дословно как в спеке (§4, §7).
- Текст комментария — только текстовый узел React (`whitespace-pre-wrap`), без `dangerouslySetInnerHTML`.
- E2E: перед `focus()`, `press()` и `pressSequentially()` — `await expect(locator).toBeVisible()` (learning «Нестабильный E2E поиска каталога»).
- Процесс на порту 3000 (PID 18972) не трогать; если мешает `npm ci` — `npm install`.
- После записи — `refresh()`, не `revalidatePath`.
- Перед коммитом — `trail check`; конфликт исправить или объяснить в PR.

## Review Focus

1. **Гонка флуд-лимита.** Шесть параллельных вставок от одного пользователя должны пропустить ровно 5 (advisory lock) — проверка в `rls:check`, задача 1.3.
2. **Ответ на ответ в чужой ветке или подмена `reply_to_user_id`.** Подделав запрос через Data API, нельзя упомянуть постороннего и отправить ему уведомление — `PT422`, задача 1.2.
3. **Удалённый корень без ответов и с ответами.** Без ответов пропадает, с ответами — «Комментарий удалён», текста в ответе API нет — задачи 1.2 и 2.1.
4. **Повторный `seed:test-episodes`.** Upsert `own → own` не создаёт уведомлений, новые серии склеиваются в одно непрочитанное — задача 4.2.
5. **Модератор банит модератора или себя, обычный пользователь вызывает модераторские действия через Data API** — отказ, задачи 1.2 и 1.3.

---

## PR 5a-1 · `feature/comments-schema` — схема комментариев, жалоб, банов, журнала

### Task 1.1: Миграция — таблицы, права, RLS, помощники

**Files:**
- Create: `supabase/migrations/20261103090000_comments.sql`

**Interfaces:**
- Produces:
  - таблицы `public.comments`, `comment_reports`, `user_bans`, `moderation_actions` с колонками, check (в том числе домен и длина `anime_cover_url`), индексами, правами на колонки и политиками **ровно по §3.1–§3.4**;
  - `private.is_moderator() returns boolean` и `private.is_banned() returns boolean` — без аргументов, `security definer stable`, `set search_path = ''`.

- [ ] **Step 1: Схема `private` и права на неё.**
  - `create schema private`;
  - `grant usage on schema private to authenticated`;
  - обе функции-помощника;
  - `revoke execute on all functions in schema private from public, anon, authenticated`;
  - `grant execute on function private.is_moderator(), private.is_banned() to authenticated`.

  `revoke` повторить в конце файла, после создания триггерных функций.
- [ ] **Step 2: Таблицы, индексы, права, политики.** Четыре таблицы, индексы, `grant`/`revoke` и политики. У `comments` — `grant update (body)`, `grant delete`. У `comment_reports`, `user_bans`, `moderation_actions` нет `update`/`delete` для `authenticated`. Помощники в политиках вызываются только как `(select private.is_moderator())` и `(select private.is_banned())`.

### Task 1.2: Триггеры и функция превью ответов

**Files:**
- Modify: `supabase/migrations/20261103090000_comments.sql`

**Interfaces:**
- Produces:
  - `private.comments_before_insert()`, `private.comments_before_update()`, `private.comments_before_delete()`, `private.comments_after_change()` — §3.1;
  - `private.comment_reports_before_insert()` — §3.2;
  - `private.moderation_apply()` — §3.4;
  - `public.comment_reply_previews(root_ids bigint[], per_root int default 3) returns setof public.comments` — `security invoker stable`; больше 20 id → `PT422`.

- [ ] **Step 1: Вставка комментария — `comments_before_insert`.**
  - Ветка: родитель корневой и видимый, `anilist_id`/`episode_id` совпадают, `reply_to_user_id` — автор родителя или ответа в ветке. Иначе `raise exception using errcode = 'PT422'`.
  - Флуд: `pg_advisory_xact_lock(hashtext(new.user_id::text))`, подсчёт за `interval '1 minute'` (≥ 5) и `interval '1 hour'` (≥ 30) → `PT429`.
  - Бан → `PT403`, `detail` = `expires_at` в ISO или `forever`.
  - Принудительно: `status = 'visible'`, `reply_count = 0`, `edited_at = null`, `created_at = now()`.
- [ ] **Step 2: Правка и удаление.**
  - `comments_before_update`: `body` изменился → `edited_at := now()`.
  - `comments_before_delete`: при `pg_trigger_depth() = 1` выполнить `update public.comments set status = 'deleted', body = null, is_spoiler = false where id = old.id` и `return null`. Иначе (каскад) — `return old`.
- [ ] **Step 3: Число ответов — `comments_after_change`** (`after insert or update of status`): `reply_count` корня.
- [ ] **Step 4: Жалоба — `comment_reports_before_insert`.** Комментарий видим и не свой, иначе `PT422`; `status := 'open'`.
- [ ] **Step 5: Действия модератора — `moderation_apply`** (`before insert on moderation_actions`). Таблица действий из §3.4:
  - `new.moderator_id := auth.uid()`;
  - `target_user_id` для `hide`/`restore` ставится по автору;
  - `ban` пишет `user_bans` с `expires_at = now() + interval` по `ban_duration` (`1d`, `7d`, `30d`; `forever` → null);
  - любое невыполненное условие → `PT422`.
- [ ] **Step 6: Функция превью ответов.** `comment_reply_previews`: `unnest(root_ids) r cross join lateral (… where parent_id = r order by created_at, id limit per_root)`. Видны ответы со `status = 'visible'`, у модератора ещё и `hidden`. `grant execute` для `anon` и `authenticated`.
- [ ] **Step 7: Коммит миграции до применения.**

```bash
git add supabase/migrations/20261103090000_comments.sql
git commit -m "feat(db): comments, reports, bans, moderation actions"
```

### Task 1.3: Применить, проверить советники, типы, `rls:check`

**Files:**
- Modify: `scripts/rls-check.mjs`, `src/types/database.ts`, `ARCHITECTURE.md`, `DEVELOPMENT.md`

**Interfaces:**
- Consumes: всё из 1.1–1.2.
- Produces: помощник `makeModerator()` в `rls-check.mjs` — `makeUser("m")` и `admin.from("profiles").update({ role: "moderator" })`.

- [ ] **Step 1: Применить и проверить.** `apply_migration`, затем `get_advisors` security и performance. Ожидание: новых предупреждений нет. Если есть — исправлять новой миграцией, а не правкой применённой.
- [ ] **Step 2: Типы.** `npm run db:types`, `npm run typecheck` — зелёный.
- [ ] **Step 3: Блок «Комментарии» в `rls-check.mjs`** — проверки из §8 спека. Ожидаемые значения:
  - запрещённые колонки — отдельная проверка на каждую из `status`, `is_spoiler`, `parent_id`, `reply_count`, `anime_title`, `anime_cover_url`, `user_id`, `anilist_id`: `check("A не меняет <колонку>", error?.code === "42501")`;
  - `check("A меняет текст — edited_at выставлен", row.edited_at !== null)`;
  - `check("обложка с чужого домена — 23514", …)`, `check("обложка длиннее 500 — 23514", …)`;
  - `check("delete — строка осталась со status deleted и body null", …)`;
  - `check("скрытый не виден автору", …data.length === 0)`, `check("M видит скрытый", …)`;
  - `check("6-й комментарий за минуту — PT429 / HTTP 429", error.code === "PT429" && status === 429)`;
  - `check("6 параллельных вставок — ровно 5 успешных", ok === 5)` — `Promise.all` от нового пользователя C;
  - `check("ответ на ответ — PT422", …)`, `check("reply_to постороннего — PT422", …)`;
  - `check("A не пишет в user_bans", error?.code === "42501")`, `check("A не пишет в moderation_actions", blocked)`;
  - `check("M не банит модератора — PT422", …)`, `check("M не банит себя — PT422", …)`;
  - `check("забаненный не пишет — PT403", …)`, `check("забаненный не жалуется", …)`, `check("после unban пишет снова", …)`;
  - `check("повторная жалоба — 23505", …)`, `check("A не меняет статус жалобы", …)`;
  - `check("hide: эффект + 1 строка журнала", …)`;
  - `check("hide скрытого — PT422, журнал не вырос", …)`;
  - `check("dismiss_reports без жалоб — PT422", …)`;
  - `check("M не меняет и не удаляет журнал", …)`.

  HTTP-статус брать из `response.status` supabase-js. Флуд-проверки — на отдельных пользователях, чтобы лимит не мешал остальным.
- [ ] **Step 4: Прогон.** `npm run rls:check` — все ✅, код выхода 0.
- [ ] **Step 5: Документация.**
  - `ARCHITECTURE.md`: ADR-025 (§9 спека, включая обоснование кодов `PT`) и раздел «Комментарии» в §2;
  - `DEVELOPMENT.md`: SQL назначения модератора, запасной SQL снятия бана, новые проверки `rls:check`;
  - Obsidian: заметки таблиц, ADR-025, PR. Если MCP Obsidian недоступен — отложить и сообщить владельцу; на диск при открытом Obsidian не писать.
- [ ] **Step 6: Слияние.** `npm run verify` — 6/6 зелёные; `trail check`. Затем коммит, PR, слияние.

---

## PR 5a-2 · `feature/comments-ui` — комментарии на страницах

### Task 2.1: Модель, ошибки, запросы

**Files:**
- Create: `src/features/comments/model.ts`, `src/features/comments/errors.ts`, `src/features/comments/queries.ts`
- Test: `tests/unit/comments-model.test.ts`

**Interfaces:**
- Produces:
  - `parseCommentBody(raw: unknown): string | null`;
  - `encodeCursor(c: { createdAt: string; id: number }): string`, `decodeCursor(raw: string | null): { createdAt: string; id: number } | null`;
  - `type CommentView = { id: number; parentId: number | null; author: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null; replyTo: { id: string; username: string } | null; body: string | null; isSpoiler: boolean; status: "visible" | "hidden" | "deleted"; replyCount: number; createdAt: string; editedAt: string | null; replies: CommentView[] }`;
  - `buildThreads(roots: CommentRow[], replies: CommentRow[], profiles: ProfileRow[]): CommentView[]`;
  - `commentErrorMessage(error: { code?: string; details?: string } | null): string`;
  - `type CommentTarget = { animeId: number; episodeNumber?: number }`;
  - `getViewer(): Promise<{ userId: string | null; isModerator: boolean; bannedUntil: string | "forever" | null }>`;
  - `getCommentsPage(target: CommentTarget, cursor: string | null): Promise<{ comments: CommentView[]; nextCursor: string | null }>`;
  - `getReplies(rootId: number, cursor: string | null): Promise<{ replies: CommentView[]; nextCursor: string | null }>`.

- [ ] **Step 1: Тесты.**
  - `parseCommentBody(" a ") === "a"`, `parseCommentBody("") === null`, `parseCommentBody("x".repeat(2001)) === null`, `parseCommentBody("x".repeat(2000))` — длина 2000, `parseCommentBody("a\r\n\r\n\r\n\r\n\r\nb") === "a\n\n\nb"`;
  - `decodeCursor(encodeCursor(c))` равен `c`; `decodeCursor("мусор") === null`;
  - `buildThreads`: удалённый корень с `replyCount: 0` отброшен, с `replyCount: 2` — `body: null`;
  - `commentErrorMessage({ code: "PT429" })` = «Слишком часто. Подождите немного и попробуйте снова»; `{ code: "PT403", details: "forever" }` = «Вы заблокированы»; `{ code: "23505" }` = «Вы уже пожаловались на этот комментарий».
- [ ] **Step 2:** `npx vitest run tests/unit/comments-model.test.ts` — падает (модуля нет).
- [ ] **Step 3:** Реализовать `model.ts` и `errors.ts` (тексты — таблица §2 спека). Затем `queries.ts`: корни, `rpc("comment_reply_previews")`, `profiles` по `in`, фильтр корней — §4. `getViewer` берёт роль из `getCurrentProfile()`, бан — из своих строк `user_bans`.
- [ ] **Step 4:** Тот же запуск — PASS.
- [ ] **Step 5:** Коммит.

### Task 2.2: Server Actions и `GET /api/comments`

**Files:**
- Create: `src/features/comments/actions.ts`, `src/app/api/comments/route.ts`
- Test: `tests/unit/comments-actions.test.ts` (Supabase и сессия замоканы — как в существующих тестах `tests/unit/server`)

**Interfaces:**
- Consumes: 2.1.
- Produces:
  - `type ActionResult = { ok: true } | { ok: false; message: string }`;
  - `createComment(target: CommentTarget, input: { body: string; isSpoiler: boolean; replyToCommentId?: number }): Promise<ActionResult>`;
  - `editComment(id: number, input: { body: string }): Promise<ActionResult>` — `update({ body })`, флажок «Спойлер» после публикации не меняется;
  - `deleteComment(id: number): Promise<ActionResult>` — `delete().eq("id", id)`; мягкое удаление делает триггер;
  - `reportComment(id: number, input: { reason: "spam" | "offensive" | "spoiler" | "other"; details?: string }): Promise<ActionResult>`;
  - `GET /api/comments?anime=<id>&episode=<n>&cursor=…` → `{ comments, nextCursor }`;
  - `GET /api/comments?root=<id>&cursor=…` → `{ replies, nextCursor }`;
  - на неверные параметры — 400 `{ code: "INVALID_PARAMS" }`.

- [ ] **Step 1: Тесты.**
  - гость → `{ ok: false, message: "Войдите, чтобы написать" }`;
  - ответ на ответ (`parent_id: 10`) уходит в `insert` с `parent_id: 10` и `reply_to_user_id` автора ответа;
  - ошибка `PT429` → сообщение из `commentErrorMessage`;
  - неверный `reason` → «Неверные данные»;
  - `episodeNumber`, которого нет, → «Серия не найдена».
- [ ] **Step 2:** Запуск — падает.
- [ ] **Step 3:** Реализация. Снимок `anime_title`/`anime_cover_url` — из `getLocalizedAnimeById`, как `saveListEntry`. После успеха — `refresh()`.
- [ ] **Step 4:** Запуск — PASS.
- [ ] **Step 5:** Коммит.

### Task 2.3: Компоненты и подключение к страницам

**Files:**
- Create в `src/features/comments/components/`: `comments-section.tsx` (сервер), `comment-form.tsx`, `comment-item.tsx`, `comment-menu.tsx`, `report-dialog.tsx`, `spoiler-text.tsx`, `comments-list.tsx` (клиент, «Показать ещё»), `comments-skeleton.tsx`
- Modify: `src/app/anime/[id]/page.tsx`, `src/app/anime/[id]/watch/[number]/page.tsx` — `<Suspense fallback={<CommentsSkeleton />}><CommentsSection target={…} /></Suspense>` после основного блока
- Test: `tests/unit/components/spoiler-text.test.tsx`

**Interfaces:**
- Consumes: 2.1, 2.2.
- Produces: `CommentsSection({ target }: { target: CommentTarget })`; пропсы модераторского меню `isModerator`, которые использует задача 3.2.

- [ ] **Step 1: Тест `spoiler-text`.** До клика текст в `aria-hidden` и есть кнопка «Показать спойлер» с `aria-expanded="false"`; после клика текст доступен и `aria-expanded="true"`.
- [ ] **Step 2:** Запуск — падает. Реализация по §4 (тексты дословно). Запуск — PASS.
- [ ] **Step 3:** Подключить к обеим страницам. Данные тайтла остаются в `use cache`, секция — отдельная граница.
- [ ] **Step 4:** Коммит.

### Task 2.4: Мок и E2E

**Files:**
- Modify: `tests/mock-supabase/server.mjs` — `comments` (PATCH только `body`, остальное — 401 `42501`; DELETE → `status: "deleted"`, `body: null`), `user_bans` (чтение своих), `comment_reports`, `/rest/v1/rpc/comment_reply_previews`; правила ветки, флуда (5 в минуту), бана с теми же кодами и HTTP-статусами (`PT429` → 429, `PT403` → 403, `PT422` → 422)
- Create: `tests/e2e/comments.spec.ts`

- [ ] **Step 1: Тесты (по §8).**
  - «гость видит „Войдите, чтобы написать“»;
  - «написать, ответить, ответить на ответ с @ником»;
  - «изменить — пометка „изменён“»;
  - «удалить корень с ответами — „Комментарий удалён“»;
  - «спойлер размыт до клика»;
  - «счётчик 2000 и ошибка флуда на 6-м»;
  - «жалоба и повторная жалоба»;
  - «обсуждение серии отдельно от обсуждения тайтла».

  Перед вводом — `toBeVisible()`.
- [ ] **Step 2:** `npx playwright test tests/e2e/comments.spec.ts` — падает, пока мок не расширен; после расширения — PASS. Затем `--repeat-each=10` — без падений.
- [ ] **Step 3:** `npm run verify` — 6/6. `DEVELOPMENT.md` (таблица E2E), Obsidian PR. `trail check`. Затем коммит, PR, слияние.

---

## PR 5a-3 · `feature/moderation` — меню модератора и `/moderation`

### Task 3.1: Действия модератора и данные

**Files:**
- Create: `src/features/moderation/actions.ts`, `src/features/moderation/model.ts`, `src/features/moderation/queries.ts`
- Test: `tests/unit/moderation.test.ts`

**Interfaces:**
- Produces:
  - `type BanDuration = "1d" | "7d" | "30d" | "forever"`, `parseBanDuration(raw: unknown): BanDuration | null`;
  - `hideComment(id: number)`, `restoreComment(id: number)`, `dismissReports(commentId: number)`, `banUser(userId: string, duration: BanDuration, reason?: string)`, `unbanUser(userId: string)` — все `Promise<ActionResult>`. Каждое — одна вставка `moderation_actions` (`action`, `comment_id` / `target_user_id`, `ban_duration`, `reason`);
  - `getOpenReports(cursor: string | null): Promise<{ items: ReportGroup[]; nextCursor: string | null }>`;
  - `getActiveBans(): Promise<{ userId: string; username: string; expiresAt: string | null; reason: string | null }[]>`;
  - `type ReportGroup = { comment: CommentView & { href: string }; counts: Record<"spam" | "offensive" | "spoiler" | "other", number>; details: string[]; firstReportedAt: string }`.

- [ ] **Step 1: Тесты.**
  - `parseBanDuration("7d") === "7d"`, `parseBanDuration("2d") === null`;
  - без роли модератора `hideComment` → «Недостаточно прав» без обращения к базе;
  - `banUser` вставляет `{ action: "ban", target_user_id, ban_duration: "7d" }` без `expires_at`: срок считает база;
  - ошибка `PT422` → «Это действие недоступно»;
  - `ReportGroup.href` для серии — `/anime/1/watch/2#comment-5`.
- [ ] **Step 2: Реализация.** Запуск — падает. Реализация. Запуск — PASS. Коммит.

### Task 3.2: Меню модератора и страница `/moderation`

**Files:**
- Modify: `src/features/comments/components/comment-menu.tsx`, `comment-item.tsx` (метка «Скрыт»), `src/features/auth/components/user-menu.tsx` (ссылка «Модерация» для `moderator`/`admin`)
- Create: `src/features/moderation/components/ban-dialog.tsx`, `report-list.tsx`, `active-bans.tsx` (список и кнопка «Снять бан»), `src/app/moderation/page.tsx`
- Modify: `tests/mock-supabase/server.mjs` (модератор `moderator@e2e.test`, видимость `hidden`, `POST /rest/v1/moderation_actions` с эффектами `hide` / `restore` / `dismiss_reports` / `ban` / `unban` и `PT422`), новый `tests/e2e/moderation.spec.ts`

- [ ] **Step 1: E2E.**
  - «модератор скрывает — гость не видит, жалоба уходит из /moderation»;
  - «вернуть скрытый»;
  - «бан на 7 дней — у забаненного форма заменена „Вы заблокированы до …“»;
  - «Снять бан в /moderation — форма у пользователя снова есть»;
  - «отклонить жалобы»;
  - «обычный пользователь: /moderation — 404»;
  - «гость: /moderation — 404».
- [ ] **Step 2:** Реализация. `/moderation`: `getCurrentProfile()` → не модератор → `notFound()`, `robots: { index: false }`.
- [ ] **Step 3:** E2E — PASS, `--repeat-each=10` — без падений. `npm run verify` — 6/6. Obsidian PR, `trail check`. Затем коммит, PR, слияние.

---

## PR 5b-1 · `feature/notifications-schema` — уведомления в базе

### Task 4.1: Миграция

**Files:**
- Create: `supabase/migrations/20261104090000_notifications.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces:
  - таблицы `notifications`, `notification_prefs` по §6.1;
  - `private.comments_notify()` — `after insert or update of status on comments`, §6.2, §6.3, удаление `reply`-уведомлений при скрытии;
  - `private.notify_new_episodes(anime_ids integer[], numbers integer[]) returns void` — общая часть обоих триггеров: на вход уже свёрнутые пары «тайтл → максимальный номер», на выходе одна запись на `(получатель, тайтл)`;
  - `private.episodes_notify_insert()` — `after insert on episodes referencing new table as new_rows for each statement`;
  - `private.episodes_notify_update()` — `after update on episodes referencing old table as old_rows new table as new_rows for each statement` (без списка колонок: Postgres не допускает его вместе с таблицами переходов);
  - `private.notify_enabled(uid uuid, kind text) returns boolean`.

- [ ] **Step 1: Таблицы.** Индексы (в том числе уникальный частичный `notifications_new_episode_unread_key` на `(user_id, anilist_id) where type = 'new_episode' and read_at is null`), check `cover_url` (≤ 500, `s4.anilist.co/file/anilistcdn/`), права (`update (read_at)`), политики.
- [ ] **Step 2: Триггеры.**
  - Серии сначала свернуть до `(anilist_id, max(number))`: в одном `on conflict do update` строку нельзя обновить дважды.
  - Склейка — `on conflict (user_id, anilist_id) where type = 'new_episode' and read_at is null do update set episode_number = greatest(notifications.episode_number, excluded.episode_number), created_at = now()`.
  - Обложка из `anime_list`, не прошедшая check, записывается как `null`.
  - Получатели ответа — `{автор корня, reply_to_user_id} − {автор ответа}`.
- [ ] **Step 3:** Коммит миграции **до** применения.

### Task 4.2: Применить и проверить

**Files:**
- Modify: `scripts/rls-check.mjs`, `ARCHITECTURE.md`, `DEVELOPMENT.md`

- [ ] **Step 1:** `apply_migration`, `get_advisors` (security и performance — нет новых), `npm run db:types`, `npm run typecheck`.
- [ ] **Step 2:** Блок «Уведомления» в `rls-check.mjs` (§8). Ожидаемые проверки:
  - `check("ответ B создал уведомление A", n === 1)`;
  - `check("ответ себе — без уведомления", n === 0)`;
  - `check("2 серии подряд — одно непрочитанное, номер последней", rows.length === 1 && rows[0].episode_number === 3)`;
  - `check("пакетная вставка 3 серий одним insert — одно уведомление с номером последней", …)`;
  - `check("повторный upsert own→own — без новых", …)`;
  - `check("после прочтения новая серия — новая строка", rows.length === 2)`;
  - `check("настройка выключена — уведомления нет", …)`;
  - `check("A не видит уведомления B", …)`;
  - `check("A не вставляет уведомление", !!error)`;
  - `check("A меняет только read_at", …)`;
  - `check("A не читает настройки B", …)`.

  Серии вставляются admin-клиентом на `PROBE_ANIME_ID`, A держит тайтл в `anime_list` со статусом `watching`.
- [ ] **Step 3:** `npm run rls:check` — все ✅.
- [ ] **Step 4:** ADR-026 в `ARCHITECTURE.md`; Obsidian (таблицы, ADR, PR); `npm run verify` — 6/6; `trail check`. Затем коммит, PR, слияние.

---

## PR 5b-2 · `feature/notifications-ui` — колокольчик, `/notifications`, настройки

### Task 5.1: Модель, запросы, действия, счётчик

**Files:**
- Create: `src/features/notifications/model.ts`, `queries.ts`, `actions.ts`, `src/app/api/notifications/unread-count/route.ts`
- Test: `tests/unit/notifications.test.ts`

**Interfaces:**
- Produces:
  - `badgeLabel(count: number): string | null` — `0 → null`, `9 → "9"`, `10 → "9+"`;
  - `notificationText(n: NotificationRow, actorName: string | null): string` — «{ник} ответил(а) на ваш комментарий» / «Вышла серия N»;
  - `notificationHref(n): string` — `reply` → `/anime/{id}[/watch/{n}]#comment-{commentId}`, `new_episode` → `/anime/{id}/watch/{n}`;
  - `getUnreadCount(): Promise<number | null>`;
  - `getNotifications(cursor: string | null)`;
  - `markRead(id: number)`, `markAllRead()`, `saveNotificationPrefs(input: { reply: boolean; newEpisode: boolean })` — все возвращают `Promise<ActionResult>`;
  - `GET /api/notifications/unread-count` → `200 { count }` с `Cache-Control: no-store`, без сессии — `401`.

- [ ] **Step 1: Тесты** на `badgeLabel`, `notificationText` (оба типа, нет актёра — «Пользователь»), `notificationHref` (тайтл, серия, `new_episode`).
- [ ] **Step 2:** Запуск — падает. Реализация. Запуск — PASS. Коммит.

### Task 5.2: Колокольчик, страница, настройки, мок, E2E

**Files:**
- Create: `src/features/notifications/components/notification-bell.tsx` (сервер, начальный счётчик) + `bell-poller.tsx` (клиент: `usePathname`, `setInterval(60_000)`, `visibilitychange`), `notification-list.tsx`, `notification-prefs-form.tsx`; `src/app/(account)/notifications/page.tsx`
- Modify: `src/components/layout/site-header.tsx` (колокольчик в своём `<Suspense>` перед `UserMenu`), `src/app/(account)/account/page.tsx` (блок «Уведомления»), `src/features/auth/validation.ts` (`isProtectedPath` — добавить `/notifications`; тест в `tests/unit/auth-validation.test.ts`)
- Modify: `tests/mock-supabase/server.mjs` — `notifications`, `notification_prefs`, уведомление при ответе, `POST /__test/episode-released` (только мок)
- Create: `tests/e2e/notifications.spec.ts`
- Test: `tests/unit/components/bell-poller.test.tsx` — фейковые таймеры и подмена `document.visibilityState`:
  - видимая вкладка: запрос раз в 60 с;
  - `hidden`: за 5 минут ни одного запроса, интервал снят;
  - возврат в `visible`: сразу один запрос, затем снова раз в 60 с;
  - смена `pathname` на скрытой вкладке запрос не отправляет.

- [ ] **Step 1: Тесты.**
  - unit `bell-poller`;
  - E2E:
    - «после ответа у автора колокольчик показывает 1»;
    - «клик по уведомлению ведёт к #comment-<id> и снимает выделение»;
    - «Прочитать все — счётчик пропадает»;
    - «выход новой серии из списка „Смотрю“ — „Вышла серия N“»;
    - «настройка выключена — уведомления нет»;
    - «гость: /notifications → /login?next=/notifications».
- [ ] **Step 2:** Реализация по §7 (тексты и `aria-label` дословно).
- [ ] **Step 3:** Тесты — PASS, `--repeat-each=10` — без падений. `npm run verify` — 6/6. `DEVELOPMENT.md`, ROADMAP (этап 5 ✅ после слияния), Obsidian (PR, Dashboard). `trail check`. Затем коммит, PR, слияние.

---

## Самопроверка плана (выполнена)

- **Покрытие спека:**
  - §3 — задачи 1.1–1.3;
  - §4 — 2.1–2.4;
  - §5 — 3.1–3.2;
  - §6 — 4.1–4.2;
  - §7 — 5.1–5.2;
  - §8 — тесты в каждом PR;
  - §9 — шаги документации в 1.3, 4.2 и в каждом PR;
  - §10 — разбиение.
- **Имена сквозные:** `CommentTarget`, `CommentView`, `ActionResult`, `commentErrorMessage`, `getViewer` (2.1/2.2 → 3.x); `private.is_moderator` (1.1 → 1.2, 4.1).
- **Миграции:** timestamp `20261103…` и `20261104…` позже последней (`20261102101709`). Если на момент работы время позже — взять текущее.
