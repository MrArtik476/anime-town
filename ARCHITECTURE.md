# ARCHITECTURE — Anime Town

## 1. Общая схема

```
Browser ──► Vercel (Next.js 16, App Router)
              ├─ Server Components / Route Handlers / Server Actions
              │     ├─► Supabase Postgres (RLS)  — пользователи, прогресс, комментарии, оценки, каталог-кэш
              │     ├─► Supabase Auth            — сессии через @supabase/ssr (cookies)
              │     ├─► Supabase Storage / CDN   — постеры, HLS-плейлисты лицензированного видео
              │     └─► AniList GraphQL          — метаданные тайтлов (кэшируются у нас)
              └─ Client Components
                    ├─ HLS.js плеер + субтитры (WebVTT)
                    └─ Motion, shadcn/ui
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
    supabase/              клиенты (пока не используются)
  types/                   anime.ts (доменные типы), database.ts
tests/
  unit/                    Vitest: клиент, маппинг, форматирование, параметры, debounce, компоненты
  e2e/                     Playwright: главная, каталог, страница аниме, адаптивность (5 разрешений)
  mock-anilist/            мок-сервер GraphQL и фикстуры для E2E
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
- **Обложки** с `s4.anilist.co` выводятся с `unoptimized` (`lib/anilist/images.ts`): AniList уже отдаёт готовые `large`/`extraLarge`, оптимизатор Vercel был бы лишними платными преобразованиями.
- **URL — источник состояния каталога**: `q`, `genre`, `year`, `season`, `format`, `status`, `sort` (`popularity`, `trending`, `score`, `newest`, `episodes`, `relevance`). Изменение фильтра → `router.replace` → сервер отдаёт новую первую страницу. Некорректные параметры отбрасываются. Поиск — debounce 400 мс, минимум 2 символа, Enter — сразу.
- **Возврат из тайтла в каталог** сохраняет фильтры: последний адрес каталога хранится в `sessionStorage`.

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
| `anime` | кэш AniList + свои поля: `anilist_id`, `slug`, названия, описание, постер, баннер, статус, сезон, год, жанры, средняя оценка |
| `genres`, `anime_genres` | жанры и связь M:N |
| `seasons`, `episodes` | сезоны и серии; у серии — номер, длительность, ссылка на HLS-мастер-плейлист, права (`license_status`) |
| `subtitles` | дорожки WebVTT на серию (язык, URL) |
| `favorites` | (user_id, anime_id) |
| `watch_progress` | (user_id, episode_id, position_sec, completed, updated_at) — история и «продолжить просмотр» |
| `ratings` | (user_id, anime_id, score 1–10) |
| `comments` | комментарии к тайтлу/серии, `parent_id` для ответов, мягкое удаление |
| `notifications` | уведомления пользователю (новая серия в избранном, ответ на комментарий) |

## 4. Ключевые потоки
- **Каталог (сейчас)**: AniList GraphQL напрямую с сервера, с кэшем `use cache` (см. §2 «Каталог и AniList»).
- **Каталог (позже)**: собственная таблица `anime` + фильтры → индексы + полнотекстовый поиск (`tsvector`, `pg_trgm` для опечаток), синхронизация с AniList по расписанию.
- **Просмотр**: страница серии получает плейлист → HLS.js → каждые ~10 с upsert в `watch_progress`.
- **Авторизация**: Supabase Auth (email + OAuth), сессия в cookies, `proxy.ts` (Next.js 16, бывш. `middleware.ts`) обновляет токен, проверка — `supabase.auth.getUser()`/`getClaims()` на сервере.
- **Админка**: доступ по `profiles.role = 'admin'`, проверка и в RLS, и в layout.

## 5. Решения (ADR кратко)
- ADR-001 Next.js App Router вместо CRA — SSR/SEO для каталога, Vercel-нативность.
- ADR-002 Supabase вместо MongoDB+Express — Auth, Storage, RLS из коробки, меньше своего бэкенда.
- ADR-003 TypeScript 6.0.x — TS 7 пока несовместим с typescript-eslint (`<6.1.0`).
- ADR-004 Только лицензированный видеоконтент; поле `license_status` обязательно.
- ADR-005 ESLint 9, не 10 — плагины eslint-config-next 16.4 поддерживают только ≤ 9.
- ADR-006 shadcn/ui base-nova на Base UI; CLI `shadcn` — devDependency.
- ADR-007 Умолчания Next.js 16.4: Cache Components, Turbopack, `proxy.ts`.
- ADR-008 Защита `main` организационная (GitHub Free).
- ADR-009 Каталог этапа 2 читает AniList с сервера (кэш `use cache`, данные при запросе, не при сборке); собственная таблица `anime` и синхронизация — после подключения Supabase. Причины: лимит AniList 30 запросов/мин, сборка без сетевой зависимости, нет Supabase-проекта.
- ADR-010 E2E на production-сборке с мок-сервером AniList (`ANILIST_GRAPHQL_URL`) — тесты не зависят от сети и лимитов.
- ADR-011 Лимит запросов каталога по IP — в `proxy.ts`, за интерфейсом `RateLimiter`. Причины: AniList даёт ~30 запросов/мин на весь сервер; только proxy может ответить настоящим 429 до потоковой отрисовки страницы; интерфейс в форме `@upstash/ratelimit` позволяет заменить in-memory счётчик общим хранилищем (Upstash/Supabase), когда экземпляров станет несколько. IP берётся из `x-forwarded-for` (на Vercel его выставляет платформа).

Расширенная версия и история решений — в Obsidian: `Anime Town/02 - Архитектура/`.
