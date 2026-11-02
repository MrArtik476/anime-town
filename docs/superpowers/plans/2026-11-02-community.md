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
  - `private.is_moderator()` и `private.is_banned(uuid)` — `security invoker stable`, `execute` только `authenticated`; схему `private` в Data API не открывать.
- Коды ошибок базы: `AT429` — флуд, `AT403` — бан, `AT422` — недопустимое действие; повторная жалоба — `23505`.
- Лимиты: текст 1–2000 символов после `btrim`; 5 комментариев в минуту и 30 в час; по 20 на страницу; 3 ответа в превью; причина бана и пояснение к жалобе ≤ 500.
- Тексты интерфейса — на русском, дословно как в спеке (§4, §7).
- Текст комментария — только текстовый узел React (`whitespace-pre-wrap`), без `dangerouslySetInnerHTML`.
- E2E: перед `focus()`, `press()` и `pressSequentially()` — `await expect(locator).toBeVisible()` (learning «Нестабильный E2E поиска каталога»).
- Процесс на порту 3000 (PID 18972) не трогать; если мешает `npm ci` — `npm install`.
- После записи — `refresh()`, не `revalidatePath`.
- Перед коммитом — `trail check`; конфликт исправить или объяснить в PR.

## Review Focus

1. **Гонка флуд-лимита.** Шесть параллельных вставок от одного пользователя должны пропустить ровно 5 (advisory lock) — проверка в `rls:check`, задача 1.3.
2. **Ответ на ответ в чужой ветке или подмена `reply_to_user_id`.** Подделав запрос через Data API, нельзя упомянуть постороннего и отправить ему уведомление — `AT422`, задача 1.2.
3. **Удалённый корень без ответов и с ответами.** Без ответов пропадает, с ответами — «Комментарий удалён», текста в ответе API нет — задачи 1.2 и 2.1.
4. **Повторный `seed:test-episodes`.** Upsert `own → own` не создаёт уведомлений, новые серии склеиваются в одно непрочитанное — задача 4.2.
5. **Модератор банит модератора или себя, обычный пользователь вызывает модераторские действия через Data API** — отказ, задачи 1.2 и 1.3.

---

## PR 5a-1 · `feature/comments-schema` — схема комментариев, жалоб, банов, журнала

### Task 1.1: Миграция — таблицы, права, RLS, помощники

**Files:**
- Create: `supabase/migrations/20261103090000_comments.sql`
- Modify: `src/types/database.ts` (`npm run db:types`)

**Interfaces:**
- Produces: таблицы `public.comments`, `comment_reports`, `user_bans`, `moderation_actions` с колонками, check, индексами, правами на колонки и политиками **ровно по §3.1–§3.4**; `private.is_moderator() returns boolean`, `private.is_banned(uid uuid) returns boolean`.

- [ ] **Step 1:** Написать часть миграции: `create schema private`, `grant usage on schema private to authenticated`, обе функции-помощника, четыре таблицы, индексы, `grant`/`revoke` и политики. В политиках — `(select auth.uid())` и `(select private.is_moderator())`, как в существующих миграциях.
- [ ] **Step 2:** Добавить в тот же файл триггеры (задача 1.2) и функцию `comment_reply_previews` (задача 1.2). Миграция — один файл на PR.

### Task 1.2: Триггеры и функция превью ответов

**Files:**
- Modify: `supabase/migrations/20261103090000_comments.sql`

**Interfaces:**
- Produces:
  - `private.comments_before_insert()`, `private.comments_before_update()`, `private.comments_after_change()` — правила §3.1;
  - `private.comment_reports_before_insert()`, `private.comment_reports_before_update()`, `private.comment_reports_after_update()` — §3.2;
  - `private.user_bans_before_insert()`, `private.user_bans_after_insert()` — §3.3;
  - `public.comment_reply_previews(root_ids bigint[], per_root int default 3) returns setof public.comments` (`security invoker stable`, больше 20 id — исключение `AT422`).

- [ ] **Step 1:** Комментарии, вставка. `comments_before_insert`: проверка ветки (родитель корневой и видимый, `anilist_id`/`episode_id` совпадают, `reply_to_user_id` — автор родителя или ответа в ветке) → `AT422`. Затем `pg_advisory_xact_lock(hashtext(new.user_id::text))` и подсчёт за `interval '1 minute'` (≥ 5) и `interval '1 hour'` (≥ 30) → `AT429`. Затем бан → `AT403`, `detail` = `expires_at` (или `forever`).
- [ ] **Step 2:** Комментарии, обновление. `comments_before_update` — таблица переходов из §3.1. Модератор определяется через `private.is_moderator()`, автор — через `old.user_id = auth.uid()`. Если изменился только `reply_count`, проверки пропускаются. При `→ deleted`: `body := null`, `is_spoiler := false`. При смене `body` — `edited_at := now()`.
- [ ] **Step 3:** Комментарии, после изменения. `comments_after_change`: `reply_count` корня; журнал `hide`/`restore` с `moderator_id = auth.uid()`, `comment_id`, `target_user_id = автор`; при `→ hidden` — `update comment_reports set status = 'resolved' … where status = 'open'`.
- [ ] **Step 4:** Жалобы. На жалобу на свой или невидимый комментарий — `AT422`; модератор переводит жалобу только из `open` в `dismissed` и получает автоматически `resolved_by`/`resolved_at`; после обновления — журнал `dismiss_report`.
- [ ] **Step 5:** Баны. Цель — только роль `user`, не сам модератор, иначе `AT422`; после вставки — журнал `ban` с `details = {"expires_at": …}`.
- [ ] **Step 6:** Функция `comment_reply_previews`: `unnest(root_ids) r cross join lateral (select … where parent_id = r order by created_at, id limit per_root)`, фильтр `status = 'visible'` или `hidden` у модератора. `grant execute` для `anon` и `authenticated`.
- [ ] **Step 7:** Коммит миграции **до** применения.

```bash
git add supabase/migrations/20261103090000_comments.sql
git commit -m "feat(db): comments, reports, bans, moderation log"
```

### Task 1.3: Применить, проверить советники, типы, `rls:check`

**Files:**
- Modify: `scripts/rls-check.mjs`, `src/types/database.ts`

**Interfaces:**
- Consumes: всё из 1.1–1.2.
- Produces: помощник `makeModerator()` в `rls-check.mjs` — `makeUser("m")` и `admin.from("profiles").update({ role: "moderator" })`.

- [ ] **Step 1:** Применить миграцию (`apply_migration`), затем `get_advisors` security и performance. Ожидание: новых предупреждений нет. Есть — исправлять новой миграцией, а не правкой применённой.
- [ ] **Step 2:** `npm run db:types`, `npm run typecheck` — зелёный.
- [ ] **Step 3:** Добавить в `rls-check.mjs` блок «Комментарии» с проверками из §8 (комментарии, флуд, баны, жалобы, журнал). Ожидаемые значения:
  - `check("скрытый не виден автору", …data.length === 0)`;
  - `check("6-й комментарий за минуту — AT429", err.code === "AT429")`;
  - `check("6 параллельных вставок — ровно 5 успешных", ok === 5)` — `Promise.all` от нового пользователя C;
  - `check("ответ на ответ — AT422", …)`, `check("reply_to постороннего — AT422", …)`;
  - `check("текст удалённого — null", row.body === null)`;
  - `check("A не банит B", blocked)`, `check("M не банит модератора — AT422", …)`;
  - `check("забаненный не пишет — AT403", …)`, `check("забаненный не жалуется", …)`;
  - `check("повторная жалоба — 23505", …)`;
  - `check("скрытие пишет журнал hide", rows.length === 1)`, `check("A не пишет журнал", !!error)`;
  - `check("A не меняет reply_count", …)`.

  Флуд-проверки — на отдельных пользователях, чтобы лимит не мешал остальным.
- [ ] **Step 4:** `npm run rls:check`. Ожидание: все ✅, код выхода 0.
- [ ] **Step 5:** Документация. ADR-025 в `ARCHITECTURE.md` (§9 спека) и раздел «Комментарии» в §2. `DEVELOPMENT.md`: SQL назначения модератора, новые проверки `rls:check`. Obsidian: заметки таблиц, ADR-025, PR.
- [ ] **Step 6:** `npm run verify` — 6/6 зелёные; `trail check`. Затем коммит, PR, слияние.

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
  - `commentErrorMessage({ code: "AT429" })` = «Слишком часто. Подождите немного и попробуйте снова»; `{ code: "AT403", details: "forever" }` = «Вы заблокированы»; `{ code: "23505" }` = «Вы уже пожаловались на этот комментарий».
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
  - `editComment(id: number, input: { body: string; isSpoiler: boolean }): Promise<ActionResult>`;
  - `deleteComment(id: number): Promise<ActionResult>`;
  - `reportComment(id: number, input: { reason: "spam" | "offensive" | "spoiler" | "other"; details?: string }): Promise<ActionResult>`;
  - `GET /api/comments?anime=<id>&episode=<n>&cursor=…` → `{ comments, nextCursor }`;
  - `GET /api/comments?root=<id>&cursor=…` → `{ replies, nextCursor }`;
  - на неверные параметры — 400 `{ code: "INVALID_PARAMS" }`.

- [ ] **Step 1: Тесты.**
  - гость → `{ ok: false, message: "Войдите, чтобы написать" }`;
  - ответ на ответ (`parent_id: 10`) уходит в `insert` с `parent_id: 10` и `reply_to_user_id` автора ответа;
  - ошибка `AT429` → сообщение из `commentErrorMessage`;
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
- Modify: `tests/mock-supabase/server.mjs` — `comments`, `user_bans` (чтение своих), `comment_reports`, `/rest/v1/rpc/comment_reply_previews`; правила ветки, флуда (5 в минуту), бана и переходов статусов с теми же кодами
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
  - `type BanDuration = "1d" | "7d" | "30d" | "forever"`;
  - `banExpiresAt(d: BanDuration, now: Date): string | null`;
  - `hideComment(id: number)`, `restoreComment(id: number)`, `dismissReports(commentId: number)`, `banUser(userId: string, duration: BanDuration, reason?: string)` — все возвращают `Promise<ActionResult>`;
  - `getOpenReports(cursor: string | null): Promise<{ items: ReportGroup[]; nextCursor: string | null }>`;
  - `type ReportGroup = { comment: CommentView & { href: string }; counts: Record<"spam" | "offensive" | "spoiler" | "other", number>; details: string[]; firstReportedAt: string }`.

- [ ] **Step 1: Тесты.**
  - `banExpiresAt("7d", new Date("2026-11-02T00:00:00Z")) === "2026-11-09T00:00:00.000Z"`; `banExpiresAt("forever", …) === null`;
  - без роли модератора `hideComment` → «Недостаточно прав», без обращения к базе;
  - `ReportGroup.href` для серии — `/anime/1/watch/2#comment-5`.
- [ ] **Step 2:** Запуск — падает. Реализация (пишет триггер журнала, не код). Запуск — PASS. Коммит.

### Task 3.2: Меню модератора и страница `/moderation`

**Files:**
- Modify: `src/features/comments/components/comment-menu.tsx`, `comment-item.tsx` (метка «Скрыт»), `src/features/auth/components/user-menu.tsx` (ссылка «Модерация» для `moderator`/`admin`)
- Create: `src/features/moderation/components/ban-dialog.tsx`, `report-list.tsx`, `src/app/moderation/page.tsx`
- Modify: `tests/mock-supabase/server.mjs` (модератор `moderator@e2e.test`, видимость `hidden`, `user_bans` insert, жалобы `open → dismissed`), `tests/e2e/comments.spec.ts` или новый `tests/e2e/moderation.spec.ts`

- [ ] **Step 1: E2E.**
  - «модератор скрывает — гость не видит, жалоба уходит из /moderation»;
  - «вернуть скрытый»;
  - «бан на 7 дней — у забаненного форма заменена „Вы заблокированы до …“»;
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
  - `private.episodes_notify()` — `after insert or update of license_status on episodes`, §6.2;
  - `private.notify_enabled(uid uuid, kind text) returns boolean`.

- [ ] **Step 1:** Таблицы, индексы (в том числе уникальный частичный `notifications_new_episode_unread_key`), права (`update (read_at)`), политики.
- [ ] **Step 2:** Триггеры. Склейка — `on conflict (user_id, anilist_id) where type = 'new_episode' and read_at is null do update set episode_number = greatest(notifications.episode_number, excluded.episode_number), created_at = now()`. Получатели ответа — `{автор корня, reply_to_user_id} − {автор ответа}`.
- [ ] **Step 3:** Коммит миграции **до** применения.

### Task 4.2: Применить и проверить

**Files:**
- Modify: `scripts/rls-check.mjs`, `ARCHITECTURE.md`, `DEVELOPMENT.md`

- [ ] **Step 1:** `apply_migration`, `get_advisors` (security и performance — нет новых), `npm run db:types`, `npm run typecheck`.
- [ ] **Step 2:** Блок «Уведомления» в `rls-check.mjs` (§8). Ожидаемые проверки:
  - `check("ответ B создал уведомление A", n === 1)`;
  - `check("ответ себе — без уведомления", n === 0)`;
  - `check("2 серии подряд — одно непрочитанное, номер последней", rows.length === 1 && rows[0].episode_number === 3)`;
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
- Test: `tests/unit/components/bell-poller.test.tsx` (фейковые таймеры: при скрытой вкладке не опрашивает, при видимой — раз в 60 с)

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
