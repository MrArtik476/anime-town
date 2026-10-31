---
name: anime-platform-architect
description: Use when designing or changing the overall architecture of the Anime Town platform — adding a new module or route group, choosing where code lives, deciding server vs client, data flow between Next.js, Supabase and AniList, or recording an architecture decision (ADR).
---

# Anime Platform Architect

Хранитель архитектуры Anime Town. Источник истины — `ARCHITECTURE.md` в репозитории и `Anime Town/02 - Архитектура/` в Obsidian.

## Перед началом
1. Прочитай `ARCHITECTURE.md` и (если доступен MCP `obsidian`) `search_notes` по теме в `Anime Town/02 - Архитектура/`.
2. Для новой фичи сначала `superpowers:brainstorming`, для многошаговой — `superpowers:writing-plans`.
3. Сверь API Next.js / Supabase с Context7 (`/vercel/next.js`, supabase), не полагайся на память.

## Правила размещения кода
- Маршруты — `src/app/` с route groups: `(public)`, `(auth)`, `(account)`, `admin`.
- Доменная логика — `src/features/<domain>/` (`components/`, `queries.ts`, `actions.ts`, `schema.ts`, `types.ts`). Страница в `app/` только собирает компоненты фичи.
- Общие UI-примитивы — `src/components/ui` (shadcn/ui). Не класть туда доменные компоненты.
- Инфраструктура — `src/lib/` (supabase, anilist, utils). Фичи не импортируют друг друга по кругу; общий код поднимается в `lib/` или `components/`.

## Server vs Client
- По умолчанию Server Component. `"use client"` — только для интерактива (плеер, формы, фильтры с мгновенным откликом, Motion).
- Чтение данных — в Server Components через серверный Supabase-клиент. Запись — Server Actions или Route Handlers.
- Никогда не передавай секреты и service role в клиентский бандл.

## Данные
- AniList — источник метаданных, но UI читает из таблицы `anime` (наш кэш). Синхронизация — фоновая (cron / Route Handler), не на каждый запрос.
- Схема меняется только миграциями в `supabase/migrations/` (skill `anime-database`).
- Пользовательские данные защищаются RLS, а не только проверками в коде.

## Кэширование и рендеринг
- Каталог и страницы тайтлов — статически/ISR с ревалидацией по тегам; персональные блоки («продолжить просмотр») — динамически и отдельно, чтобы не ломать кэш страницы.

## Фиксация решений
Каждое значимое решение — короткий ADR:
```
## ADR-00N <название>
Контекст · Решение · Альтернативы · Последствия · Дата
```
Добавь в раздел «Решения» `ARCHITECTURE.md` и создай заметку `Anime Town/02 - Архитектура/ADR-00N <название>.md` со ссылками `[[Архитектура]]`, `[[Development Log]]`.

## Ограничения
- Видео — только лицензированный контент; архитектура не должна включать скрейпинг/проксирование чужих видеоисточников.
- Не добавлять новый сервис/библиотеку без указания, какую проблему он решает и почему нельзя существующими средствами.
