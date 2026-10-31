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
  lib/
    supabase/  server.ts, client.ts, middleware.ts
    anilist/   client.ts, queries.graphql.ts
    utils.ts
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
- **Каталог**: `anime` + фильтры (жанр, год, сезон, статус, формат, рейтинг) → индексы + полнотекстовый поиск (`tsvector`, `pg_trgm` для опечаток).
- **Просмотр**: страница серии получает плейлист → HLS.js → каждые ~10 с upsert в `watch_progress`.
- **Авторизация**: Supabase Auth (email + OAuth), сессия в cookies, `middleware.ts` обновляет токен, проверка — `supabase.auth.getUser()`/`getClaims()` на сервере.
- **Админка**: доступ по `profiles.role = 'admin'`, проверка и в RLS, и в layout.

## 5. Решения (ADR кратко)
- ADR-001 Next.js App Router вместо CRA — SSR/SEO для каталога, Vercel-нативность.
- ADR-002 Supabase вместо MongoDB+Express — Auth, Storage, RLS из коробки, меньше своего бэкенда.
- ADR-003 TypeScript 6.0.x — TS 7 пока несовместим с typescript-eslint (`<6.1.0`).
- ADR-004 Только лицензированный видеоконтент; поле `license_status` обязательно.

Расширенная версия и история решений — в Obsidian: `Anime Town/02 - Архитектура/`.
