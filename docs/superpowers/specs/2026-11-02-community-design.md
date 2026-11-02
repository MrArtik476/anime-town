# Этап 5 «Сообщество» — дизайн

Дата: 2026-11-02 · Статус: на проверке владельца · План: `docs/superpowers/plans/2026-11-02-community.md`

## 1. Цель и рамки

Зрители обсуждают тайтлы и серии, жалуются на нарушения, модератор наводит порядок; вошедший пользователь узнаёт об ответах на свои комментарии и о новых сериях тайтлов из своего списка.

**Входит:** комментарии к тайтлу и к серии с ответами в один уровень; жалобы; скрытие и возврат комментариев модератором; баны на 1 д / 7 д / 30 д / навсегда; журнал действий модератора; уведомления внутри сайта (ответ, новая серия) с настройками в профиле.

**Не входит (YAGNI или другие этапы):** лайки и сортировка по популярности; HTML и markdown в тексте; Realtime; письма (этап 8, SMTP); снятие бана, назначение ролей и полная админка (этап 6); удаление старых уведомлений по расписанию (вернуться, когда таблица вырастет).

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
  - Функции-помощники для политик `private.is_moderator()` и `private.is_banned(uuid)` — `security invoker`, `stable`. Политики выполняются от роли запроса, поэтому `authenticated` получает `usage` на схему и `execute` на эти две функции. RPC от этого не появляется: схема не открыта. Помощники читают `profiles` (публичная таблица) и `user_bans` (свои строки или все — для модератора), поэтому `definer` им не нужен.
- **Чтение** — серверные компоненты в своём `<Suspense>` на странице тайтла и серии. Данные тайтла остаются в `use cache` (ADR-019, ADR-020); блок комментариев читает cookies и рендерится на каждый запрос. «Показать ещё» — Route Handler `GET /api/comments` (как `/api/catalog`).
- **После записи** — `refresh()`, а не `revalidatePath`: он сбросил бы кэш AniList (ADR-018).
- **Ошибки базы** приходят как SQLSTATE; модуль `features/comments/errors.ts` переводит их в сообщения на русском:

| Код | Когда | Сообщение |
|---|---|---|
| `AT429` | флуд-лимит | «Слишком часто. Подождите немного и попробуйте снова» |
| `AT403` | действующий бан | «Вы заблокированы до {дата}» / «Вы заблокированы» |
| `AT422` | неверная ветка, запрещённый переход статуса, жалоба на свой комментарий | «Это действие недоступно» |
| `23505` | повторная жалоба | «Вы уже пожаловались на этот комментарий» |
| `42501` / пусто | RLS отказала | «Недостаточно прав» |

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
| `anime_title`, `anime_cover_url` | `text`, null | снимок тайтла для уведомлений (§6.3); заполняет Server Action из данных AniList на сервере |
| `created_at`, `edited_at` | `timestamptz` | `edited_at` ставит триггер при смене текста |

**Права на колонки.** `insert (anilist_id, episode_id, parent_id, reply_to_user_id, body, is_spoiler, anime_title, anime_cover_url)`, `update (body, is_spoiler, status)`, `select` — всем. `delete` не выдаётся: удаление только мягкое.

**Индексы:**
- корни тайтла: `(anilist_id, created_at desc, id desc) where parent_id is null and episode_id is null`;
- корни серии: `(episode_id, created_at desc, id desc) where parent_id is null`;
- ответы: `(parent_id, created_at, id)`;
- флуд-лимит и FK: `(user_id, created_at desc)`;
- FK: `reply_to_user_id`.

**RLS:**
- `select` для `anon`: `status <> 'hidden'`;
- `select` для `authenticated`: `status <> 'hidden' or (select private.is_moderator())`;
- `insert` для `authenticated`: `user_id = auth.uid()` и `not private.is_banned(auth.uid())`, а также `episode_id is null` или серия существует, видима и относится к тому же тайтлу: `exists (select 1 from episodes e where e.id = episode_id and e.anilist_id = comments.anilist_id)`. Политика `episodes` уже скрывает серии без прав;
- `update` автора: `using (user_id = auth.uid() and status = 'visible')`;
- `update` модератора: `using ((select private.is_moderator()))`.

**Триггеры** (все в `private`):
- **`comments_before_insert`**:
  - **Ветка.** Если `parent_id` задан, родитель должен быть корневым (`parent_id is null`), видимым (`status = 'visible'`), с теми же `anilist_id` и `episode_id`. `reply_to_user_id` — автор родителя или одного из ответов этой ветки. Иначе `AT422`: так нельзя упомянуть произвольного пользователя и получить ему уведомление.
  - **Флуд-лимит.** Берётся `pg_advisory_xact_lock(hashtext(user_id::text))`, считаются комментарии пользователя за 1 мин и за 1 ч: лимит 5 и 30, при превышении `AT429`. Удалённые и скрытые тоже считаются.
  - **Бан** проверяется повторно с кодом `AT403` и датой окончания в `detail`, чтобы сообщение было понятным. Политика RLS — второй рубеж.
- **`comments_before_update`** — правила переходов:
  - автор: `visible → deleted`; при этом `body := null`, `is_spoiler := false`;
  - модератор: `visible ↔ hidden`;
  - `deleted` — конечный статус;
  - текст и спойлер меняет только автор и только у видимого комментария; смена `body` ставит `edited_at = now()`;
  - всё остальное — `AT422`.
  - Изменение одного `reply_count` (из триггера ниже) проходит без проверок.
- **`comments_after_change`**:
  - `reply_count` корня: +1 при вставке видимого ответа, ±1 при смене статуса ответа;
  - журнал модерации: если статус сменил модератор (`hide` / `restore`), пишется строка в `moderation_actions`;
  - скрытие закрывает открытые жалобы на комментарий (`resolved`).
- **`comments_notify`** (отдельный триггер, появляется в 5b-1 вместе с таблицей `notifications`): уведомления об ответе (§6.2); при скрытии удаляет непрочитанные уведомления `reply` об этом комментарии.

**Удалённый корень с ответами** остаётся в выдаче как «Комментарий удалён» (текста в базе уже нет), без ответов — не показывается. Удалённые ответы не показываются.

**Скрытый корень** не виден не-модератору вместе со всей веткой: ответы выбираются по id видимых корней.

### 3.2 `comment_reports`

`id`, `comment_id` → `comments` cascade, `reporter_id` (`default auth.uid()`) → `profiles` cascade, `reason` (`spam` / `offensive` / `spoiler` / `other`), `details text` ≤ 500 (необязательно), `status` (`open` / `resolved` / `dismissed`), `resolved_by` → `profiles` set null, `resolved_at`, `created_at`.

- **Ключи и индексы:** `unique (comment_id, reporter_id)` — одна жалоба на пару, повтор даёт `23505`; индексы `reporter_id`, `resolved_by`, `(created_at) where status = 'open'`.
- **RLS:**
  - `insert`: `reporter_id = auth.uid()`, не забанен;
  - `select`: свои или модератор;
  - `update (status)`: модератор.
- **Триггеры:**
  - перед вставкой: комментарий видим и не свой (`AT422`);
  - перед обновлением: модератор переводит только `open → dismissed`. `resolved` ставит триггер скрытия; `resolved_by` и `resolved_at` заполняются автоматически;
  - после обновления: строка `dismiss_report` в журнал.

### 3.3 `user_bans`

`id`, `user_id` → `profiles` cascade, `moderator_id` (`default auth.uid()`) → `profiles` set null, `reason text` ≤ 500, `expires_at timestamptz` (null — навсегда; check `> created_at`), `created_at`. Индексы `(user_id, expires_at)`, `moderator_id`.

- **RLS:** `select` — свои или модератор; `insert` — модератор с `moderator_id = auth.uid()`. `update` и `delete` не выдаются (снятие бана — этап 6).
- **Триггер перед вставкой:** забанить можно только пользователя с ролью `user` (не себя, не модератора и не админа) — иначе `AT422`.
- **Триггер после вставки:** строка `ban` в журнал с `expires_at` в `details`.
- **`private.is_banned(uid)`:** есть бан с `expires_at is null or expires_at > now()`.
- **Сроки:** Server Action принимает `1d` / `7d` / `30d` / `forever` и сам считает `expires_at`.

### 3.4 `moderation_actions`

`id`, `moderator_id` → `profiles` set null, `action` (`hide` / `restore` / `ban` / `dismiss_report`), `comment_id` → `comments` set null, `target_user_id` → `profiles` set null, `details jsonb`, `created_at`. Индексы по FK и `(created_at desc)`.

Пишут только триггеры (`authenticated` получает лишь `select`, RLS — модератор), поэтому подделать журнал через Data API нельзя.

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

- **Действия модератора.** `src/features/moderation/actions.ts`: `hideComment`, `restoreComment`, `banUser(userId, duration, reason)`, `dismissReports(commentId)`. Каждое — обычный `update` или `insert` от имени модератора. Право проверяет RLS через `private.is_moderator()`, журнал пишет триггер. Server Action дополнительно проверяет роль, чтобы сразу дать понятный ответ, но защищает база.
- **`/moderation`:**
  - Серверный компонент: `getCurrentProfile()`; без роли `moderator` или `admin` — `notFound()`, то есть 404 даже для вошедшего обычного пользователя. В меню пользователя ссылка «Модерация» появляется только для этих ролей.
  - Список — открытые жалобы, сгруппированные по комментарию, от старых к новым, по 20. Для каждого комментария: текст (даже скрытый), автор, место (ссылка на тайтл или серию с якорем), число жалоб по причинам, пояснения. Кнопки: «Скрыть» (закрывает жалобы), «Отклонить жалобы», «Забанить автора».
- Полная админка (снятие бана, роли, журнал) — этап 6.

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
| `title`, `cover_url` | снимок тайтла (как `anime_list`, ADR-020) |
| `created_at`, `read_at` | |

- **Индексы:** `(user_id, created_at desc, id desc)` — список; `(user_id) where read_at is null` — счётчик; уникальный `(user_id, anilist_id) where type = 'new_episode' and read_at is null` — склейка; FK `comment_id`, `actor_id`.
- **RLS:** `select` — свои; `update (read_at)` — свои. `insert` и `delete` у `authenticated` нет: создают только триггеры.

`notification_prefs`: `user_id` pk → `profiles` cascade, `reply boolean default true`, `new_episode boolean default true`, `updated_at`. Нет строки — всё включено. RLS: `select`, `insert`, `update` — только свои строки.

### 6.2 Триггеры уведомлений (ADR-026)

- **Ответ** — `after insert` на `comments`, если `parent_id` задан. Получатели — автор корня и `reply_to_user_id`, без повторов и без самого автора ответа (себе уведомление не создаётся), у кого `notification_prefs.reply` не выключен. Поля: `comment_id` = новый ответ, `actor_id`, `episode_number` из `episodes` по `episode_id`.
- **Новая серия** — `after insert` на `episodes` (серия видима: `license_status <> 'none'`) и `after update of license_status` при переходе `none → видимый`. Получатели — пользователи, у которых тайтл в `anime_list` со статусом `watching` или `planned` и `new_episode` не выключен. Запись: `insert … select … on conflict (user_id, anilist_id) where type = 'new_episode' and read_at is null do update set episode_number = greatest(…), created_at = now()`. Непрочитанное уведомление по тайтлу одно, повторный прогон `seed:test-episodes` не плодит строки. Upsert, при котором права не меняются (`own → own`), уведомлений не создаёт. Снимок `title`/`cover_url` — из строки `anime_list` получателя.

### 6.3 Откуда снимок тайтла у `reply`

Снимок берётся из комментария, который написал сам получатель: корня или его последнего ответа в этой ветке (`comments.anime_title`, `anime_cover_url`). Server Action заполняет эти поля из данных AniList на сервере. Если кто-то подделает их через Data API, увидит подделку только он сам: чужой снимок в чужое уведомление не попадает. Нет снимка — UI пишет «Аниме №{id}» и показывает заглушку обложки.

## 7. Уведомления: UI

- **Колокольчик** в `SiteHeader` рядом с `UserMenu` (в своём `<Suspense>`), только для вошедших.
  - Серверный рендер даёт начальный счётчик.
  - Клиентский компонент перезапрашивает `GET /api/notifications/unread-count` (`no-store`, `{ count }`, 401 без сессии) при смене `pathname` и раз в 60 с, пока `document.visibilityState === 'visible'`.
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
    - A не меняет `user_id`, `anilist_id` и `reply_count` у своего комментария;
    - текст удалённого комментария — `null`;
    - скрытый комментарий не виден гостю, A и самому автору, но виден M;
    - ответ на ответ, ответ в чужую ветку и `reply_to` чужого пользователя отклоняются (`AT422`);
    - серия другого тайтла и серия без прав отклоняются.
  - **Флуд-лимит:** шестой комментарий за минуту — `AT429`.
  - **Баны:**
    - забаненный не пишет комментарий и жалобу (`AT403`);
    - A не банит B;
    - M не банит модератора.
  - **Жалобы:**
    - вторая жалоба на тот же комментарий — `23505`;
    - жалоба на свой комментарий отклоняется;
    - A не видит чужие жалобы, M видит.
  - **Журнал:** скрытие, бан и отклонение жалобы пишут `moderation_actions`; A не пишет журнал напрямую.
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
  - бан: у забаненного форма заменена сообщением;
  - обычному пользователю `/moderation` отдаёт 404;
  - колокольчик показывает 1 после ответа, `/notifications` ведёт к комментарию, «Прочитать все» обнуляет счётчик;
  - после выключения настройки уведомление не приходит.

  Настоящая логика базы проверяется в `rls:check`, мок только повторяет контракт.
- **Правило из `.trail/learnings`** (нестабильный E2E поиска): перед `focus()`, `press()` и `pressSequentially()` ждать `toBeVisible()` поля — блоки комментариев тоже потоковые `Suspense`-границы.

## 9. Документация

- **`ARCHITECTURE.md`:**
  - **ADR-025 «Комментарии и модерация»** (5a-1): одна таблица с `episode_id` null, один уровень ответов, публикация сразу и модерация по жалобам, переходы статусов в триггере, флуд-лимит и баны в базе, журнал только из триггеров. Альтернативы: премодерация, дерево любой глубины, лимит в памяти процесса — не переживает перезапуск и несколько экземпляров.
  - **ADR-026 «Уведомления триггерами»** (5b-1): почему триггеры, а не Server Action (новая серия появляется без участия пользователя — seed, админка); склейка `new_episode`; опрос раз в 60 с вместо Realtime.
  - §2 — новые модули.
- **Obsidian:** заметки ADR, таблиц (`06 - База данных/Таблицы/`) и PR — по правилам CLAUDE.md, через MCP.
- **`DEVELOPMENT.md`:** новые проверки `rls:check` и E2E; как назначить модератора, пока нет админки: SQL `update profiles set role = 'moderator' where username = …` в SQL Editor.

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
