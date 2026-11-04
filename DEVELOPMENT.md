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
| tsx | 4.23.15 | ^4.23.15 (dev) | запуск TypeScript-скриптов с алиасами `@/` (`npm run translate`); встроенное удаление типов в Node не понимает `@/` и импорты без расширения |
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
"test:e2e": "playwright test",
"verify": "node scripts/verify.mjs",
"functions:build": "node scripts/build-edge-functions.mjs",
"functions:check": "node scripts/build-edge-functions.mjs --check",
"prepare": "node scripts/install-hooks.mjs",
"translate": "tsx scripts/translate-backfill.ts"
```
`functions:build` / `functions:check` — сборка Edge Function `translate-cron` в один `index.js` и проверка, что сборка не устарела (ADR-024). `verify` — полный локальный прогон перед слиянием PR, `prepare` — подключение git-хуков (см. «Проверки перед слиянием»).
`translate` — фоновый машинный перевод без сервера (см. «Машинный перевод: настройка DeepL»).
`typecheck` сначала генерирует типы маршрутов (`LayoutProps`, `PageProps` и т. п. в `.next/types`), иначе `tsc` без предварительного `build` падает с `Cannot find name 'LayoutProps'`.

`db:types` — `scripts/gen-types.mjs`: вызывает `npx supabase gen types typescript --project-id bhzshfkhpumyojxuygsc --schema public` (CLI ставить и `supabase link` делать не нужно) и записывает `src/types/database.ts` только при коде выхода 0 и непустом выводе — при любой ошибке файл не трогается. Нужен личный токен Supabase в переменной окружения `SUPABASE_ACCESS_TOKEN` (Dashboard → Account → Access Tokens), заданной в системе или в терминале — npm-скрипты не читают `.env.local`; без него скрипт сразу выходит с кодом 2. Пока токена нет, типы генерируются через Supabase MCP `generate_typescript_types` и вручную переносятся в `src/types/database.ts`.

## Тестирование
| Уровень | Команда | Что проверяет |
|---|---|---|
| Unit (Vitest 4 + jsdom + Testing Library) | `npm test` | `tests/unit/`: клиент AniList (повторы, таймаут, бюджет ожидания, 429, 404, сбои), лимитер и `proxy.ts` (`tests/unit/server/`, окружение node), `/api/catalog` (INVALID_PARAMS), маппинг и форматирование (HTML-сущности, хвосты источников), параметры каталога и сортировка, debounce, компоненты (карточка, постер, поиск, фильтры, мобильная шторка, чипсы, «Загрузить ещё», ошибки); русский контент — клиент Shikimori (пачки, User-Agent, ошибки), ограничитель частоты, BB-коды, кириллица, хеш, выбор источника названия и описания, сверка и отказоустойчивость `loadLocalizations`, русский поиск (MAL id → AniList, порядок и страницы), переводчик, прогресс (проверка тела, порог продолжения, выбор «Продолжить просмотр», формат времени), плеер (клавиши в обеих раскладках, границы перемотки, номер серии, источник видео), аватар (тип по первым байтам, размер), средняя оценка, личный список (проверка ввода, группы), аккаунты (проверка полей, `safeNextPath`, ошибки Auth на русском, proxy: защита `/account`, prefetch, matcher), фоновое заполнение и общий код запуска (`backfill-run.ts`: `limit`, аргументы CLI, код результата, сводка) |
| E2E (Playwright, Chromium) | `npm run test:e2e` | `tests/e2e/`: главная, каталог (поиск, фильтры, сортировка, «В тренде», URL, пагинация, ошибки, лимит 429), страница аниме (связи, заглушки, 404, сбой), API, русский контент (описание Shikimori с атрибуцией, поиск «Атака титанов»), машинный перевод (защита `/api/cron/translate`, перевод через мок DeepL, пометка «Машинный перевод (DeepL)», повторный запуск ничего не тратит), скрипт `npm run translate` против моков (`--limit`, коды выхода 0/1/2, ключ не попадает в вывод), прогресс просмотра (сохранение на паузе, «Продолжаем с 0:03» после перезагрузки, «С начала», «Продолжить просмотр» на главной и следующая серия в профиле после досмотра, гость ничего не отправляет, `/api/progress`: 403 без своего Origin, 400, 401), плеер на тестовом ролике (серия со страницы тайтла, качество 360p/180p меняет кадр, субтитры ru/en и выключение, клавиши паузы и перемотки, автопереход к следующей серии, 404 для серии без прав), серии на странице тайтла, аватар (отказ по содержимому файла, загрузка в шапку и профиль, удаление), средняя оценка зрителей после своей оценки, личный список (гость → вход с возвратом, сохранение статуса и оценки, перезагрузка, «Только оценка», удаление, чужой список не виден), аккаунты на моке Supabase (регистрация, вход и выход, возврат на `next`, защита от open redirect, ошибки полей, подтверждение почты, профиль, смена пароля), комментарии на моке Supabase (гость видит «Войдите, чтобы написать» с возвратом к обсуждению; написать, ответить, ответ на ответ с «@ником», изменить, удалить корень с ответами — «Комментарий удалён»; спойлер размыт до клика; счётчик 2000 и флуд-лимит на 6-м; жалоба и повторная жалоба; обсуждение серии отдельно от тайтла), модерация на моке (модератор `moderator@e2e.test` скрывает — гость не видит, жалоба уходит из `/moderation`; «Вернуть»; бан на 7 дней — «Вы заблокированы до …»; «Снять бан» возвращает форму; «Отклонить жалобы»; ссылка «Модерация» только у модератора; `/moderation` — 404 для пользователя и гостя), адаптивность на 1440×900, 1280×800, 768×1024, 390×844, 360×800 |

**Как устроены E2E.** `playwright.config.ts` поднимает пять серверов:
1. `tests/mock-anilist/server.mjs` — мок AniList GraphQL на `127.0.0.1:4010` с фикстурами (`fixtures.mjs`). Управляемые сценарии: поиск `__error__` → 500, `__ratelimit__` → 429 c `Retry-After: 60`, тайтл `500500` → 500, неизвестный ID → 404. Мок отклоняет запросы с `null`-переменными — так проверяется контракт клиента.
2. `tests/mock-shikimori/server.mjs` — мок Shikimori GraphQL на `127.0.0.1:4020/api/graphql` (без User-Agent `AnimeTown/…` отвечает 403). Фикстуры: MAL 1001 — название и описание с BB-кодами, 1002 — только название (сценарий машинного перевода), 16498 — «Атака титанов» (в моке AniList у тайтла 6 только английское название), 99999 — есть на Shikimori, нет в AniList. Переводы в E2E хранятся в памяти процесса.
3. `tests/mock-deepl/server.mjs` — мок DeepL на `127.0.0.1:4030`: `POST /v2/translate`, `GET /v2/usage`, без заголовка `DeepL-Auth-Key <фиктивный ключ>` — 403, текст `__quota__` — 456.
4. `tests/mock-supabase/server.mjs` — мок Supabase на `127.0.0.1:4040`: Auth (signup, вход по паролю, refresh, `/user`, logout, recover) и Data API для `profiles` в памяти. Токены HS256 с фиктивной подписью — `getClaims()` проверяет их через `GET /auth/v1/user`. Адрес с `confirm` — регистрация без сессии (подтверждение почты). Профиль создаётся «триггером», PATCH — только своя строка, занятый ник → 409/`23505`. `anime_list` — GET/upsert/DELETE только своих строк, гостю 401, проверки статуса и оценки как в базе; `anime_rating_stats` — сумма и число оценок; Storage `avatars` — загрузка и удаление только в своей папке, до 1 МБ, публичная выдача; `episodes`/`subtitles` — тайтл 1: две серии на тестовом ролике и одна без прав (скрыта); `watch_progress` — свои строки, `completed` ≥ 90 %.
5. Production-сборку приложения на `127.0.0.1:3100` с `ANILIST_GRAPHQL_URL`, `SHIKIMORI_GRAPHQL_URL`, `TRANSLATOR_PROVIDER=deepl` + `DEEPL_API_URL` на моки, фиктивными `DEEPL_API_KEY` и `CRON_SECRET` (`tests/e2e/constants.ts`) и `ANIME_TOWN_E2E=1` (отдельная папка `.next-e2e`). Обложки AniList и в production грузятся браузером напрямую, поэтому `tests/e2e/fixtures.ts` подменяет их без сети.

**Лимит по IP в E2E.** `proxy.ts` считает запросы каталога по `x-forwarded-for`; фикстура `extraHTTPHeaders` в `tests/e2e/fixtures.ts` выдаёт каждому тесту свой адрес, поэтому параллельные тесты не упираются в общий лимит, а тесты лимита исчерпывают его намеренно. В фикстурах мока есть тайтл «Meteor Sprint» — первый «В тренде», но последний по популярности.

Тесты не зависят от доступности и лимитов AniList. Скриншоты адаптивности — `test-results/screenshots/` (не коммитятся). Первый запуск: `npx playwright install chromium`.

**Next.js 16 держит прошлые страницы в DOM скрытыми** (`<Activity>`, Cache Components): `getByLabel` находит и скрытые поля — в тестах аккаунтов поля ищутся с `.filter({ visible: true })`, а после отправки формы тест ждёт смены URL.

## Видео для разработки (ADR-022)
- `npm run build:test-hls` — пересобрать тестовый ролик `public/media/test/` (Chromium из Playwright, без ffmpeg): `master.m3u8` → 360p/180p (fMP4: `init.mp4` + `seg0.m4s`), субтитры `subtitles.ru.vtt`/`subtitles.en.vtt`. Видео создано скриптом, сторонних прав нет (`public/media/test/LICENSE.md`).
- `npm run seed:test-episodes` — заглушки серий для «Атаки титанов» (`/anime/16498`): серия 1 — наш ролик с субтитрами, 2 — Big Buck Bunny, 3 — Tears of Steel (CC BY 3.0, Blender Foundation; HLS — тестовые потоки Mux). `-- --remove` — удалить. Нужен `sb_secret_…`. Повторный запуск после `--remove` — это новые серии: настоящие пользователи, у которых тайтл в «Смотрю» или «Хочу посмотреть», получат уведомление «Вышла серия N» (ADR-026).
- Адрес видео для плеера получается только в `resolvePlaybackSource()` — менять источник (этап 8) нужно там.

## Проверка доступа (RLS) на настоящем проекте
`npm run rls:check` (`scripts/rls-check.mjs`): создаёт временных пользователей через admin API (всего 14: 12 пользователей и 2 модератора; нужен `SUPABASE_SERVICE_ROLE_KEY=sb_secret_…`), проверяет от их сессий и от гостя доступ к `profiles`, `anime_list`, `anime_rating_stats`, `anime_localizations`, `episodes`/`subtitles`, `watch_progress`, Storage `avatars` и комментариям: права на колонки `comments`, мягкое удаление, ветку ответов, флуд-лимит (5 подряд и 6 параллельных), баны, жалобы и действия модератора (эффект и ровно одна строка журнала на каждое действие, отказ — без строки), отсечение удалённых корней на странице обсуждения, а также блок «Уведомления» (ADR-026, 19 проверок: уведомление об ответе и его отсутствие при ответе себе; ответ с `reply_to` уведомляет и автора корня, и упомянутого; чужой снимок тайтла не попадает в уведомление; удаление ответа и скрытие модератором убирают только непрочитанные уведомления о нём; выключенная настройка ответов; новая серия — одно непрочитанное с номером последней, из «none» в «own», пакетная вставка, после прочтения новая строка; выключенная настройка новых серий; обложка с чужого домена из `anime_list` записывается как null, а вставка серии не падает; чужие уведомления не видны, клиент не вставляет их и меняет только `read_at`; чужие настройки не читаются и не меняются) (151 проверка; временные серии на несуществующем тайтле и строки журнала модерации тоже удаляются), затем удаляет их файлы и самих пользователей. Ненулевой (или не прочитанный) остаток временных профилей, файлов, серий, комментариев или уведомлений — строка ⚠️. Код выхода 1 — найдена дыра, сбой или остаток. Запускать после каждой миграции с RLS.

## Модерация: роли и баны (до админки этапа 6)
- **Назначить модератора** — SQL Editor в Supabase (роль меняет только сервер):
  ```sql
  update public.profiles set role = 'moderator' where lower(username) = lower('ник');
  ```
  Вернуть обычную роль — `role = 'user'`. У модератора в шапке появляется ссылка «Модерация» (`/moderation`: открытые жалобы и действующие баны; остальным — 404); в меню «⋯» комментария — «Скрыть» / «Вернуть» и «Забанить автора».
- **Снять бан** — кнопка «Снять бан» в `/moderation` (действие `unban`, пишется в журнал). Запасной путь для владельца, без записи в журнал:
  ```sql
  update public.user_bans set revoked_at = now()
  where user_id = (select id from public.profiles where lower(username) = lower('ник')) and revoked_at is null;
  ```
- **DELETE комментария всегда мягкий** для вызова первого уровня — в том числе от service role и из SQL Editor: триггер `comments_before_delete` превращает его в `status = 'deleted'` и стирает текст, строка остаётся. По-настоящему строка удаляется только каскадом (удаление серии или профиля) или в сеансе обслуживания:
  ```sql
  begin;
  alter table public.comments disable trigger comments_before_delete;
  delete from public.comments where id = …;
  alter table public.comments enable trigger comments_before_delete;
  commit;
  ```

## Аккаунты: настройка Supabase Auth (локально)
1. Supabase Dashboard → Authentication → URL Configuration: **Site URL** `http://localhost:3000`, **Redirect URLs** — `http://localhost:3000/**`. Без этого ссылки из писем ведут не на `/auth/callback`.
2. Подтверждение почты (Authentication → Sign In / Providers → Email → Confirm email): включено — после регистрации показывается «проверьте письмо», войти можно после перехода по ссылке. Встроенный SMTP Supabase отправляет лишь несколько писем в час — для разработки хватает, свой SMTP — на этапе 8.
3. Нужны `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` в `.env.local`; service role для аккаунтов не нужен.
4. Маршруты: `/register`, `/login` (`?next=` — куда вернуть), `/forgot-password`, `/auth/callback`, `/auth/update-password`, `/account`.

## Проверки перед слиянием (локально)
GitHub используется только для git и Pull Request: GitHub Actions, Pages, Secrets и Codespaces не используются (решение владельца 2026-11-04; Actions для аккаунта к тому же заблокирован ограничением биллинга). Папки `.github/` в репозитории нет, CI на GitHub нет, PR не ждёт CI. Проверки идут локально:
- **`npm run verify`** (`scripts/verify.mjs`) — lint → typecheck → `functions:check` → unit → build → E2E по очереди; первый сбой останавливает прогон, в конце — сводка по шагам со временем. Код выхода 0 — всё зелёное, 1 — шаг упал. PR сливается **только** при полностью зелёном `verify` на актуальной ветке; результат прогона — в описании PR.
- **`npm run verify -- --quick`** — lint → typecheck → `functions:check` (собранная Edge Function совпадает с исходниками) → unit. Полный `verify` — то же плюс build и E2E.
- **Хук pre-push** (`.githooks/pre-push`) запускает `verify -- --quick` перед каждым `git push`; при сбое push отменяется. Подключается сам при `npm install`/`npm ci` (скрипт `prepare` → `scripts/install-hooks.mjs` → `git config core.hooksPath .githooks`); вручную — `npm run prepare`. Обходить хук (`--no-verify`) нельзя.
- Защита `main` с обязательным CI не включается (см. «Защита main»).


## Локальная production-сборка (вместо превью-деплоя)
```bash
npm run build && npm run start      # http://localhost:3000
```
Ручная проверка перед PR: главная, каталог, страница тайтла на 1440 и 390 px. Хостинга нет до этапа 8 (ADR-017).

## Переменные окружения
- `NEXT_PUBLIC_SITE_URL` — базовый адрес сайта (canonical, Open Graph); локально `http://localhost:3000`, на этапе 8 — продакшен-домен.
`.env.example` → копия в `.env.local`.
- `ANILIST_GRAPHQL_URL` — адрес AniList GraphQL; по умолчанию `https://graphql.anilist.co`, ключ не нужен. Переопределяется только для тестов.
- `SHIKIMORI_GRAPHQL_URL` — адрес Shikimori GraphQL; по умолчанию `https://shikimori.io/api/graphql`, ключ не нужен. Переопределяется только для тестов.
- `SUPABASE_SERVICE_ROLE_KEY` (+ `NEXT_PUBLIC_SUPABASE_URL`) — только сервер: запись переводов в `anime_localizations`. Без него переводы хранятся в памяти процесса и теряются при перезапуске. E2E-сборка (`ANIME_TOWN_E2E=1`) всегда использует память и в настоящую базу не пишет.
- `TRANSLATOR_PROVIDER`, `DEEPL_API_KEY` (или `TRANSLATOR_API_KEY`), `TRANSLATE_MONTHLY_CHAR_LIMIT`, `TRANSLATE_RUN_CHAR_LIMIT`, `CRON_SECRET` — машинный перевод, см. «Машинный перевод: настройка DeepL». `DEEPL_API_URL` учитывается только в E2E-сборке.
- Типы базы: `npm run db:types` (нужен `SUPABASE_ACCESS_TOKEN`, см. «Скрипты package.json») или Supabase MCP `generate_typescript_types` → `src/types/database.ts`. Миграции — `supabase/migrations/`.
- Supabase-клиенты (`src/lib/supabase/`) создаются только при наличии реальных `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; значения-заглушки считаются отсутствующими. Каталог Supabase не использует — без `.env.local` всё работает.

## Машинный перевод: настройка DeepL
1. Ключ DeepL API (Free оканчивается на `:fx` → `api-free.deepl.com`; без `:fx` → `api.deepl.com`): developers.deepl.com → API Keys.
2. Локально — в `.env.local`: `TRANSLATOR_PROVIDER=deepl`, `DEEPL_API_KEY=<ключ>` (или `TRANSLATOR_API_KEY`), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY=<secret key>`. Без service role ключа заполнение не тратит символы (`stopped: no_store`) — перевод потерялся бы при перезапуске.
3. **По расписанию — Supabase Cron → Edge Function `translate-cron` (ADR-024).** pg_cron раз в сутки в 03:17 UTC (задание `translate-cron`, миграция `…_translate_cron_schedule.sql`) делает `net.http_post` на `https://bhzshfkhpumyojxuygsc.supabase.co/functions/v1/translate-cron` с заголовком `x-cron-secret` из Vault. Функция выполняет тот же `runTranslationBackfill`: AniList (до 100 кандидатов) → сверка с Shikimori → DeepL → `anime_localizations`. Один запуск — не больше `TRANSLATE_RUN_CHAR_LIMIT` (15 000) символов и `limit` тайтлов (1–100), месяц — не больше `TRANSLATE_MONTHLY_CHAR_LIMIT` (450 000). Замер 02.11.2026: AniList 0,5–1,4 с, Shikimori на 93 тайтлах (худший случай, все устарели) 0,8–1,7 с, `/v2/usage` < 1 с — запуск укладывается в секунды при лимите функции 150 с.
   - **Журнал и защита от двойного запуска** — таблица `translation_runs` (только service role): строка на запуск (`trigger` cron/manual, `status` running/ok/stopped/failed/abandoned, счётчики, `characters`, расход `usage_used`/`usage_limit`, `error`). Пока есть строка `running`, второй запуск не начинается (функция — 409 `already_running`, скрипт — сообщение и код 0). Строка `running` старше 5 минут при следующем запуске помечается `abandoned`. Блокировку берут все три способа запуска: функция, `npm run translate`, `/api/cron/translate`.
   - **Секреты функции** (Dashboard → Edge Functions → Secrets): `CRON_SECRET`, `TRANSLATOR_PROVIDER=deepl`, `DEEPL_API_KEY`; необязательные `TRANSLATE_RUN_CHAR_LIMIT`, `TRANSLATE_MONTHLY_CHAR_LIMIT`. Ключ базы Supabase подставляет сам: функция берёт `default` из `SUPABASE_SECRET_KEYS` (новые ключи `sb_secret_`), иначе устаревший `SUPABASE_SERVICE_ROLE_KEY`; если подставленный не подходит — задать секрет `TRANSLATE_SUPABASE_SECRET_KEY`. Источник ключа функция пишет в лог (`ключ базы из …`), сам ключ — никогда.
   - **Секрет в Vault** для pg_cron (SQL Editor; значение то же, что `CRON_SECRET`, оно лежит в `.env.local`):
     ```sql
     select vault.create_secret('<CRON_SECRET>', 'translate_cron_secret');
     ```
   - **Деплой функции.** Исходник — `supabase/functions/translate-cron/main.ts` (импортирует `src/lib/localization`), деплоится собранный `index.js`: `npm run functions:build` (esbuild, один файл; `npm run functions:check` в `verify` ловит устаревшую сборку) → Supabase MCP `deploy_edge_function` (`entrypoint_path: index.js`, `verify_jwt: false`) или `npx supabase functions deploy translate-cron --no-verify-jwt` после `supabase login`. `verify_jwt` выключен намеренно: новые ключи не JWT, доступ проверяет код по `x-cron-secret`; без него или с неверным — 401, не POST — 405.
   - **Ручной вызов функции** (тело необязательно; `trigger: manual` — пометка в журнале):
     ```bash
     curl -X POST -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" \
       -d '{"trigger":"manual","limit":5}' https://bhzshfkhpumyojxuygsc.supabase.co/functions/v1/translate-cron
     ```
     Ответ: `{ ok, runId, status, report }`; коды: 200 — ok/stopped, 400 — неверное тело или `limit`, 401, 405, 409 — уже идёт запуск, 500 — сбой настройки или базы (`no_translator`, `no_store`, `AUTH`…), 502 — исключение (AniList, журнал).
   - **Смена `CRON_SECRET`** — значения в двух местах должны совпадать, иначе ночной вызов получит 401:
     1. Новое значение: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` → в `.env.local` (`CRON_SECRET=`).
     2. Секрет функции: Dashboard → Edge Functions → Secrets → `CRON_SECRET` → новое значение (или `npx supabase secrets set CRON_SECRET=…`). Передеплой не нужен.
     3. Vault (SQL Editor): `select vault.update_secret((select id from vault.secrets where name = 'translate_cron_secret'), '<новое значение>');`
     4. Проверка: ручной вызов выше с новым секретом → 200; со старым → 401.
   - **Наблюдение и невидимые сбои.** Если функция не стартовала или `net.http_post` не дошёл, строки в `translation_runs` не будет — поэтому смотреть все три источника (SQL Editor):
     ```sql
     -- 1. Последний успешный запуск (ok/stopped) и последние 5 запусков из журнала
     select id, trigger, status, started_at, finished_at, translated, characters, stopped
       from public.translation_runs where status in ('ok', 'stopped') order by started_at desc limit 1;
     select id, trigger, status, started_at, finished_at - started_at as took, candidates, pending,
            translated, characters, usage_used, usage_limit, stopped, error
       from public.translation_runs order by started_at desc limit 5;
     -- 2. Запуски задания pg_cron: статус выполнения SQL (failed — ошибка в самом задании)
     select runid, status, return_message, start_time, end_time
       from cron.job_run_details
      where jobid = (select jobid from cron.job where jobname = 'translate-cron')
      order by start_time desc limit 5;
     -- 3. Ответы функции на вызовы pg_net (хранятся ~6 ч): код, ошибка сети или таймаута, начало тела
     select id, created, status_code, timed_out, error_msg, left(content, 300) as body
       from net._http_response order by created desc limit 5;
     ```
     Признаки сбоя: в журнале нет строки за сегодня после 03:17 UTC при `succeeded` в `cron.job_run_details` → смотреть `net._http_response` (401 — разошёлся `CRON_SECRET`; 5xx или `timed_out` — функция упала, логи: Dashboard → Edge Functions → translate-cron → Logs); `failed` в `cron.job_run_details` — ошибка SQL задания; задание не запускалось вовсе — `select jobname, schedule, active from cron.job where jobname = 'translate-cron'`.
4. **GitHub Actions не используется:** прежний `translate-cron.yml` удалён 2026-11-04; расписание — только Supabase Cron.
5. Ручной запуск без функции — скрипт пишет прямо в Supabase (тот же журнал и блокировка, `trigger = manual`):
   ```bash
   npm run translate -- --limit 5   # 1–100 тайтлов; без --limit — все кандидаты (≤ 100)
   ```
   Вывод — отчёт JSON. Код выхода: `0` — готово (в том числе `budget_exhausted`, `QUOTA_EXCEEDED`, временные сбои DeepL и «уже идёт другой запуск»), `1` — сбой настройки или базы (`no_translator`, `no_store`, `usage_unavailable`, `AUTH`, `store_error`) или AniList, `2` — неверные аргументы.
6. Ручной запуск через приложение (нужен `CRON_SECRET` в `.env.local`; локальная production-сборка `npm run build && npm run start`):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/translate?limit=5"
   ```
   Ответ — тот же отчёт без текстов: `candidates`, `pending`, `translated`, `characters`, `batches`, `stopped`, `usage { used, limit, ownLimit }`; 409 — уже идёт другой запуск.
7. Остаток квоты — `usage` в отчёте, `usage_used`/`usage_limit` в `translation_runs` или `GET https://api-free.deepl.com/v2/usage` с заголовком `Authorization: DeepL-Auth-Key <ключ>`.

Значения `stopped`: `no_translator` (нет провайдера/ключа), `no_store` (нет service role или в `SUPABASE_SERVICE_ROLE_KEY` по ошибке publishable-ключ `sb_publishable_…` — нужен secret key `sb_secret_…`; проверка до обращения к DeepL), `usage_unavailable`, `budget_exhausted` (свой предел или лимит DeepL), `AUTH` (403 — неверный ключ), `QUOTA_EXCEEDED` (456), `RATE_LIMITED`/`UNAVAILABLE` (повторы исчерпаны, следующий запуск продолжит), `store_error`.

## Скорость: как замерять
Локальная production-сборка (`npm run build && npm run start`), затем `npm run perf -- <метка>` (`scripts/perf-measure.mjs`, результат — `test-results/perf-<метка>.json`). Реальные AniList/Shikimori/Supabase. Скрипт (Playwright) меряет: ответ сервера на холодном и тёплом кэше (главная, `/catalog`, фильтр, поиск латиницей и кириллицей, `/anime/[id]`, `/api/catalog?page=2`), переходы в браузере (главная → каталог, Enter в поиске, карточка → тайтл с наведением 300 мс, «Загрузить ещё»), JS страницы в gzip. Результаты и цифры до/после — Obsidian `10 - Тестирование/Производительность`.
Что ускорено (ADR-019): кэш страницы тайтла, prefetch по наведению (`IntentLink`), шапка тайтла из карточки, CSS-анимация вместо Motion, следующая страница каталога заранее.

## Каталог: известные ограничения
- **Первый показ тайтла и новый поиск** упираются во внешние API: AniList 0,4–0,8 с, Shikimori 0,2–0,9 с из Беларуси. Шапка тайтла показывается сразу из карточки, детали — когда ответит AniList. Общий кэш в Supabase — этап 8 (ADR-019).
- **Перевод на странице тайтла** после ежедневного заполнения (Supabase Cron) появляется в течение 10 минут (кэш страницы); ручной `/api/cron/translate` — сразу.
- **Русский контент** — названия и описания берутся с Shikimori. Тайтлы без описания на Shikimori получают машинный перевод DeepL при ежедневном фоновом заполнении — только трендовые и популярные (до 100 за раз); остальные показываются с английским описанием и пометкой. Русский поиск ограничен 50 лучшими совпадениями Shikimori. Названия в «Связанных произведениях» — пока по синонимам AniList.
- **Лимит AniList** — 30 запросов в минуту на сервер (на 31.10.2026, обычно 90). Кэш снимает повторы, лимит по IP (20/мин, `proxy.ts`) — всплески одного клиента. Общий поток от многих IP он не ограничивает: при холодном кэше и всплеске трафика пользователь может увидеть «Слишком много запросов» с кнопкой «Повторить».
- **Лимитер в памяти процесса.** Локально и на одном сервере этого достаточно; если на хостинге (этап 8) будет несколько экземпляров, у каждого свой счётчик — общий — реализация `RateLimiter` на Upstash или Supabase (`src/lib/rate-limit/catalog.ts`).
- **Кэш `use cache` в памяти процесса.** Не общий между экземплярами и сбрасывается при перезапуске; для продакшена (этап 8) — `use cache: remote` или собственная таблица `anime` (этап 2 после Supabase).
- **HTTP-статус 404.** Страница «не найдено» приходит с кодом 200 и `noindex`: при потоковой отрисовке (Partial Prerender) заголовки уже отправлены. Это поведение Next.js 16.
- **«Загрузить ещё» не сохраняется в URL** — после перезагрузки показывается первая страница с теми же фильтрами.
- **Общее число результатов** не показывается: `pageInfo.total` у AniList ненадёжен, используется `hasNextPage`.

## .gitignore
Объединены правила проекта и шаблона Next.js: `node_modules/`, `.next/`, `.next-e2e/`, `.env*` (кроме `.env.example`), `*.pem`, отчёты Playwright, `.playwright-mcp/`, временные файлы Supabase, `.mcp.json`, `.claude/settings.local.json`. При добавлении инструментов — дополнять.

## Ветки и коммиты
- `main` — стабильная основная ветка (`origin/main`, первый коммит `dd5a3a7`). Напрямую в неё не коммитим и не пушим.
- Для каждой задачи — отдельная ветка от актуальной `main`: `feature/<name>`, `fix/<name>`, `docs/<name>` (служебное — `chore/<name>`).
- Изменения предлагаются через Pull Request в `main`.
- Перед слиянием проверяются изменения (diff PR) и результаты lint + typecheck + test + build + e2e — локальный `npm run verify` (CI на GitHub не запускается, см. «Проверки перед слиянием»).
- Conventional Commits в сообщениях коммитов (`feat:`, `fix:`, `docs:`, `chore:` …).
- Коммит, push и создание PR — после разрешения пользователя; слияние PR — только после отдельного разрешения пользователя (см. CLAUDE.md → «Автономная разработка»).

## Защита main
Репозиторий `MrArtik476/anime-town` приватный, тариф GitHub Free — Branch Protection Rules для него недоступны. Поэтому правила ниже **организационные**: GitHub технически не блокирует прямые изменения в `main`, их соблюдение — ответственность каждого участника и Claude.
- Работа только через ветки задач и Pull Request.
- Не сливать PR без разрешения пользователя и без проверки изменений и тестов.
- Не выполнять `git push --force` (в том числе `--force-with-lease`) в `main`.
- Не удалять `main` ни локально, ни на GitHub.

## Секреты
- Локально — `.env.local`; для Edge Function `translate-cron` — секреты функции Supabase (Dashboard → Edge Functions → Secrets) и Vault (`translate_cron_secret` для pg_cron), см. «Машинный перевод»; GitHub Secrets не используются; на хостинге — его переменные окружения (этап 8).
- В коде и тестах — только фиктивные значения (`tests/e2e/constants.ts`); CI секретов не получает.
- Токен Obsidian MCP — переменная окружения пользователя Windows `OBSIDIAN_MCP_TOKEN`; в файлах только ссылка `${OBSIDIAN_MCP_TOKEN}`.
- Перед коммитом: `git diff --cached` не должен содержать ключей (проверка в skill `anime-quality-check`).
- Утёкший ключ — немедленно отозвать и перевыпустить, удаления из истории недостаточно.

## Рабочий цикл с Claude
1. Задача → `superpowers:brainstorming` → план (`writing-plans`).
2. Ветка `feature/<name>` (или `fix/`, `docs/`) от `main`, реализация с нужным skill проекта (см. CLAUDE.md).
3. `anime-quality-check` → показать изменения и результаты проверок → коммит после разрешения.
4. Запись в Obsidian: Development Log, Dashboard, при необходимости — ошибки/решения.
5. Отчёт пользователю → push ветки и PR после разрешения → слияние PR только после отдельного разрешения.
