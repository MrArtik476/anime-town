# Anime Town

Русскоязычная аниме-платформа: каталог тайтлов с поиском и фильтрами, страницы тайтлов, подборки популярного, лучшего и сезонного. Данные о тайтлах — [AniList](https://anilist.co) GraphQL API.

Стек: Next.js 16 (App Router, Cache Components) · React 19 · TypeScript 6 · Tailwind CSS 4 · shadcn/ui · Motion · AniList GraphQL · Vitest · Playwright.

## Страницы

| Адрес | Что там |
|---|---|
| `/` | Тайтл в тренде, «Популярное сейчас», «Высокий рейтинг», «Сезонные новинки» |
| `/catalog` | Поиск по названию, фильтры (жанр, год, сезон, формат, статус), сортировка, «Загрузить ещё» |
| `/anime/[id]` | Обложка и баннер, названия, описание, рейтинг, характеристики, студии, связанные произведения |

Параметры каталога хранятся в URL — ссылкой можно поделиться, перезагрузка восстанавливает фильтры:

| Параметр | Значения |
|---|---|
| `q` | поисковый запрос (от 2 символов) |
| `genre` | жанр AniList, например `Action`, `Slice of Life` |
| `year` | год сезона, 1960 — следующий год |
| `season` | `WINTER`, `SPRING`, `SUMMER`, `FALL` |
| `format` | `TV`, `TV_SHORT`, `MOVIE`, `OVA`, `ONA`, `SPECIAL` |
| `status` | `RELEASING`, `FINISHED`, `NOT_YET_RELEASED`, `CANCELLED` |
| `sort` | `popularity`, `score`, `newest`, `episodes`, `relevance` (только с поиском) |

Пример: `/catalog?genre=Fantasy&year=2023&sort=score`.

## Запуск

```bash
npm install
npm run dev                  # http://localhost:3000
```

Ключи не нужны: AniList отдаёт публичные данные без авторизации. `.env.local` для каталога не требуется (шаблон переменных — `.env.example`).

## Проверки

```bash
npm run lint
npm run typecheck
npm test                     # unit-тесты (Vitest)
npm run build
npx playwright install chromium   # один раз
npm run test:e2e             # E2E на production-сборке с моком AniList
```

E2E не обращаются к настоящему AniList — используется локальный мок (`tests/mock-anilist`).

## Документация

- [CLAUDE.md](CLAUDE.md) — правила работы и процесс
- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура, каталог и AniList, решения (ADR)
- [DEVELOPMENT.md](DEVELOPMENT.md) — окружение, версии, тестирование, известные ограничения
- [ROADMAP.md](ROADMAP.md) — этапы проекта

Видео на платформе — только лицензированный контент.
