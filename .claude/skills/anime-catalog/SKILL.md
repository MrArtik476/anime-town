---
name: anime-catalog
description: Use when working on the Anime Town catalog — listing, search, filters (genre, year, season, status, format, score), sorting, pagination, genre pages, title metadata, or syncing data from the AniList GraphQL API.
---

# Anime Catalog

## Источник данных
- AniList GraphQL: `https://graphql.anilist.co` (POST, без ключа для публичных данных). Лимит ≈90 запросов/мин, при 429 — заголовок `Retry-After`. Соблюдай условия использования AniList и указывай источник.
- UI никогда не ходит в AniList напрямую на каждый запрос. Данные синхронизируются в таблицу `anime` (+ `genres`, `anime_genres`).

## Синхронизация
- `src/features/catalog/anilist-sync.ts`: постраничная выборка `Page(page, perPage: 50) { media(type: ANIME, sort: ...) }`, upsert по `anilist_id`.
- Поля: `id`, `idMal`, `title { romaji english native }`, `synonyms`, `description(asHtml:false)`, `coverImage { extraLarge large color }`, `bannerImage`, `format`, `status`, `season`, `seasonYear`, `episodes`, `duration`, `genres`, `averageScore`, `popularity`, `nextAiringEpisode`, `startDate`.
- Запуск по расписанию — Supabase Cron → Edge Function (как `translate-cron`, ADR-024); вручную — скрипт `scripts/*.ts` (`tsx`), как `npm run translate`, или Route Handler под секретом. Пауза между страницами, обработка 429 с повтором.
- Русские названия/описания — свои поля в `anime` (`title_ru`, `description_ru`), заполняются вручную/из админки, синхронизация их не затирает.
- Slug: транслит/romaji + `anilist_id` для уникальности.

## Поиск и фильтры
- Фильтры в URL search params (`?genre=action&year=2024&season=FALL&status=RELEASING&sort=score`) — страница шарится и кэшируется.
- Серверный запрос через Supabase с индексами: btree по `season_year`, `status`, `format`, `average_score`; GIN по `search_vector`; `pg_trgm` для поиска с опечатками по названиям.
- `search_vector` — generated column из `title_ru`, `title_romaji`, `title_english`, `synonyms`.
- Пагинация — keyset (по `popularity, id`) для бесконечной ленты, offset — допустим для страниц с номерами.
- Debounce ввода поиска 300 мс, состояние — в URL.

## Страницы
- `/catalog` — сетка + `FilterPanel`; `/genre/[slug]`; `/anime/[slug]` — описание, жанры, сезоны/серии, похожие.
- Генерация метаданных (`generateMetadata`) для SEO: название, описание, OG-изображение-постер.

## Проверка
- Unit: маппинг ответа AniList → строка `anime`.
- E2E: фильтр по жанру меняет URL и результаты; поиск с опечаткой находит тайтл.
- Перед изменениями API — Context7 / документация AniList.
