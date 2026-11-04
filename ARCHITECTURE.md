# ARCHITECTURE — Anime Town

## 1. Общая схема

```
Browser ──► Next.js 16 (App Router) — локально `next dev` / `next start`; хостинг выбирается на этапе 8 (ADR-017)
              ├─ Server Components / Route Handlers / Server Actions
              │     ├─► Supabase Postgres (RLS)  — пользователи, прогресс, комментарии, оценки, каталог-кэш
              │     ├─► Supabase Auth            — сессии через @supabase/ssr (cookies)
              │     ├─► Supabase Storage / CDN   — постеры, HLS-плейлисты лицензированного видео
              │     └─► AniList GraphQL          — метаданные тайтлов (кэшируются у нас)
              └─ Client Components
                    ├─ HLS.js плеер + субтитры (WebVTT)
                    └─ Motion, shadcn/ui

Локально ────────► npm run verify     — lint, typecheck, unit, build, E2E на моках (перед слиянием; pre-push — quick)
Supabase Cron ───► Edge Function translate-cron — раз в сутки 03:17 UTC (pg_cron + pg_net) → DeepL → anime_localizations;
                    журнал и блокировка — translation_runs (ADR-024)
```

Принципы:
- **Server-first**: данные загружаются в Server Components, клиент получает минимум JS.
- **Собственный кэш каталога**: AniList — источник метаданных, но страницы читают из нашей таблицы `anime` (синхронизация по расписанию). Так мы не зависим от лимитов AniList (≈90 запросов/мин) и можем добавлять свои поля.
- **Безопасность на уровне БД**: все пользовательские таблицы — RLS; сервисный ключ только на сервере.
- **Feature-модули**: код группируется по доменам, а не по типам файлов.

## 2. Структура папок

### Сейчас (каталог AniList, этап 2)
```
src/
  app/
    page.tsx               главная: тренд-тайтл + «Популярное сейчас», «Высокий рейтинг», «Сезонные новинки»
    catalog/page.tsx       /catalog — поиск, фильтры, сортировка, «Загрузить ещё»
    anime/[id]/            /anime/[id] — страница тайтла, not-found.tsx
    api/catalog/route.ts   GET следующих страниц каталога (JSON)
    api/cron/translate/    GET ручного запуска фонового перевода (CRON_SECRET)
    not-found.tsx, error.tsx
  components/
    ui/                    shadcn/ui: button, input, sheet, skeleton
    layout/                SiteHeader, MainNav, SiteFooter, NotFoundMessage
    anime/                 AnimeCard, PosterImage (fallback), ScoreBadge, AnimeGrid, скелетоны, DataError
    home/                  FeaturedAnime, AnimeRow, CatalogCta, HomeContent, HomeSkeleton
    catalog/               CatalogView, CatalogSearch, CatalogFilters, FilterSelect, ActiveFilters,
                           MobileFilters (шторка), CatalogResults, CatalogSkeleton
    anime-details/         AnimeDetailsView, DetailsHero, DetailsFacts, DetailsRelations, BackToCatalog
    motion/, providers/    FadeIn, MotionProvider
  hooks/                   useDebouncedValue, useLastCatalogHref
  lib/
    anilist/               client.ts (HTTP, повторы, ошибки), queries.ts (GraphQL), types.ts,
                           errors.ts, api.ts (кэшируемые функции данных)
    anime/                 mappers.ts, format.ts, catalog-params.ts, season.ts, ids.ts
    supabase/              клиенты: браузер, сервер, admin (service role — только запись переводов), proxy.ts (обновление сессии)
    shikimori/, localization/  русские названия и описания, машинный перевод, фоновое заполнение
  features/auth/           аккаунты: actions.ts (Server Actions), session.ts (getClaims, профиль), validation.ts,
                           errors.ts (ошибки Auth на русском), components/ (формы, UserMenu)
  features/list/           личный список: model.ts (статусы, проверка ввода), queries.ts, actions.ts,
                           rating.ts (средняя оценка сайта, use cache), components/ (ListPanel, RatingSummaryCard, MyList)
  features/episodes/       серии: queries.ts (getEpisodes, getEpisode — use cache, публичный клиент), components/EpisodesList
  features/player/source.ts  ЕДИНСТВЕННОЕ место выбора источника видео: resolvePlaybackSource (ADR-022)
  features/progress/       прогресс: model.ts (проверка, resumePosition, selectContinueItems), queries.ts,
                           components/ (WatchPlayer — плеер + сохранение, ContinueWatching); app/api/progress — POST
  features/player/         VideoPlayer (hls.js по требованию, качество, субтитры, клавиши, автопереход), shortcuts.ts
  features/comments/        комментарии: model.ts (проверка ввода, курсор keyset, сборка веток), errors.ts (PT-коды → русский),
                           queries.ts (getViewer, getCommentsPage, getReplies), actions.ts (create/edit/delete/report),
                           components/ (CommentsSection — сервер, в своём Suspense; CommentsList, CommentItem, CommentForm, SpoilerText);
                           app/api/comments — GET следующих страниц и ответов
  app/anime/[id]/watch/[number]  страница серии: плеер, атрибуция лицензии, соседние серии, список серий
  features/auth/avatar.ts  проверка аватара (тип по первым байтам, до 1 МБ); actions uploadAvatar / removeAvatar
  app/(auth)/              /login, /register, /forgot-password;  app/(account)/account — профиль и список;
                           app/auth/callback (код из письма), app/auth/update-password
  types/                   anime.ts (доменные типы), database.ts
scripts/
  verify.mjs               `npm run verify [-- --quick]` — проверки перед слиянием и в pre-push
  install-hooks.mjs        `prepare`: git config core.hooksPath .githooks
  translate-backfill.ts    `npm run translate` — ручной фоновый перевод без сервера (журнал translation_runs)
  build-edge-functions.mjs `npm run functions:build|check` — сборка Edge Function в один index.js (esbuild)
.githooks/pre-push        npm run verify -- --quick
supabase/functions/translate-cron/
  main.ts                  исходник Edge Function: x-cron-secret → runTranslationBackfill (src/lib/localization/runs.ts)
  index.js                 собранный бандл (npm run functions:build) — его деплоим
tests/
  unit/                    Vitest: клиент, маппинг, форматирование, параметры, debounce, компоненты
  e2e/                     Playwright: главная, каталог, страница аниме, перевод, скрипт translate, адаптивность
  mock-anilist/, mock-shikimori/, mock-deepl/, mock-supabase/   мок-серверы и фикстуры для E2E
```

### Каталог и AniList

```
Браузер ──► proxy.ts (лимит по IP) ──► Next.js (Server Components) ──► lib/anilist/api.ts ("use cache") ──► client.ts ──► AniList GraphQL
   │              ▲                                                         ▲
   └── «Загрузить ещё» ──► GET /api/catalog ────────────────────────────────┘
```

- **Только сервер ходит в AniList.** Браузер получает готовые страницы и JSON из `/api/catalog`. Это даёт общий кэш и защищает лимит (на 31.10.2026 — `X-RateLimit-Limit: 30` запросов в минуту).
- **Кэш** — `"use cache"` в `lib/anilist/api.ts`: успешный ответ живёт `hours` (жанры — `days`), «не найдено» — `minutes`, сбой — `seconds`. Функции возвращают `{ ok, data | error }`, а не бросают исключения, — код ошибки переживает границу кэша.
- **Данные грузятся при запросе, а не при сборке** (`connection()` + `Suspense` со скелетонами). `next build` не зависит от сети и лимитов AniList; страницы — Partial Prerender: статическая оболочка + потоковые данные.
- **Лимит по IP** (`src/proxy.ts`, `lib/rate-limit/`): 20 запросов в минуту на IP для `/api/catalog` и для `/catalog` с поиском, фильтрами или сортировкой; каталог без параметров — одна общая запись кэша, он не ограничивается, prefetch тоже (матчер `missing: next-router-prefetch`). Превышение — HTTP 429 с `Retry-After`: API отвечает JSON `{ ok: false, error: { code: "RATE_LIMITED", retryAfter, message } }`, страница — самодостаточным HTML на русском с автообновлением. Проверка в proxy, потому что после начала потоковой отрисовки статус ответа уже не поменять. Лимитер — интерфейс `RateLimiter` (форма `@upstash/ratelimit`); сейчас in-memory, общий для нескольких экземпляров подключается в `getCatalogRateLimiter()` без правки вызовов.
- **Клиент** (`client.ts`): POST JSON, тайм-аут 5 с; сетевые сбои и 5xx — 1 повтор через 0,5 с; 429 — ждёт `Retry-After`, если он ≤ 2 с, иначе `RATE_LIMITED`; GraphQL-ошибка 404 → `NOT_FOUND`. Худший случай ожидания — 12 с (5 + 2 + 5, `MAX_WAIT_MS`). Переменные со значением `null` не отправляются: AniList трактует явный `null` как фильтр.
- **Запросы** (`queries.ts`, типизированные строки): `HomeCollections` — три подборки одним запросом через алиасы; `CatalogPage` — поиск, фильтры, сортировка, страница; `Genres`; `AnimeDetails` — тайтл со студиями и связями. Везде `isAdult: false` и исключён жанр `Hentai`.
- **Нормализация** (`mappers.ts`): русское название ищется в синонимах AniList (кириллица без украинских и белорусских букв), затем английское → ромадзи → оригинальное; пустые и некорректные значения → `null`; описание очищается от HTML, HTML-сущностей (именованных и числовых) и хвостов «(Source: …)» / «[Written by MAL Rewrite]».
- **Обложки** с `s4.anilist.co` выводятся с `unoptimized` (`lib/anilist/images.ts`): AniList уже отдаёт готовые `large`/`extraLarge`, оптимизатор изображений Next.js был бы лишними преобразованиями (на любом хостинге — нагрузка или плата).
- **URL — источник состояния каталога**: `q`, `genre`, `year`, `season`, `format`, `status`, `sort` (`popularity`, `trending`, `score`, `newest`, `episodes`, `relevance`). Изменение фильтра → `router.replace` → сервер отдаёт новую первую страницу. Некорректные параметры отбрасываются. Поиск — debounce 400 мс, минимум 2 символа, Enter — сразу.
- **Возврат из тайтла в каталог** сохраняет фильтры: последний адрес каталога хранится в `sessionStorage`.

### Русский контент (Shikimori, машинный перевод)

```
AniList (idMal) ──► lib/localization/service.ts ──► anime_localizations (Supabase; без ключа — память процесса)
                          │ новые и устаревшие                          ▲ lib/localization/backfill.ts → DeepL
                          └──► lib/shikimori (пачки по 50, User-Agent, 4 rps / 80 rpm)        ▲
                       Supabase Cron → Edge Function translate-cron (раз в сутки) ──┤
                                     вручную: GET /api/cron/translate (CRON_SECRET) ────┘
```

- **Сопоставление**: `idMal` из AniList = id тайтла на Shikimori. Тайтлы без `idMal` остаются с данными AniList.
- **Название**: Shikimori `russian` → русский синоним AniList → английское → ромадзи. Прежнее основное название становится альтернативным или попадает в «Другие названия»; туда же — русские синонимы Shikimori.
- **Описание** (`lib/localization/resolve.ts`): Shikimori → машинный перевод (только если `source_hash` = SHA-256 текущего английского описания) → английский оригинал с пометкой «Русского описания пока нет». Под описанием Shikimori — «Описание: Shikimori» со ссылкой на страницу тайтла; у перевода — метка «Машинный перевод (DeepL)» (провайдер хранится в `translator`). BB-коды Shikimori (`[character]`, `[anime]`, `[i]`, `[br]`…) снимаются, `[spoiler]` удаляется целиком.
- **Хранилище** — таблица `anime_localizations`; строка сверяется с Shikimori, если её нет, сменился MAL id или прошло 7 дней. Описание Shikimori вытесняет машинный перевод; если описания на Shikimori нет, перевод сохраняется. Сбой Shikimori или базы не ломает страницу: показываются данные AniList, а результат кэшируется на минуты, а не на часы.
- **Где применяется**: подборки главной (одна пачка на 36 тайтлов), страницы каталога и «Загрузить ещё» — внутри кэшируемых функций `lib/anilist/api.ts`; страница тайтла — `getLocalizedAnimeById` (`use cache`, ADR-019): данные AniList и строка перевода читаются параллельно, результат живёт `stale 5 мин / revalidate 10 мин`. Перевод из Supabase Cron появляется на странице не позже чем через 10 минут; ручной `/api/cron/translate` сбрасывает тег `localization` сразу.
- **Машинный перевод** — интерфейс `Translator` (`lib/localization/translator.ts`: `translate(texts[])` пачкой, `getUsage()`, пределы пачки), реестр провайдеров по `TRANSLATOR_PROVIDER`; сейчас `deepl` (`translators/deepl.ts`), Yandex добавляется ещё одной записью реестра. Ключ только на сервере.
- **Фоновое заполнение** (`lib/localization/backfill.ts`; по расписанию — Supabase Cron раз в сутки вызывает Edge Function `translate-cron` (ADR-024), вручную — `npm run translate` (`scripts/translate-backfill.ts`) или `GET /api/cron/translate`; все вызывают один `runTranslationBackfill`, общие разбор `limit` и код результата — `backfill-run.ts`): трендовые и популярные тайтлы AniList (до 100, один запрос) → сверка с Shikimori → переводятся только тайтлы без его описания и без перевода текущего текста (хеш) → пачки ≤ 50 текстов и ≤ 100 KiB → запись `source='machine'`, `source_hash`, `translator`. На странице тайтла перевод не запускается — без перевода показывается оригинал с пометкой, без ожидания.
- **Бюджет**: перед каждой пачкой — остаток по `GET /v2/usage` (кэш 5 минут, расход запуска учитывается локально); тратится не больше `min(TRANSLATE_MONTHLY_CHAR_LIMIT = 450 000, лимит DeepL) − израсходовано` и не больше `TRANSLATE_RUN_CHAR_LIMIT = 15 000` за запуск. Свой счётчик в базе не нужен: DeepL считает расход всего ключа точнее.
- **Ошибки DeepL**: 403 → `AUTH`, 456 → `QUOTA_EXCEEDED` (остаток обнуляется, запуск останавливается; следующий запуск проверит `/v2/usage`), 429/529/5xx/таймаут → до 3 повторов с паузой 1 → 2 → 4 с (jitter, `Retry-After`), 400/413 → пачка пропускается. Ошибка переводчика не влияет на страницы — они переводчик не вызывают.
- **Поиск на русском**: запрос с кириллицей ищется на Shikimori (до 50 MAL id), затем AniList `Page(media(idMal_in: …))` с теми же фильтрами; «по совпадению» — порядок Shikimori, страницы по 24 нарезаются у нас. Shikimori недоступен — обычный поиск AniList (он находит русские синонимы). Латиница ищется как раньше.

### Комментарии и модерация (этап 5, ADR-025)

```
Server Action (от имени пользователя) ──► PostgREST ──► RLS + права на колонки ──► comments / comment_reports / moderation_actions
                                                         │ private.is_moderator(), private.is_banned() — security definer, только для политик
                                                         ▼
                                     триггеры private.* (security definer): ветка ответов, флуд-лимит, бан, мягкое удаление,
                                     reply_count, moderation_apply (действие модератора = строка журнала)
```

- **Схема** — миграции `20261103102438_comments.sql` и `20261103105041_comments_fixes.sql` (по ревью: `reply_count` при каскадном удалении, PT403 для жалобы забаненного, `comment_id` в `ban`/`unban` — только комментарий цели, `per_root` зажат в 1…20). Клиент может: вставить комментарий, изменить только `body`, «удалить» (DELETE → `status = 'deleted'`, текст стирается), пожаловаться. Остальные колонки и статусы меняют только триггеры.
- **Модератор** не правит таблицы напрямую: он вставляет строку в `moderation_actions` (`hide`, `restore`, `dismiss_reports`, `ban`, `unban`). Триггер `private.moderation_apply` проверяет условие и выполняет действие в той же транзакции, иначе вставка откатывается — журнал = выполненные действия. Интерфейс — `src/features/moderation` (Server Actions `hideComment`, `restoreComment`, `dismissReports`, `banUser`, `unbanUser` — каждое одна вставка; запросы `getOpenReports`, `getActiveBans`), пункты модератора в меню «⋯» комментария и страница `/moderation` (жалобы по комментариям от старых к новым, по 20; «Действующие баны» с «Снять бан»; не модератору — `notFound()`).
- **Страница корней** — запрос сам отсекает удалённые корни без ответов (`status <> 'deleted' or reply_count > 0`), поэтому на странице всегда до 20 корней; скрытые видит только модератор (RLS).
- **Ошибки** — коды PostgREST `PT429` (флуд: 5/мин, 30/ч), `PT403` (бан, в `detail` — дата окончания или `forever`), `PT422` (недопустимое действие); Data API отдаёт эти HTTP-статусы.
- **Выдача ответов** — `comment_reply_previews(root_ids, per_root)` (security invoker, до 20 корней): первые ответы всех корней страницы одним запросом.
- Схема `private` не открыта в Data API; `authenticated` получает `usage` на неё и `execute` только на два помощника RLS.

### Целевая
```
src/
  app/
    (public)/              главная, каталог, тайтл, поиск
      page.tsx
      catalog/page.tsx
      anime/[slug]/page.tsx
      anime/[slug]/watch/[episode]/page.tsx
    (auth)/login, register, callback
    (account)/profile, favorites, history, settings
    admin/                 админ-панель (роль admin)
    api/                   Route Handlers (webhooks, sync)
  features/
    catalog/   components, queries, filters, anilist-sync
    anime/     страница тайтла, сезоны, серии
    player/    HLS-плеер, субтитры, прогресс
    auth/      формы, server actions, guards
    library/   избранное, история, продолжение просмотра
    social/    комментарии, оценки
    notifications/
    admin/
  components/ui/           shadcn/ui
  config/  hooks/
  lib/
    supabase/  env.ts, server.ts, client.ts, proxy.ts (обновление сессии)
    anilist/   client.ts, queries.graphql.ts
    utils.ts
  proxy.ts                 Next.js 16 proxy (бывш. middleware.ts) — вызывает lib/supabase/proxy
  types/database.ts        сгенерировано Supabase
supabase/
  migrations/              SQL-миграции (единственный источник схемы)
  seed.sql
tests/e2e/                 Playwright
```

## 3. Модель данных (черновик, детали — skill anime-database)

| Таблица | Назначение |
|---|---|
| `profiles` | 1:1 с `auth.users`: ник, аватар, роль (`user`/`moderator`/`admin`) |
| `anime_localizations` | **создана** (миграция `20261101090000`): `anilist_id` (PK), `mal_id`, `title_ru`, `synonyms_ru`, `description_ru`, `source` (`shikimori`/`machine`), `source_hash`, `shikimori_url`, `updated_at`. RLS: чтение — `anon`, `authenticated`; запись — только `service_role` |
| `anime` | кэш AniList + свои поля: `anilist_id`, `slug`, названия, описание, постер, баннер, статус, сезон, год, жанры, средняя оценка |
| `genres`, `anime_genres` | жанры и связь M:N |
| `seasons`, `episodes` | сезоны и серии; у серии — номер, длительность, ссылка на HLS-мастер-плейлист, права (`license_status`) |
| `subtitles` | дорожки WebVTT на серию (язык, URL) |
| `favorites` | (user_id, anime_id) |
| `watch_progress` | (user_id, episode_id, position_sec, completed, updated_at) — история и «продолжить просмотр» |
| `ratings` | (user_id, anime_id, score 1–10) |
| `comments` | **создана** (`20261103102438`): к тайтлу (`episode_id` null) и к серии, ответы в один уровень (`parent_id` — корень, `reply_to_user_id` — «@ник»), `status` visible/hidden/deleted, `reply_count`, снимок тайтла для уведомлений. Клиент меняет только `body`; удаление мягкое (ADR-025) |
| `comment_reports` | **создана**: жалобы (`spam`/`offensive`/`spoiler`/`other`), одна на пару «пользователь — комментарий»; статус меняют действия модератора |
| `user_bans` | **создана**: баны 1 д / 7 д / 30 д / навсегда, снятие (`revoked_at`); пишет только триггер действий модератора |
| `moderation_actions` | **создана**: команды модератора и их журнал (вставка = выполненное действие) |
| `notifications` | уведомления пользователю (новая серия в избранном, ответ на комментарий) |

## 4. Ключевые потоки
- **Каталог (сейчас)**: AniList GraphQL напрямую с сервера, с кэшем `use cache` (см. §2 «Каталог и AniList»).
- **Каталог (позже)**: собственная таблица `anime` + фильтры → индексы + полнотекстовый поиск (`tsvector`, `pg_trgm` для опечаток), синхронизация с AniList по расписанию.
- **Просмотр** (этап 4): `/anime/[id]/watch/[n]` → `getEpisode` (use cache) → `resolvePlaybackSource` (без прав — 404) → `VideoPlayer`. hls.js подгружается динамически только здесь; есть MSE — hls.js с выбором качества, нет — нативный HLS (Safari/iOS). Ошибки: media — `recoverMediaError()` не чаще раза в 5 с, сеть — «Повторить» (сразу перезапускать нельзя: цикл). Субтитры — `<track>` WebVTT, переключение через `textTracks`. Клавиши: пробел/K, ←/→ (10 с), F, M, C (и в русской раскладке). В конце — «Следующая серия» с отсчётом 5 с, автопереход отключается (localStorage). При уходе со страницы (`<Activity>` прячет её) очистка уничтожает hls и снимает источник — скрытое видео не играет.
- **Прогресс** (ADR-023): `WatchPlayer` шлёт `POST /api/progress` (`fetch keepalive`) раз в 10 с, на паузе, при скрытии и уходе со страницы — только вошедший пользователь. Сервер проверяет Origin (хост = Host/X-Forwarded-Host), тело, сессию (`getClaims`), находит серию (`getEpisode`, без прав — 404) и пишет `watch_progress` от имени пользователя (RLS). `completed` = позиция ≥ 90 % — вычисляемый столбец. При открытии серии — «Продолжаем с м:сс» и «С начала». «Продолжить просмотр» (главная, профиль): по тайтлу — последняя серия; досмотрена → следующая доступная.
- **Авторизация** (этап 3, ADR-018): Supabase Auth, email + пароль (OAuth — позже). Сессия в cookies (`@supabase/ssr`).
  - `proxy.ts` на каждой странице: сначала лимит каталога (429), затем `updateSession` — `getClaims()` проверяет JWT и при необходимости обновляет токен; cookies и `Cache-Control/Expires/Pragma` уходят в ответ. Гость на `/account` или `/auth/update-password` → `/login?next=…`.
  - Сервер доверяет только `getClaims()` (`features/auth/session.ts`), не `getSession()`. Страницы аккаунта проверяют пользователя ещё раз; данные защищены RLS.
  - Формы — Server Actions (`features/auth/actions.ts`) с проверкой полей на сервере и сообщениями на русском; `next` — только относительный путь (защита от open redirect). После действия без редиректа — `refresh()`, не `revalidatePath` (он сбросил бы кэш AniList всего сайта).
  - Письма (подтверждение почты, сброс пароля) ведут на `/auth/callback`: `exchangeCodeForSession` (PKCE) или `verifyOtp` (`token_hash`).
  - Шапка: `UserMenu` («Войти» или ник) читает cookies внутри `<Suspense>` — остальная страница остаётся статической оболочкой (Partial Prerender).
  - Профиль: `profiles` создаётся триггером `on_auth_user_created` (ник из формы или запасной `user_xxxxxxxx`), уникальность ника без учёта регистра; пользователь меняет только `username`, `display_name`, `avatar_url` (права на уровне колонок), роль — только сервер.
- **Админка**: доступ по `profiles.role = 'admin'`, проверка и в RLS, и в layout.

## 5. Решения (ADR кратко)
- ADR-001 Next.js App Router вместо CRA — SSR/SEO для каталога. (Довод «Vercel-нативность» снят ADR-017: приложение не привязано к хостингу.)
- ADR-002 Supabase вместо MongoDB+Express — Auth, Storage, RLS из коробки, меньше своего бэкенда.
- ADR-003 TypeScript 6.0.x — TS 7 пока несовместим с typescript-eslint (`<6.1.0`).
- ADR-004 Только лицензированный видеоконтент; поле `license_status` обязательно.
- ADR-005 ESLint 9, не 10 — плагины eslint-config-next 16.4 поддерживают только ≤ 9.
- ADR-006 shadcn/ui base-nova на Base UI; CLI `shadcn` — devDependency.
- ADR-007 Умолчания Next.js 16.4: Cache Components, Turbopack, `proxy.ts`.
- ADR-008 Защита `main` организационная (GitHub Free).
- ADR-009 Каталог этапа 2 читает AniList с сервера (кэш `use cache`, данные при запросе, не при сборке); собственная таблица `anime` и синхронизация — после подключения Supabase. Причины: лимит AniList 30 запросов/мин, сборка без сетевой зависимости, нет Supabase-проекта.
- ADR-010 E2E на production-сборке с мок-сервером AniList (`ANILIST_GRAPHQL_URL`) — тесты не зависят от сети и лимитов.
- ADR-011 Лимит запросов каталога по IP — в `proxy.ts`, за интерфейсом `RateLimiter`. Причины: AniList даёт ~30 запросов/мин на весь сервер; только proxy может ответить настоящим 429 до потоковой отрисовки страницы; интерфейс в форме `@upstash/ratelimit` позволяет заменить in-memory счётчик общим хранилищем (Upstash/Supabase), когда экземпляров станет несколько. IP берётся из `x-forwarded-for`; какой прокси его выставляет и можно ли ему доверять — проверяется при выборе хостинга (этап 8, ADR-017).
- ADR-012 Shikimori — источник русских названий и описаний. Причины: в AniList нет русских полей; у Shikimori публичный GraphQL без ключа, сопоставление по MAL id однозначное, описания редакторские. Ограничения: 5 rps / 90 rpm, обязательный узнаваемый User-Agent, глубина запроса ≤ 5. Запросы только с сервера, пачками по 50, через собственный ограничитель (4 rps / 80 rpm), с атрибуцией «Описание: Shikimori» и ссылкой.
- ADR-013 Переводы хранятся в своей таблице `anime_localizations` (Supabase), а не только в кэше Next.js. Причины: перевод платный и делается один раз на тайтл; кэш `use cache` живёт в памяти процесса и не общий между экземплярами; `source_hash` позволяет обновить перевод, когда AniList меняет английский текст. Чтение открыто всем (публичный каталог), запись — только сервер (service role); Data API открыт вручную и только на чтение. Без ключа service role приложение работает с хранилищем в памяти процесса.
- ADR-014 Машинный перевод — за интерфейсом `Translator`; провайдера выбирает владелец проекта (цена, доступность и оплата из Беларуси, качество EN→RU). Выбран DeepL API Free (2026-11-01); Yandex — запасной вариант, добавляется записью в реестре провайдеров.
- ADR-015 Фоновое заполнение переводов — по расписанию раз в сутки, а не «на лету» при открытии страницы и не Supabase `pg_cron` + Edge Function. Причины: переиспользуется весь серверный код на TypeScript (клиенты AniList, Shikimori, DeepL, хранилище) — Edge Function на Deno потребовала бы дубля; суточного запуска хватает (≈ 15 000 символов в день при месячном пределе 450 000). Работа идемпотентна (хеш описания), поэтому пропущенный или двойной запуск безопасен. Страница не ждёт внешний API и не тратит квоту на случайные тайтлы. **Механизм запуска пересмотрен ADR-017** (2026-11-01): было — Vercel Cron (`vercel.json`) → `/api/cron/translate`; стало — GitHub Actions `translate-cron.yml` → `npm run translate` (`scripts/translate-backfill.ts`, тот же `runTranslationBackfill`, запись прямо в Supabase). `GET /api/cron/translate` под `CRON_SECRET` (`Authorization: Bearer`) оставлен для ручного запуска. **Пересмотрено ADR-024** (2026-11-02): расписание — Supabase Cron + Edge Function; GitHub Actions удалён из проекта 2026-11-04.
- ADR-016 Бюджет символов — по `GET /v2/usage` DeepL, без своего счётчика в базе: DeepL считает весь расход ключа, а свой предел `TRANSLATE_MONTHLY_CHAR_LIMIT` (450 000) оставляет запас до лимита провайдера. Провайдер машинного перевода сохраняется в `anime_localizations.translator` (миграция `20261101120000`), чтобы пометка «(DeepL)» оставалась честной после смены провайдера.
- ADR-025 Комментарии и модерация (2026-11-03). **Решение:** одна таблица `comments` (`episode_id` null — обсуждение тайтла), ответы в один уровень; комментарий публикуется сразу, модерация — по жалобам. Запись — Server Action от имени пользователя, права — в базе: клиенту выданы только `insert`, `update (body)` и `delete` (мягкий — триггер превращает в `status = 'deleted'`); `status`, `reply_count`, `parent_id`, снимок тайтла клиент изменить не может. Модератор действует вставкой в `moderation_actions`: триггер `private.moderation_apply` (security definer) проверяет и выполняет действие, поэтому журнал нельзя подделать и в нём нет строк без эффекта. Флуд-лимит (5/мин, 30/ч, advisory lock на пользователя) и баны — в триггерах и RLS. Помощники RLS `private.is_moderator()`/`is_banned()` — security definer без аргументов, в политиках только `(select …())`, `execute` — только `authenticated`, схема `private` не открыта. **Коды ошибок:** `PT429`/`PT403`/`PT422` — PostgREST отдаёт по ним настоящие HTTP-статусы 429/403/422, и клиент Data API видит правильную причину без разбора текста; свои коды вида `AT…` отклонены: на них PostgREST ответил бы общим 400. **Альтернативы:** премодерация — тормозит обсуждение, модераторов пока нет; дерево ответов любой глубины — сложнее выдача и UI без пользы для обсуждения серий; лимит в памяти процесса — не переживает перезапуск и несколько экземпляров; `update` статуса модератором через RLS — журнал пришлось бы писать отдельно, и его можно было бы обойти. **Проверка:** `npm run rls:check` — 132/132.
- ADR-024 Фоновый перевод в Supabase: Edge Function + Supabase Cron (2026-11-02). **Контекст:** GitHub Actions для аккаунта недоступен окончательно (ограничение биллинга), хостинга до этапа 8 нет. **Решение:** Edge Function `translate-cron` выполняет тот же `runTranslationBackfill` (исходник `supabase/functions/translate-cron/main.ts` импортирует `src/lib/localization`, `npm run functions:build` собирает один `index.js`); pg_cron + pg_net вызывают её раз в сутки в 03:17 UTC с `x-cron-secret` из Vault; `verify_jwt = false`, секрет проверяет код (иначе 401). Секреты — в Supabase (`CRON_SECRET`, `TRANSLATOR_PROVIDER`, `DEEPL_API_KEY`), ключ базы — подставленный `SUPABASE_SECRET_KEYS.default`. Журнал и блокировка — `translation_runs` (`begin_translation_run`, один `running`, старше 5 мин — `abandoned`), её берут функция, `npm run translate` и `/api/cron/translate`. Лимиты прежние: 15 000 символов за запуск, ≤ 100 тайтлов, 450 000 в месяц. `translate-cron.yml` удалён 2026-11-04 вместе с `.github/` (GitHub — только git и PR). **Альтернативы:** pg_cron → Next.js — приложение не размещено; копия логики на Deno — два места правил; import map на `src/` — сборка вне `supabase/functions` не гарантирована. **Последствия:** перевод не зависит от GitHub; `index.js` пересобирается после правок `src/lib/localization` (`functions:check` в `verify`); кэш страниц обновляется через ≤ 10 мин.
- ADR-023 Прогресс просмотра — Route Handler + keepalive, `completed` в базе (2026-11-01). **Решение:** `POST /api/progress`, а не Server Action — запрос должен дойти и при закрытии вкладки (`fetch keepalive`); защита — проверка Origin (как у Server Actions), проверка тела, сессия, RLS «свои строки». `completed` — `generated always as (position ≥ 90 % duration)`: правило одно, клиент его не подделает. Название и обложка — снимок с сервера (блок «Продолжить просмотр» без AniList). Порог «не с начала» — 5 с, но не больше 10 % серии (короткие ролики). **Альтернативы:** Server Action — может оборваться при закрытии вкладки; `sendBeacon` — без JSON-заголовков и ответа; хранить прогресс в localStorage — не переносится между устройствами. **Проверка:** `npm run rls:check` — 47/47 (в т. ч. 7 по прогрессу).
- ADR-022 Источник видео за абстракцией; до этапа 8 — тестовые открытые потоки (2026-11-01). **Контекст:** своего лицензированного видео нет, Storage на Free-плане (1 ГБ) для видео не подходит. **Решение:** серия → адрес для плеера только через `resolvePlaybackSource()` (`src/features/player/source.ts`); в базе — `episodes` (`license_status`: `licensed`/`own`/`open_license`/`none`, `hls_url` только `https://` или `/media/`, у открытой лицензии обязательна атрибуция) и `subtitles` (WebVTT); RLS показывает только серии с правами. Для разработки: собственный ролик `public/media/test/` (6 с, 360p/180p, fMP4, субтитры ru/en; сгенерирован `npm run build:test-hls` — canvas в Chromium → MediaRecorder H.264 → нарезка на init/сегмент, без ffmpeg и сторонних прав) и открытые фильмы Blender (Big Buck Bunny, Tears of Steel — CC BY 3.0, проверено на peach/mango.blender.org) через тестовые HLS-потоки Mux; заглушки добавляет `npm run seed:test-episodes` (удаление — `-- --remove`), в названиях серий — «Тестовое видео». **Альтернативы:** загрузка в Supabase Storage — лимиты Free-плана; встраивание сторонних плееров — против ADR-004. **Последствия:** на этапе 8 меняются `resolvePlaybackSource` и данные `episodes`, остальной код — нет; в бэклоге этапа 8 — выбор легального источника или режим «каталог + трейлеры AniList + ссылки на легальные площадки».
- ADR-021 Аватары в Supabase Storage и средняя оценка через счётчик (2026-11-01). **Аватар:** публичный бакет `avatars` (до 1 МБ, JPEG/PNG/WebP), запись/перезапись/удаление — только в своей папке `<user id>/` (политики `storage.objects`), загрузка через Server Action с проверкой типа по первым байтам файла; адрес с `?v=<время>` — без устаревшего кэша. **Средняя оценка:** оценки в `anime_list` скрыты RLS, поэтому сумма и число ведутся триггером (`security definer`, execute отозван) в публичной `anime_rating_stats`; страница читает их клиентом без сессии внутри `use cache` (5 минут), своя оценка видна сразу (`updateTag` + `refresh`). **Альтернативы:** функция-агрегат security definer через RPC — открытая точка, которую отмечает советник; `count/avg` по `anime_list` на каждый показ — запрос по всем строкам. **Проверка доступа:** `npm run rls:check` — 33 проверки на настоящем проекте с временными пользователями и очисткой.
- ADR-020 Личный список — одна таблица `anime_list` (статус + оценка 1–10) (2026-11-01). **Решение:** строка на пару «пользователь — тайтл AniList», статус `planned/watching/completed/on_hold/dropped` и оценка — необязательны, но хотя бы одно задано (иначе строка удаляется). Название и обложка — снимок с сервера из кэша AniList (профиль открывается без запросов к AniList, клиент не может подставить своё название). RLS — все операции только со своими строками, гостю прав нет. На странице тайтла блок читает сессию в своём `<Suspense>` — данные тайтла остаются в `use cache` и prefetch. **Альтернативы:** отдельные таблицы `favorites` и `ratings` — два запроса и две проверки на одно действие; хранить только `anilist_id` и подтягивать карточки из AniList — запрос к AniList на каждый показ профиля при лимите 30/мин. **Последствия:** название в профиле может отстать от AniList до следующего сохранения; средняя оценка пользователей сайта — позже (агрегат через функцию security definer).
- ADR-019 Скорость переходов без хостинга (2026-11-01). **Замер:** сервер с тёплым кэшем отвечает за 15–35 мс; всё время уходит на «холодные» данные: AniList 370–840 мс, Shikimori 235–880 мс, Supabase 200–950 мс (из Беларуси во Франкфурт). **Решение:** (1) страница тайтла с переводом — `use cache` (повторный показ и prefetch — без внешних запросов; чтение перевода параллельно с AniList); (2) `IntentLink` — `prefetch={true}` только по наведению/фокусу/касанию (документация Next.js 16 для сеток карточек: полный prefetch всех видимых карточек = запрос к AniList на карточку при лимите 30/мин); (3) шапка тайтла сразу из данных карточки (`card-preview.ts` + `DetailsLoading`), пока грузятся детали; (4) `FadeIn` на CSS вместо Motion — герой виден до загрузки JS, −40 КБ gzip на главной и странице тайтла; (5) «Загрузить ещё» запрашивает следующую страницу заранее (кнопка в ~800 px от экрана). **Отложено до этапа 8:** общий кэш ответов AniList в Supabase или `use cache: remote` — локально и на одном сервере `use cache` в памяти уже отдаёт повторы за ~20 мс, а чтение из Supabase отсюда (200–300 мс) лишь немного быстрее AniList; польза появится, когда экземпляров станет несколько или они будут перезапускаться (serverless) — это зависит от выбранного хостинга. Своя дедупликация одновременных промахов кэша не делается: документация `use cache` предупреждает о зависании сборки при общих Map с промисами.
- ADR-018 Аккаунты на Supabase Auth с SSR-сессией в cookies (2026-11-01). **Решение:** `@supabase/ssr` + `proxy.ts` (`getClaims` на каждом запросе), Server Actions без клиентского Supabase, профиль `profiles` через триггер на `auth.users` с RLS и правами на уровне колонок (роль не меняется через Data API), роль — `text` с check (`user`/`moderator`/`admin`), а не enum — проще расширять. Код аккаунтов — в `src/features/auth/` (первый модуль по целевой структуре). **Альтернативы:** NextAuth/Auth.js — второй источник пользователей рядом с Supabase и без RLS по `auth.uid()`; проверка сессии только в layout — не защищает Route Handlers и не обновляет токен. **Последствия:** proxy выполняется на всех страницах (при асимметричных ключах JWT проверка локальная); E2E — на моке Supabase (`tests/mock-supabase`), настоящий проект в тестах не используется; Supabase Auth до этапа 8 настроен на `http://localhost:3000`.
- ADR-017 Отказ от Vercel: локальная разработка, GitHub Actions, хостинг на финале (2026-11-01). **Контекст:** зарегистрироваться в Vercel из Беларуси нельзя; от Vercel зависели только расписание перевода (Vercel Cron) и планы превью-деплоев. **Решение:** до этапа 8 «Публикация» хостинга нет — всё проверяется локально (`next dev`, `next build && next start`) и в GitHub Actions: `ci.yml` (lint, typecheck, unit, build; E2E на моках отдельной job) и `translate-cron.yml` (раз в сутки в 03:17 UTC и `workflow_dispatch`, `concurrency`, `timeout-minutes: 15`; секреты — GitHub Secrets `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRANSLATOR_PROVIDER`, `TRANSLATOR_API_KEY`). Скрипт `npm run translate` (`tsx`) вызывает тот же `runTranslationBackfill` — логика не дублируется. `vercel.json` удалён; базовый URL — `NEXT_PUBLIC_SITE_URL` (локально `http://localhost:3000`). Хостинг выбирается на этапе 8: Netlify (если пустит регистрация) или Docker (Timeweb Cloud / VPS); `Dockerfile`/`netlify.toml` до тех пор не создаются. **Альтернативы:** Netlify сейчас — отложено, превью-деплои не нужны до появления пользователей; Supabase `pg_cron` + Edge Function — дубль кода на Deno (см. ADR-015); cron на своём ПК — зависит от включённого компьютера. **Последствия:** нет превью-ссылок на PR — проверка PR = CI + локальная production-сборка; расписание GitHub может сдвигаться на десятки минут; репозиторий приватный — минуты Actions из лимита GitHub Free (≈ 2 мин на прогон перевода); Supabase Auth на этапе 3 настраивается на `http://localhost:3000`, продакшен-домен — на этапе 8. **Пересмотрено** (2026-11-04): Actions недоступен и удалён из проекта, `.github/` нет; проверки — `npm run verify` + pre-push, расписание — Supabase Cron (ADR-024), GitHub Secrets не используются.

Расширенная версия и история решений — в Obsidian: `Anime Town/02 - Архитектура/`.
