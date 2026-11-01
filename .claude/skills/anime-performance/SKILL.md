---
name: anime-performance
description: Use when optimizing Anime Town speed — Core Web Vitals (LCP, INP, CLS), image delivery for posters and banners, caching and revalidation, bundle size, database query speed, or player startup time.
---

# Anime Performance

## Цели
LCP < 2.5 с, INP < 200 мс, CLS < 0.1 на мобильном 4G для главной, каталога и страницы тайтла.

## Изображения
- Только `next/image`. Постеры 2:3 с явными `width/height` или `fill` + `sizes` (например `(max-width:640px) 50vw, (max-width:1024px) 25vw, 16vw`).
- Внешние домены (AniList CDN `s4.anilist.co`, Supabase Storage) — в `images.remotePatterns`.
- `priority`/`fetchPriority="high"` только для LCP-изображения (hero-баннер). Остальные — lazy.
- Плейсхолдер: `coverImage.color` из AniList как фон карточки — без CLS и без лишних запросов.

## Рендеринг и кэш
- Каталог, тайтлы, жанры — кэшируются, ревалидация по тегам (`anime:<id>`, `catalog`) после синхронизации.
- Персональные блоки — отдельные динамические компоненты в `<Suspense>`, чтобы не делать всю страницу динамической.
- Стриминг: тяжёлые секции (похожие, комментарии) — в `Suspense` со скелетонами.

## JavaScript
- Минимум `"use client"`. HLS.js, Motion-тяжёлые блоки, редакторы — `next/dynamic` / ленивый импорт.
- Проверка бандла: `next build` (вывод размеров маршрутов), при росте — разобрать причину.
- Шрифты — `next/font`, subset `cyrillic` + `latin`, `display: swap`.

## База данных
- `EXPLAIN ANALYZE` для запросов каталога и «продолжить просмотр»; индексы — по skill `anime-database`.
- Не делать N+1: жанры и прогресс — одним запросом с join/`in`.
- Advisors Supabase (performance) после изменений схемы.

## Плеер
- `preload="metadata"`, постер серии, HLS.js грузится только на странице просмотра. Стартовое качество — авто (ABR).

## Измерение
Lighthouse (mobile) на локальной production-сборке (`npm run build && npm run start`) до/после; цифры фиксировать в `Anime Town/10 - Тестирование/Производительность.md`.
