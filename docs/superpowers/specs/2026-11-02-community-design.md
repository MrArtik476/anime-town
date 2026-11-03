# Этап 5 «Сообщество» — дизайн

Дата: 2026-11-02 · Статус: согласован с правками владельца (2026-11-03) · План: `docs/superpowers/plans/2026-11-02-community.md`

## 1. Цель и рамки

Зрители обсуждают тайтлы и серии, жалуются на нарушения, модератор наводит порядок; вошедший пользователь узнаёт об ответах на свои комментарии и о новых сериях тайтлов из своего списка.

**Входит:** комментарии к тайтлу и к серии с ответами в один уровень; жалобы; скрытие и возврат комментариев модератором; баны на 1 д / 7 д / 30 д / навсегда и их снятие; журнал действий модератора; уведомления внутри сайта (ответ, новая серия) с настройками в профиле.

**Не входит (YAGNI или другие этапы):** лайки и сортировка по популярности; HTML и markdown в тексте; правка флажка «Спойлер» после публикации; Realtime; письма (этап 8, SMTP); назначение ролей, просмотр журнала и полная админка (этап 6); удаление старых уведомлений по расписанию (вернуться, когда таблица вырастет).

**Решения, уже согласованные с владельцем** (в спеке не пересматриваются): одна таблица `comments`; ответы в один уровень; публикация сразу, модерация по жалобам; уведомления только на сайте; архитектура A — запись через Server Action от имени пользователя, права в RLS, уведомления — триггерами; Realtime нет.

## 2. Архитектура

```
Браузер ──► Server Action (features/comments, features/moderation, features/notifications)
              │ клиент Supabase с cookie пользователя — никакого service role
              ▼
           PostgREST ──► RLS + права на колонки ──► таблицы public.*
                                │                        │ триггеры (security definer, схема private)
                                ▼                        ▼
                     private.is_moderator()     проверки ветки, флуд-лимит, баны,
                     private.is_banned()        reply_count, журнал модерации, уведомления
```

- **Запись** — Server Actions от имени пользователя (как `features/list/actions.ts`). Сервер проверяет форму ввода, но права решает база: любой обход Server Action через Data API упирается в те же RLS и триггеры.
- **Схема `private`** не входит в схемы, открытые через Data API, поэтому её функции нельзя вызвать как RPC.
  - Триггерные функции — `security definer`, `set search_path = ''`, `execute` отозван у `public`, `anon`, `authenticated`.
  - Функции-помощники для политик `private.is_moderator()` и `private.is_banned()` — без аргументов (проверяют `auth.uid()`), `security definer`, `stable`, `set search_path = ''`. В политиках вызываются только как `(select private.is_moderator())` и `(select private.is_banned())`: значение считается один раз на запрос, а не на каждую строку.
  - Права в миграции явно: `grant usage on schema private to authenticated`; `revoke execute on all functions in schema private from public, anon, authenticated`; затем `grant execute` для `authenticated` только на эти две функции. Политики выполняются от роли запроса, поэтому без `execute` они не сработают; RPC от этого не появляется — схема не открыта.
- **Чтение** — серверные компоненты в своём `<Suspense>` на странице тайтла и серии. Данные тайтла остаются в `use cache` (ADR-019, ADR-020); блок комментариев читает cookies и рендерится на каждый запрос. «Показать ещё» — Route Handler `GET /api/comments` (как `/api/catalog`).
- **После записи** — `refresh()`, а не `revalidatePath`: он сбросил бы кэш AniList (ADR-018).
- **Ошибки базы** приходят как SQLSTATE. Свои ошибки используют коды PostgREST вида `PTxxx`: PostgREST отдаёт HTTP-статус `xxx`, поэтому и прямой вызов Data API получает настоящие 429/403/422, а не общий 400 (решение — в ADR-025). Модуль `features/comments/errors.ts` переводит коды в сообщения на русском:

| Код | HTTP | Когда | Сообщение |
|---|---|---|---|
| `PT429` | 429 | флуд-лимит | «Слишком часто. Подождите немного и попробуйте снова» |
| `PT403` | 403 | действующий бан | «Вы заблокированы до {дата}» / «Вы заблокированы» |
| `PT422` | 422 | неверная ветка, недопустимое действие модератора, жалоба на свой комментарий | «Это действие недоступно» |
| `23505` | 409 | повторная жалоба | «Вы уже пожаловались на этот комментарий» |
| `23514` | 400 | нарушен check (длина, домен обложки) | «Неверные данные» |
| `42501` / пусто | 401/403 | RLS или права на колонки | «Недостаточно прав» |

## 3. Данные

Новые таблицы в `public`, у каждой включён RLS. Права как в существующих миграциях: `revoke all` у `anon`/`authenticated`/`service_role`, потом точечные `grant`. Внешние ключи проиндексированы (performance advisor). Типы — `src/types/database.ts` после каждой миграции.

### 3.1 `comments`

| Колонка | Тип | Правило |
|---|---|---|
| `id` | `bigint identity` pk | |
| `user_id` | `uuid` → `profiles` on delete cascade | `default auth.uid()`; `with check user_id = auth.uid()` |
| `anilist_id` | `integer` > 0 | |
| `episode_id` | `bigint` → `episodes` on delete cascade, null | null — обсуждение тайтла |
| `parent_id` | `bigint` → `comments` on delete cascade, null | null — корневой |
| `reply_to_user_id` | `uuid` → `profiles` on delete set null, null | кому отвечали («@ник») |
| `body` | `text`, null | `char_length(btrim(body)) between 1 and 2000`; `(status = 'deleted') = (body is null)` |
| `is_spoiler` | `boolean` default false | |
| `status` | `text` default `'visible'` | `visible` / `hidden` / `deleted` |
| `reply_count` | `integer` default 0 | число видимых ответов; пишет только триггер |
| `anime_title` | `text`, null | `char_length between 1 and 300`; снимок тайтла для уведомлений (§6.3) |
| `anime_cover_url` | `text`, null | `char_length <= 500` и `~ '^https://s4\.anilist\.co/file/anilistcdn/'` — единственный источник обложек (`src/lib/anilist/images.ts`, `next.config.ts`) |
| `created_at`, `edited_at` | `timestamptz` | `edited_at` ставит триггер при смене текста |

Снимок заполняет Server Action из данных AniList на сервере.

**Права на колонки:**
- `select` — всем;
- `insert (anilist_id, episode_id, parent_id, reply_to_user_id, body, is_spoiler, anime_title, anime_cover_url)` — `authenticated`;
- `update (body)` — `authenticated`, и только это. `status`, `is_spoiler`, `parent_id`, `reply_count`, снимок и остальные колонки клиент изменить не может — их меняют только триггеры;
- `delete` — `authenticated`. Удаление мягкое: триггер `before delete` превращает его в `status = 'deleted'` (см. ниже).

**Индексы:**
- корни тайтла: `(anilist_id, created_at desc, id desc) where parent_id is null and episode_id is null`;
- корни серии: `(episode_id, created_at desc, id desc) where parent_id is null`;
- ответы: `(parent_id, created_at, id)`;
- флуд-лимит и FK: `(user_id, created_at desc)`;
- FK: `reply_to_user_id`.

**RLS:**
- `select` для `anon`: `status <> 'hidden'`;
- `select` для `authenticated`: `status <> 'hidden' or (select private.is_moderator())`;
- `insert` для `authenticated`: `user_id = (select auth.uid())` и `not (select private.is_banned())`, а также `episode_id is null` или серия существует, видима и относится к тому же тайтлу: `exists (select 1 from episodes e where e.id = episode_id and e.anilist_id = comments.anilist_id)`. Политика `episodes` уже скрывает серии без прав;
- `update` (только текст) и `delete` для `authenticated`: `user_id = (select auth.uid()) and status = 'visible'`. Политик `update`/`delete` для модератора нет: он действует через `moderation_actions` (§3.4).

**Триггеры** (все в `private`):
- **`comments_before_insert`**:
  - **Ветка.** Если `parent_id` задан, родитель должен быть корневым (`parent_id is null`), видимым (`status = 'visible'`), с теми же `anilist_id` и `episode_id`. `reply_to_user_id` — автор родителя или одного из ответов этой ветки. Иначе `PT422`: так нельзя упомянуть произвольного пользователя и получить ему уведомление.
  - **Флуд-лимит.** Берётся `pg_advisory_xact_lock(hashtext(user_id::text))`, считаются комментарии пользователя за 1 мин и за 1 ч: лимит 5 и 30, при превышении `PT429`. Удалённые и скрытые тоже считаются.
  - **Бан** проверяется повторно с кодом `PT403` и датой окончания в `detail`, чтобы сообщение было понятным. Политика RLS — второй рубеж.
  - Принудительно: `status = 'visible'`, `reply_count = 0`, `edited_at = null`, `created_at = now()`.
- **`comments_before_update`**: если `body` изменился — `edited_at := now()`. Других проверок не нужно: клиенту доступна только колонка `body`, остальное меняют триггеры.
- **`comments_before_delete`** — мягкое удаление автором: `update … set status = 'deleted', body = null, is_spoiler = false where id = old.id`, затем `return null`, и строка физически не удаляется. Каскадное удаление (удалили серию или профиль) срабатывает с `pg_trigger_depth() > 1` и проходит как обычное.
- **`comments_after_change`** (`after insert or update of status`): `reply_count` корня — +1 при вставке видимого ответа, ±1 при смене статуса ответа.
- **`comments_notify`** (отдельный триггер, появляется в 5b-1 вместе с таблицей `notifications`): уведомления об ответе (§6.2); при скрытии удаляет непрочитанные уведомления `reply` об этом комментарии.

**Удалённый корень с ответами** остаётся в выдаче как «Комментарий удалён» (текста в базе уже нет), без ответов — не показывается. Удалённые ответы не показываются.

**Скрытый корень** не виден не-модератору вместе со всей веткой: ответы выбираются по id видимых корней.

### 3.2 `comment_reports`

`id`, `comment_id` → `comments` cascade, `reporter_id` (`default auth.uid()`) → `profiles` cascade, `reason` (`spam` / `offensive` / `spoiler` / `other`), `details text` ≤ 500 (необязательно), `status` (`open` / `resolved` / `dismissed`), `resolved_by` → `profiles` set null, `resolved_at`, `created_at`.

- **Ключи и индексы:** `unique (comment_id, reporter_id)` — одна жалоба на пару, повтор даёт `23505`; индексы `reporter_id`, `resolved_by`, `(created_at) where status = 'open'`.
- **Права:** `insert (comment_id, reason, details)` и `select` — `authenticated`; `update` и `delete` не выдаются, статус меняют только действия модератора (§3.4).
- **RLS:**
  - `insert`: `reporter_id = (select auth.uid())` и `not (select private.is_banned())`;
  - `select`: свои или `(select private.is_moderator())`.
- **Триггер перед вставкой:** комментарий видим и не свой (иначе `PT422`); `status = 'open'` принудительно.

### 3.3 `user_bans`

`id`, `user_id` → `profiles` cascade, `moderator_id` → `profiles` set null, `reason text` ≤ 500, `expires_at timestamptz` (null — навсегда; check `> created_at`), `revoked_at timestamptz`, `revoked_by` → `profiles` set null, `created_at`. Индексы `(user_id, expires_at)`, FK `moderator_id`, `revoked_by`.

- **Права и RLS:** `select` — свои строки или модератор. `insert`, `update` и `delete` клиенту не выдаются: баны создаёт и снимает только триггер действий модератора (§3.4).
- **`private.is_banned()`:** у `auth.uid()` есть бан с `revoked_at is null and (expires_at is null or expires_at > now())`.

### 3.4 `moderation_actions` — команды модератора и журнал

`id`, `moderator_id` (`default auth.uid()`) → `profiles` set null, `action` (`hide` / `restore` / `dismiss_reports` / `ban` / `unban`), `comment_id` → `comments` set null, `target_user_id` → `profiles` set null, `ban_duration` (`1d` / `7d` / `30d` / `forever`, только для `ban`), `reason text` ≤ 500, `created_at`. Индексы по FK и `(created_at desc)`.

Каждое действие модератора — это вставка строки сюда. Строка одновременно команда и запись журнала:
- **Права:** `insert (action, comment_id, target_user_id, ban_duration, reason)` и `select` — `authenticated`; `update` и `delete` не выдаются никому, кроме `service_role`.
- **RLS:** `insert` — `moderator_id = (select auth.uid()) and (select private.is_moderator())`; `select` — модератор.
- **Триггер `private.moderation_apply()`** (`before insert`, `security definer`) проверяет и применяет действие в той же транзакции:

| `action` | Условие (иначе `PT422`) | Эффект |
|---|---|---|
| `hide` | комментарий `visible` | `status = 'hidden'`; открытые жалобы → `resolved` (`resolved_by`, `resolved_at`); `target_user_id` := автор |
| `restore` | комментарий `hidden` | `status = 'visible'`; `target_user_id` := автор |
| `dismiss_reports` | есть открытые жалобы на комментарий | жалобы → `dismissed` |
| `ban` | цель — роль `user`, не сам модератор; `ban_duration` задан | `insert into user_bans`, `expires_at = now() + interval` (для `forever` — null); срок считает база, а не часы клиента |
| `unban` | у цели есть действующий бан | `revoked_at = now()`, `revoked_by` у действующих банов |

Если условие не выполнено, вставка откатывается целиком. Поэтому в журнале нет строк без эффекта и эффектов без строки, а подделать журнал нельзя: любая принятая строка — это реально выполненное действие от имени `auth.uid()`.

### 3.5 Функция выдачи ответов

`public.comment_reply_previews(root_ids bigint[], per_root int default 3) returns setof comments` — `security invoker`, `stable`, поэтому RLS действует как при обычном чтении. Внутри `lateral` берёт первые `per_root` видимых ответов каждого корня, у модератора — ещё и скрытые. Это один запрос на страницу из 20 корней вместо 20. Больше 20 корней за вызов не принимается.

## 4. Комментарии: выдача и UI

- **Корни** — от новых к старым, keyset по `(created_at, id)`, по 20 на страницу. Фильтр: `status = 'visible' or (status = 'deleted' and reply_count > 0)`, у модератора — ещё и `hidden`. Курсор — `base64url("<created_at>|<id>")`, проверяется в `model.ts`.
- **Ответы** — от старых к новым. У каждого корня показываются первые 3 (`comment_reply_previews`); если `reply_count > 3`, кнопка «Показать ещё ответы (N)» подгружает по 20 через `GET /api/comments?root=<id>&cursor=…`.
- **Авторы** — вторым запросом `profiles` по набору id (ник, имя, аватар). Встроенные выборки PostgREST не используются: мок их не поддерживает.
- **Модуль `src/features/comments/`:**
  - `model.ts`: `parseCommentBody` (обрезка пробелов, `\r\n → \n`, не больше трёх переводов строки подряд, 1–2000 символов), разбор курсора, сборка дерева, правило «удалённый корень»;
  - `errors.ts`;
  - `queries.ts`: `getCommentsPage`, `getReplies`, `getViewer` (вошёл ли, роль, действующий бан);
  - `actions.ts`: `createComment`, `editComment`, `deleteComment`, `reportComment`;
  - `components/`.
- **`createComment(target, input)`.** `target` — это `{ animeId, episodeNumber? }` и, если это ответ, `replyToCommentId`. Сервер сам находит `episode_id` по номеру серии. Если `replyToCommentId` указывает на ответ, `parent_id` = корень этого ответа, `reply_to_user_id` = его автор. Снимок `anime_title` и `anime_cover_url` берётся из `getLocalizedAnimeById`, как в `anime_list`.
- **Где показывается.** Блок `CommentsSection` — на `/anime/[id]` (обсуждение тайтла) и на `/anime/[id]/watch/[number]` (обсуждение серии), в отдельном `<Suspense>` со скелетоном.
- **Гость** читает комментарии и видит «Войдите, чтобы написать» со ссылкой на `/login?next=<текущий путь>`. Забаненный видит «Вы заблокированы до …» вместо формы.
- **Форма:** поле с видимым счётчиком «N / 2000», флажок «Спойлер», кнопка «Отправить». Во время отправки форма заблокирована (`useActionState`), ошибки показываются в `role="alert"`.
- **Комментарий:**
  - аватар, ник, относительное время (`<time dateTime>`), «изменён», «@ник» у ответа;
  - текст — обычный текстовый узел React с `whitespace-pre-wrap`, без `dangerouslySetInnerHTML` и без превращения ссылок в кликабельные;
  - спойлер размыт до нажатия кнопки «Показать спойлер» (`aria-expanded`); размытый текст — `aria-hidden`;
  - у модератора скрытый комментарий помечен «Скрыт».
- **Меню (⋯):** «Ответить», «Изменить» и «Удалить» (свой видимый, удаление — с подтверждением), «Пожаловаться» (чужой видимый, вошедший: диалог с причиной и необязательным пояснением); модератору — «Скрыть» / «Вернуть» и «Забанить автора» (диалог: 1 д / 7 д / 30 д / навсегда, причина).
- **Якоря.** У каждого комментария `id="comment-<id>"`, на него ведут ссылки из уведомлений. Если комментарий за первой страницей, страница открывается сверху — подгрузку до нужного комментария не делаем (YAGNI).

## 5. Модерация

- **Действия модератора.** `src/features/moderation/actions.ts`: `hideComment`, `restoreComment`, `dismissReports(commentId)`, `banUser(userId, duration, reason)`, `unbanUser(userId)`. Каждое — одна вставка в `moderation_actions` от имени модератора (§3.4). Право проверяет RLS, применяет и журналирует триггер. Server Action дополнительно проверяет роль, чтобы сразу дать понятный ответ, но защищает база.
- **`/moderation`:**
  - Серверный компонент: `getCurrentProfile()`; без роли `moderator` или `admin` — `notFound()`, то есть 404 даже для вошедшего обычного пользователя. В меню пользователя ссылка «Модерация» появляется только для этих ролей.
  - Список — открытые жалобы, сгруппированные по комментарию, от старых к новым, по 20. Для каждого комментария: текст (даже скрытый), автор, место (ссылка на тайтл или серию с якорем), число жалоб по причинам, пояснения. Кнопки: «Скрыть» (закрывает жалобы), «Отклонить жалобы», «Забанить автора».
  - Второй блок — «Действующие баны»: ник, до какого числа (или «навсегда»), причина и кнопка «Снять бан» (действие `unban`, пишется в журнал).
- Полная админка (роли, просмотр журнала, управление пользователями) — этап 6.

## 6. Уведомления: данные

### 6.1 Таблицы

`notifications`:

| Колонка | Тип / правило |
|---|---|
| `id` | `bigint identity` pk |
| `user_id` | → `profiles` cascade (получатель) |
| `type` | `reply` / `new_episode` |
| `anilist_id` | `integer` |
| `episode_number` | `integer`, null: для `reply` — серия обсуждения, для `new_episode` — последняя вышедшая |
| `comment_id` | → `comments` cascade, null (только `reply`) |
| `actor_id` | → `profiles` set null, null (кто ответил) |
| `title`, `cover_url` | снимок тайтла (как `anime_list`, ADR-020); `title` ≤ 300, `cover_url` — тот же check, что у `comments.anime_cover_url` (≤ 500, `s4.anilist.co/file/anilistcdn/`). Снимок из `anime_list` с другим адресом обложки записывается с `cover_url = null` |
| `created_at`, `read_at` | |

- **Индексы:** `(user_id, created_at desc, id desc)` — список; `(user_id) where read_at is null` — счётчик; уникальный `(user_id, anilist_id) where type = 'new_episode' and read_at is null` — склейка; FK `comment_id`, `actor_id`.
- **RLS:** `select` — свои; `update (read_at)` — свои. `insert` и `delete` у `authenticated` нет: создают только триггеры.

`notification_prefs`: `user_id` pk → `profiles` cascade, `reply boolean default true`, `new_episode boolean default true`, `updated_at`. Нет строки — всё включено. RLS: `select`, `insert`, `update` — только свои строки.

### 6.2 Триггеры уведомлений (ADR-026)

- **Ответ** — `after insert` на `comments`, если `parent_id` задан. Получатели — автор корня и `reply_to_user_id`, без повторов и без самого автора ответа (себе уведомление не создаётся), у кого `notification_prefs.reply` не выключен. Поля: `comment_id` = новый ответ, `actor_id`, `episode_number` из `episodes` по `episode_id`.
- **Новая серия** — триггеры уровня оператора (`for each statement`) с таблицами переходов, чтобы пакетная запись серий (seed, будущая синхронизация или импорт по расписанию) давала один проход, а не проход на каждую строку:
  - `episodes_notify_insert` — `after insert … referencing new table as new_rows`; берутся видимые строки (`license_status <> 'none'`);
  - `episodes_notify_update` — `after update … referencing old table as old_rows new table as new_rows`; берутся строки, у которых `old.license_status = 'none'` и новый статус видимый (связь по `id`).
  - Два отдельных триггера и без списка колонок: Postgres не допускает таблицы переходов у триггера с несколькими событиями или со списком колонок `update of …`. `insert … on conflict do update` из `seed:test-episodes` попадает в update-триггер; upsert `own → own` уведомлений не создаёт.
  - **Запись.** Сначала серии сворачиваются до одной строки на тайтл (`group by anilist_id`, `max(number)`), иначе `on conflict do update` упадёт на втором обновлении той же строки в одном операторе. Затем — соединение с `anime_list` (статус `watching` или `planned`, `new_episode` не выключен) и `insert … on conflict (user_id, anilist_id) where type = 'new_episode' and read_at is null do update set episode_number = greatest(notifications.episode_number, excluded.episode_number), created_at = now()` по частичному уникальному индексу `notifications_new_episode_unread_key`.
  - Непрочитанное уведомление по тайтлу всегда одно. Снимок `title`/`cover_url` берётся из строки `anime_list` получателя.

### 6.3 Откуда снимок тайтла у `reply`

Снимок берётся из комментария, который написал сам получатель: корня или его последнего ответа в этой ветке (`comments.anime_title`, `anime_cover_url`). Server Action заполняет эти поля из данных AniList на сервере. Если кто-то подделает их через Data API, увидит подделку только он сам: чужой снимок в чужое уведомление не попадает. Нет снимка — UI пишет «Аниме №{id}» и показывает заглушку обложки.

## 7. Уведомления: UI

- **Колокольчик** в `SiteHeader` рядом с `UserMenu` (в своём `<Suspense>`), только для вошедших.
  - Серверный рендер даёт начальный счётчик.
  - Клиентский компонент перезапрашивает `GET /api/notifications/unread-count` (`no-store`, `{ count }`, 401 без сессии) при смене `pathname` и раз в 60 с. На скрытой вкладке опрос на паузе: по `visibilitychange` → `hidden` интервал снимается, по возврату → `visible` — сразу один запрос и новый интервал. Запрос по смене `pathname` на скрытой вкладке тоже не отправляется.
  - Бейдж «N», от 10 — «9+»; `aria-label="Уведомления: N непрочитанных"`.
- **`/notifications`** — вход обязателен (`/login?next=/notifications`).
  - Список от новых к старым, keyset по 20, «Показать ещё»; непрочитанные выделены.
  - Строка: обложка, текст («{ник} ответил(а) на ваш комментарий» / «Вышла серия N»), тайтл, время.
  - Клик отмечает уведомление прочитанным (Server Action `markRead`) и ведёт на тайтл, серию или якорь комментария.
  - Кнопка «Прочитать все» — `update read_at = now() where read_at is null`.
- **Профиль** `/account` — блок «Уведомления» с двумя переключателями («Ответы на мои комментарии», «Новые серии из моего списка»), Server Action `saveNotificationPrefs` (upsert своей строки).

## 8. Тесты

- **Unit (Vitest):** `parseCommentBody` (границы 1/2000, пробелы, переводы строк), курсоры (корректный, мусор, чужой формат), сборка дерева и правило «удалённый корень», перевод SQLSTATE в сообщения, расчёт `expires_at` по сроку бана, тексты уведомлений, формат бейджа.
- **`npm run rls:check`** (настоящий проект; временные пользователи A, B и модератор M — роль ставит admin-клиент). Добавить проверки:
  - **Комментарии:**
    - гость читает видимые и не пишет;
    - A не правит и не удаляет комментарий B;
    - A меняет текст своего видимого комментария (`edited_at` выставлен);
    - A не меняет у своего комментария `status`, `is_spoiler`, `parent_id`, `reply_count`, `anime_title`, `anime_cover_url`, `user_id`, `anilist_id` — каждая колонка отдельной проверкой, ожидается `42501`;
    - `anime_cover_url` с чужим доменом или длиннее 500 символов — `23514`;
    - `delete` своего комментария оставляет строку со `status = 'deleted'`;
    - текст удалённого комментария — `null`;
    - скрытый комментарий не виден гостю, A и самому автору, но виден M;
    - ответ на ответ, ответ в чужую ветку и `reply_to` чужого пользователя отклоняются (`PT422`, HTTP 422);
    - серия другого тайтла и серия без прав отклоняются.
  - **Флуд-лимит:** шестой комментарий за минуту — `PT429` (HTTP 429); шесть параллельных вставок — ровно 5 успешных.
  - **Баны:**
    - забаненный не пишет комментарий и жалобу (`PT403`, HTTP 403);
    - A не вставляет в `user_bans` и `moderation_actions` (`42501`);
    - M не банит модератора и себя (`PT422`);
    - после `unban` бывший забаненный снова пишет.
  - **Жалобы:**
    - вторая жалоба на тот же комментарий — `23505`;
    - жалоба на свой комментарий отклоняется;
    - A не видит чужие жалобы, M видит;
    - A не меняет статус жалобы (`42501`).
  - **Действия модератора и журнал:**
    - `hide`, `restore`, `dismiss_reports`, `ban`, `unban` от M дают эффект и одну строку журнала;
    - недопустимое действие (`hide` уже скрытого, `dismiss_reports` без жалоб) — `PT422`, строки в журнале нет;
    - M не меняет и не удаляет строки журнала.
  - **Уведомления:**
    - ответ B на комментарий A создаёт уведомление A, ответ A самому себе — нет;
    - две новые серии подряд дают одно непрочитанное уведомление с номером последней, после прочтения следующая серия создаёт новое;
    - при выключенной настройке уведомления нет;
    - A не видит уведомления B, не создаёт уведомления и не меняет в них ничего, кроме `read_at`;
    - A не читает и не меняет настройки B.
  - Временные серии — на `PROBE_ANIME_ID`, удаляются в `finally`, как сейчас.
- **E2E на `tests/mock-supabase`.** Мок расширяется таблицами `comments`, `comment_reports`, `user_bans`, `notifications`, `notification_prefs`, RPC `comment_reply_previews` и упрощённой логикой триггеров: ветка, флуд-лимит, бан, уведомление об ответе. Для `new_episode` нужен тестовый вход только в моке, «серия вышла». В моке заведён модератор. Сценарии:
  - гость видит «Войдите, чтобы написать»;
  - написать, ответить, ответить на ответ («@ник»), изменить, удалить корень с ответами («Комментарий удалён»);
  - спойлер размыт до клика;
  - счётчик символов и ошибка флуда;
  - жалоба и повторная жалоба;
  - модератор скрывает комментарий: он пропадает у гостя, на `/moderation` жалоба уходит из списка;
  - бан: у забаненного форма заменена сообщением; «Снять бан» в `/moderation` возвращает форму;
  - обычному пользователю `/moderation` отдаёт 404;
  - колокольчик: не опрашивает сервер на скрытой вкладке (unit с фейковыми таймерами); показывает 1 после ответа, `/notifications` ведёт к комментарию, «Прочитать все» обнуляет счётчик;
  - после выключения настройки уведомление не приходит.

  Настоящая логика базы проверяется в `rls:check`, мок только повторяет контракт.
- **Правило из `.trail/learnings`** (нестабильный E2E поиска): перед `focus()`, `press()` и `pressSequentially()` ждать `toBeVisible()` поля — блоки комментариев тоже потоковые `Suspense`-границы.

## 9. Документация

- **`ARCHITECTURE.md`:**
  - **ADR-025 «Комментарии и модерация»** (5a-1): одна таблица с `episode_id` null, один уровень ответов, публикация сразу и модерация по жалобам; клиенту доступен только `update (body)` и мягкий `delete`; действия модератора — вставка в `moderation_actions`, которую применяет триггер (журнал = команды); флуд-лимит и баны в базе; коды `PT429`/`PT403`/`PT422`, чтобы PostgREST отдавал настоящие HTTP-статусы (свои коды вида `AT…` отклонены: PostgREST вернул бы на них 400). Альтернативы: премодерация, дерево любой глубины, лимит в памяти процесса — не переживает перезапуск и несколько экземпляров.
  - **ADR-026 «Уведомления триггерами»** (5b-1): почему триггеры, а не Server Action (новая серия появляется без участия пользователя — seed, админка); склейка `new_episode`; триггеры серий уровня оператора с таблицами переходов; опрос раз в 60 с только на видимой вкладке вместо Realtime.
  - §2 — новые модули.
- **Obsidian:** заметки ADR, таблиц (`06 - База данных/Таблицы/`) и PR — по правилам CLAUDE.md, через MCP.
- **`DEVELOPMENT.md`:** новые проверки `rls:check` и E2E; как назначить модератора, пока нет админки: SQL `update profiles set role = 'moderator' where username = …` в SQL Editor. Снятие бана — кнопкой в `/moderation`; запасной SQL для владельца (service role, без журнала): `update user_bans set revoked_at = now() where user_id = … and revoked_at is null`.

## 10. Разбиение на PR

| PR | Ветка | Содержание |
|---|---|---|
| 5a-1 | `feature/comments-schema` | миграция `comments`, `comment_reports`, `user_bans`, `moderation_actions`, схема `private`, помощники, триггеры, `comment_reply_previews`; типы; `rls:check`; ADR-025 |
| 5a-2 | `feature/comments-ui` | `features/comments`, блоки на страницах тайтла и серии, `GET /api/comments`, мок, unit и E2E |
| 5a-3 | `feature/moderation` | меню модератора, `features/moderation`, `/moderation`, мок, E2E |
| 5b-1 | `feature/notifications-schema` | миграция `notifications`, `notification_prefs`, триггеры на `comments` и `episodes`; типы; `rls:check`; ADR-026 |
| 5b-2 | `feature/notifications-ui` | колокольчик, `GET /api/notifications/unread-count`, `/notifications`, настройки в профиле, мок, E2E |

Каждый PR сливается только при полностью зелёном `npm run verify`. Миграция сначала коммитится в репозиторий, затем применяется в Supabase. После применения запускается `get_advisors` (security и performance), новых предупреждений быть не должно.

## 11. Риски

- **Флуд-лимит считает и удалённые комментарии.** Так задумано: удаление не обходит лимит.
- **`on delete cascade` у `parent_id`.** Жёсткое удаление корня (только каскадом при удалении аккаунта — такой функции пока нет) удалит и чужие ответы. Вернуться к этому на этапе 6, когда появится удаление аккаунта.
- **Число запросов на странице.** Блок комментариев — это 3 запроса к базе: корни, превью ответов, профили. Плюс `getViewer`, который берёт роль из уже закэшированного `getCurrentProfile`.
- **Размер `notifications`.** Таблица растёт без очистки. При заметном объёме — задание Supabase Cron на удаление прочитанных старше 90 дней (отдельное решение).
