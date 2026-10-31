---
name: anime-ui-design
description: Use when building or restyling any Anime Town UI — design tokens, theme, layout, anime cards, hero banners, catalog grids, title pages, player chrome, account screens, animations with Motion, or turning a Figma frame into components.
---

# Anime UI Design

Дизайн-система Anime Town поверх Tailwind CSS 4 + shadcn/ui + Motion. Эстетические решения — по skill `frontend-design`; макеты из Figma — через `figma:figma-design-to-code` (обязателен перед `get_design_context`).

## Направление
- Тёмная тема по умолчанию (просмотр видео), светлая — опционально.
- Контент — главный: постеры и баннеры крупные, хром интерфейса спокойный.
- Один акцентный цвет + нейтральная шкала; без «радуги» жанров.
- Фирменный стиль должен ощущаться своим, не шаблонным: сначала зафиксируй направление (типографика, акцент, форма карточек) в `Anime Town/03 - Дизайн-система/`, потом верстай.

## Токены
- Задаются CSS-переменными в `src/app/globals.css` через `@theme` (Tailwind 4): `--color-background`, `--color-foreground`, `--color-primary`, `--color-muted`, `--color-card`, `--radius`, шрифты.
- Компоненты используют только токены (`bg-card`, `text-muted-foreground`), не сырые hex.
- Кириллица обязательна: шрифты с поддержкой Cyrillic, подключение через `next/font`.

## Компоненты (минимальный набор)
`AnimeCard` (постер 2:3, название, год/формат, рейтинг, бейдж «новая серия»), `AnimeGrid`, `HeroCarousel`, `GenreChip`, `FilterPanel`, `EpisodeList`, `ContinueWatchingRow`, `RatingStars`, `CommentItem`, `UserMenu`, `EmptyState`, `Skeleton`-варианты для каждого.
Базу брать из shadcn/ui (`npx shadcn@latest add ...`) и стилизовать, а не писать с нуля.

## Адаптивность и доступность
- Mobile-first; сетка карточек 2 → 3 → 4 → 6 колонок.
- Контраст AA, видимый focus, управление с клавиатуры, `alt` у постеров, `prefers-reduced-motion` отключает декоративную анимацию.

## Motion
- Импорт из `motion/react`. Анимации короткие (150–300 мс), только `transform`/`opacity`.
- Анимированные компоненты — клиентские; оборачивай минимально, не делай всю страницу клиентской.

## Изображения
Только `next/image` с размерами/`sizes`; детали — skill `anime-performance`.

## После работы
Обнови `Anime Town/03 - Дизайн-система/` (токены, новые компоненты) и запись в `[[Development Log]]`.
