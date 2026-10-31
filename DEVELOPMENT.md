# DEVELOPMENT — окружение и процесс

## Расположение
- Рабочая область Claude Code / VS Code: `…\Anime Town\` (там `.claude/skills/` и `.mcp.json`).
- Git-репозиторий: `…\Anime Town\Buld\`, `origin` = `https://github.com/MrArtik476/anime-town.git`.
- Все команды ниже выполняются в `Buld/`.

## Требования (Windows 10/11)
| Инструмент | Версия | Установка |
|---|---|---|
| Node.js | ≥ 20.9 (установлен 26.x) | `winget install OpenJS.NodeJS.LTS` |
| npm | идёт с Node.js (установлен 11.x) | — |
| Git | актуальная | `winget install Git.Git` |
| GitHub CLI | актуальная | `winget install GitHub.cli`, затем `gh auth login` |
| VS Code, Claude Code | актуальные | установлены |
| Obsidian | ≥ 1.13 (для Vault as MCP) | установлен |
| Supabase CLI | актуальная | `npm i -D supabase` в проекте |

Проверка: `node -v`, `npm -v`, `git --version`, `gh auth status`.

## Версии пакетов (установлены 31.10.2026, `package-lock.json`)
| Пакет | Установлено | Диапазон в package.json | Комментарий |
|---|---|---|---|
| next | 16.4.3 | 16.4.3 | Node ≥ 20.9; Turbopack, Cache Components, Partial Prefetching включены шаблоном |
| react / react-dom | 19.3.0 | 19.3.0 | |
| typescript | **6.0.3** | `~6.0.3` | typescript-eslint 8.72 требует `<6.1.0` — поэтому `~`, не `^`; TS 7 не ставить |
| tailwindcss | 4.3.3 | ^4 | подключён через `@tailwindcss/turbopack` (без PostCSS) |
| shadcn/ui | CLI 4.23.0 | ^4.23.0 (dev) | стиль `base-nova` на Base UI (`@base-ui/react` 1.9.0); компоненты button, input, sheet, skeleton; `cn` 0.5.1, `class-variance-authority` 0.7.1, `lucide-react` 1.66.0, `tw-animate-css` 1.4.0 |
| motion | 14.9.0 | ^14.9.0 | импорт `motion/react` |
| @supabase/supabase-js | 2.118.0 | ^2.118.0 | |
| @supabase/ssr | 0.12.7 | ^0.12.7 | cookies-сессии для App Router |
| hls.js | 1.7.4 | ^1.7.4 | |
| @playwright/test | 1.64.1 | ^1.64.1 (dev) | E2E; браузер: `npx playwright install chromium` |
| vitest | 4.1.12 | ^4.1.12 (dev) | unit-тесты; v5 требует `@types/node` ≥ 22 |
| jsdom | 30.1.3 | ^30 (dev) | окружение для тестов компонентов |
| @testing-library/react / dom / user-event | 16.3.3 / 10.4.2 / 14.6.8 | dev | тесты компонентов (React 19) |
| eslint | **9.39.5** | ^9 (dev) | + eslint-config-next 16.4.3. ESLint 10 не ставить: плагины `import`, `jsx-a11y`, `react` внутри eslint-config-next поддерживают только ≤ 9 |
| supabase (CLI) | — | — | не установлен; ставится вместе с Supabase-проектом: `npm i -D supabase` |

Пакеты вне этой таблицы и смена мажорных версий — только после подтверждения и записи в таблицу.
`npm audit --omit=dev` — 0 уязвимостей. Предупреждения уровня moderate в dev-зависимостях идут через CLI `shadcn` (`deepmerge`, `ts-morph`/`minimatch`); `npm audit fix --force` не запускать — он откатывает shadcn до 1.0.

## Инициализация проекта (выполнена 31.10.2026)
`create-next-app` нельзя запускать прямо в `Buld/`: он допускает в целевой папке только `.git`, `.gitignore`, `.claude` и ещё несколько служебных файлов, а `CLAUDE.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, `ROADMAP.md`, `.env.example`, `.mcp.json` считает конфликтом (флага `--force` нет). Как это было сделано — на случай повторной генерации:

```bash
# 1. Генерация во временной папке вне репозитория
npx create-next-app@16.4.3 anime-town-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --skip-install --disable-git --yes
# 2. Перенос в Buld/ без перезаписи существующих файлов (демо-иконки public/*.svg не переносились)
# 3. .gitignore — объединён вручную: наши правила + строки шаблона (/.pnp, .pnp.*, .yarn/*, /coverage, *.pem, yarn/pnpm-логи)
# 4. Зависимости
npm install
npm i -D typescript@~6.0.3
npx shadcn@latest init -d -y --no-monorepo
npm i motion @supabase/supabase-js @supabase/ssr hls.js
npm i -D @playwright/test
```

`AGENTS.md`: блок между `<!-- BEGIN:nextjs-agent-rules -->` и `<!-- END:nextjs-agent-rules -->` создаёт и поддерживает `next dev` (Next.js ≥ 16.3) — он направляет агентов к документации установленной версии в `node_modules/next/dist/docs/`. Файл коммитится, блок вручную не редактируется. Отключение — `agentRules: false` в `next.config.ts`.

## Скрипты package.json
```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"lint": "eslint",
"typecheck": "next typegen && tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```
`typecheck` сначала генерирует типы маршрутов (`LayoutProps`, `PageProps` и т. п. в `.next/types`), иначе `tsc` без предварительного `build` падает с `Cannot find name 'LayoutProps'`.

Добавить вместе с Supabase-проектом:
```json
"db:types": "supabase gen types typescript --linked > src/types/database.ts"
```
`db:types` берёт проект из `supabase link` (один раз: `npx supabase login` → `npx supabase link --project-ref <ref>`), поэтому работает и в cmd.exe на Windows, где npm-скрипты не подставляют `$VAR`.

## Тестирование
| Уровень | Команда | Что проверяет |
|---|---|---|
| Unit (Vitest 4 + jsdom + Testing Library) | `npm test` | `tests/unit/`: клиент AniList (повторы, таймаут, бюджет ожидания, 429, 404, сбои), лимитер и `proxy.ts` (`tests/unit/server/`, окружение node), `/api/catalog` (INVALID_PARAMS), маппинг и форматирование (HTML-сущности, хвосты источников), параметры каталога и сортировка, debounce, компоненты (карточка, постер, поиск, фильтры, мобильная шторка, чипсы, «Загрузить ещё», ошибки); русский контент — клиент Shikimori (пачки, User-Agent, ошибки), ограничитель частоты, BB-коды, кириллица, хеш, выбор источника названия и описания, сверка и отказоустойчивость `loadLocalizations`, русский поиск (MAL id → AniList, порядок и страницы), переводчик |
| E2E (Playwright, Chromium) | `npm run test:e2e` | `tests/e2e/`: главная, каталог (поиск, фильтры, сортировка, «В тренде», URL, пагинация, ошибки, лимит 429), страница аниме (связи, заглушки, 404, сбой), API, русский контент (описание Shikimori с атрибуцией, метка машинного перевода, поиск «Атака титанов»), адаптивность на 1440×900, 1280×800, 768×1024, 390×844, 360×800 |

**Как устроены E2E.** `playwright.config.ts` поднимает три сервера:
1. `tests/mock-anilist/server.mjs` — мок AniList GraphQL на `127.0.0.1:4010` с фикстурами (`fixtures.mjs`). Управляемые сценарии: поиск `__error__` → 500, `__ratelimit__` → 429 c `Retry-After: 60`, тайтл `500500` → 500, неизвестный ID → 404. Мок отклоняет запросы с `null`-переменными — так проверяется контракт клиента.
2. `tests/mock-shikimori/server.mjs` — мок Shikimori GraphQL на `127.0.0.1:4020/api/graphql` (без User-Agent `AnimeTown/…` отвечает 403) и мок переводчика `POST /translate`. Фикстуры: MAL 1001 — название и описание с BB-кодами, 1002 — только название (сценарий машинного перевода), 16498 — «Атака титанов» (в моке AniList у тайтла 6 только английское название), 99999 — есть на Shikimori, нет в AniList. Переводы в E2E хранятся в памяти процесса.
3. Production-сборку приложения на `127.0.0.1:3100` с `ANILIST_GRAPHQL_URL`, `SHIKIMORI_GRAPHQL_URL` и `TRANSLATOR_PROVIDER=mock` на моки и `ANIME_TOWN_E2E=1` (отдельная папка `.next-e2e`). Обложки AniList и в production грузятся браузером напрямую, поэтому `tests/e2e/fixtures.ts` подменяет их без сети.

**Лимит по IP в E2E.** `proxy.ts` считает запросы каталога по `x-forwarded-for`; фикстура `extraHTTPHeaders` в `tests/e2e/fixtures.ts` выдаёт каждому тесту свой адрес, поэтому параллельные тесты не упираются в общий лимит, а тесты лимита исчерпывают его намеренно. В фикстурах мока есть тайтл «Meteor Sprint» — первый «В тренде», но последний по популярности.

Тесты не зависят от доступности и лимитов AniList. Скриншоты адаптивности — `test-results/screenshots/` (не коммитятся). Первый запуск: `npx playwright install chromium`.

## Переменные окружения
`.env.example` → копия в `.env.local`.
- `ANILIST_GRAPHQL_URL` — адрес AniList GraphQL; по умолчанию `https://graphql.anilist.co`, ключ не нужен. Переопределяется только для тестов.
- `SHIKIMORI_GRAPHQL_URL` — адрес Shikimori GraphQL; по умолчанию `https://shikimori.io/api/graphql`, ключ не нужен. Переопределяется только для тестов.
- `SUPABASE_SERVICE_ROLE_KEY` (+ `NEXT_PUBLIC_SUPABASE_URL`) — только сервер: запись переводов в `anime_localizations`. Без него переводы хранятся в памяти процесса и теряются при перезапуске. E2E-сборка (`ANIME_TOWN_E2E=1`) всегда использует память и в настоящую базу не пишет.
- `TRANSLATOR_PROVIDER`, `TRANSLATOR_API_KEY` — машинный перевод EN→RU. Провайдер ещё не выбран; пока переменные пусты, перевод выключен. Значение `mock` работает только в E2E-сборке.
- Типы базы: `npm run db:types` (нужен однократный `npx supabase login`) или Supabase MCP `generate_typescript_types` → `src/types/database.ts`. Миграции — `supabase/migrations/`.
- Supabase-клиенты (`src/lib/supabase/`) создаются только при наличии реальных `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; значения-заглушки считаются отсутствующими. Каталог Supabase не использует — без `.env.local` всё работает.

## Каталог: известные ограничения
- **Русский контент** — названия и описания берутся с Shikimori. Тайтлы без MAL id или без описания на Shikimori показываются с английским описанием и пометкой, пока не выбран машинный переводчик. Русский поиск ограничен 50 лучшими совпадениями Shikimori. Названия в «Связанных произведениях» — пока по синонимам AniList.
- **Лимит AniList** — 30 запросов в минуту на сервер (на 31.10.2026, обычно 90). Кэш снимает повторы, лимит по IP (20/мин, `proxy.ts`) — всплески одного клиента. Общий поток от многих IP он не ограничивает: при холодном кэше и всплеске трафика пользователь может увидеть «Слишком много запросов» с кнопкой «Повторить».
- **Лимитер в памяти процесса.** На Vercel у каждого экземпляра свой счётчик; общий — реализация `RateLimiter` на Upstash или Supabase (`src/lib/rate-limit/catalog.ts`).
- **Кэш `use cache` в памяти процесса.** На Vercel (serverless) он не общий между экземплярами; для продакшена — `use cache: remote` или собственная таблица `anime` (этап 2 после Supabase).
- **HTTP-статус 404.** Страница «не найдено» приходит с кодом 200 и `noindex`: при потоковой отрисовке (Partial Prerender) заголовки уже отправлены. Это поведение Next.js 16.
- **«Загрузить ещё» не сохраняется в URL** — после перезагрузки показывается первая страница с теми же фильтрами.
- **Общее число результатов** не показывается: `pageInfo.total` у AniList ненадёжен, используется `hasNextPage`.

## .gitignore
Объединены правила проекта и шаблона Next.js: `node_modules/`, `.next/`, `.next-e2e/`, `.env*` (кроме `.env.example`), `*.pem`, отчёты Playwright, `.playwright-mcp/`, временные файлы Supabase, `.mcp.json`, `.claude/settings.local.json`. При добавлении инструментов — дополнять.

## Ветки и коммиты
- `main` — стабильная основная ветка (`origin/main`, первый коммит `dd5a3a7`). Напрямую в неё не коммитим и не пушим.
- Для каждой задачи — отдельная ветка от актуальной `main`: `feature/<name>`, `fix/<name>`, `docs/<name>` (служебное — `chore/<name>`).
- Изменения предлагаются через Pull Request в `main`.
- Перед слиянием проверяются изменения (diff PR) и результаты lint + typecheck + test + build + e2e.
- Conventional Commits в сообщениях коммитов (`feat:`, `fix:`, `docs:`, `chore:` …).
- Коммит, push и создание PR — после разрешения пользователя; слияние PR — только после отдельного разрешения пользователя (см. CLAUDE.md → «Автономная разработка»).

## Защита main
Репозиторий `MrArtik476/anime-town` приватный, тариф GitHub Free — Branch Protection Rules для него недоступны. Поэтому правила ниже **организационные**: GitHub технически не блокирует прямые изменения в `main`, их соблюдение — ответственность каждого участника и Claude.
- Работа только через ветки задач и Pull Request.
- Не сливать PR без разрешения пользователя и без проверки изменений и тестов.
- Не выполнять `git push --force` (в том числе `--force-with-lease`) в `main`.
- Не удалять `main` ни локально, ни на GitHub.

## Секреты
- Локально — `.env.local`; в облаке — Vercel Environment Variables и Supabase.
- Токен Obsidian MCP — переменная окружения пользователя Windows `OBSIDIAN_MCP_TOKEN`; в файлах только ссылка `${OBSIDIAN_MCP_TOKEN}`.
- Перед коммитом: `git diff --cached` не должен содержать ключей (проверка в skill `anime-quality-check`).
- Утёкший ключ — немедленно отозвать и перевыпустить, удаления из истории недостаточно.

## Рабочий цикл с Claude
1. Задача → `superpowers:brainstorming` → план (`writing-plans`).
2. Ветка `feature/<name>` (или `fix/`, `docs/`) от `main`, реализация с нужным skill проекта (см. CLAUDE.md).
3. `anime-quality-check` → показать изменения и результаты проверок → коммит после разрешения.
4. Запись в Obsidian: Development Log, Dashboard, при необходимости — ошибки/решения.
5. Отчёт пользователю → push ветки и PR после разрешения → слияние PR только после отдельного разрешения.
