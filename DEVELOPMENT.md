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

## Версии пакетов (проверено 31.10.2026 по npm)
| Пакет | Версия | Комментарий |
|---|---|---|
| next | 16.4.x | Node ≥ 20.9, React 18/19 |
| react / react-dom | 19.x | |
| typescript | **6.0.3** | typescript-eslint 8.72 требует `<6.1.0`, TS 7 не ставить |
| tailwindcss | 4.3.x | |
| motion | 14.x | импорт `motion/react` |
| shadcn (CLI) | 4.x | `npx shadcn@latest init` |
| @supabase/supabase-js | 2.118.x | |
| @supabase/ssr | 0.12.x | cookies-сессии для App Router |
| hls.js | 1.7.x | |
| @playwright/test | 1.64.x | |
| eslint | 10.x + eslint-config-next 16.4 | flat config |
| supabase (CLI) | актуальная | dev-зависимость |

Пакеты вне этой таблицы и смена мажорных версий — только после подтверждения и записи в таблицу.

## Инициализация проекта (один раз)
```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
npm i -D typescript@6.0.3
npx shadcn@latest init
npm i motion @supabase/supabase-js @supabase/ssr hls.js
npm i -D @playwright/test supabase && npx playwright install chromium
```
Пакеты добавляются по мере появления фич, а не все сразу.
`create-next-app` может отказаться работать в непустой папке (в `Buld/` уже лежат документация, `.claude/`, `.mcp.json`). В этом случае сгенерировать проект во временную папку и перенести файлы в `Buld/`, не перезаписывая существующие документы; конфликты (`.gitignore`, `README.md`) объединить вручную.

## Скрипты package.json (добавить)
```json
"typecheck": "tsc --noEmit",
"test": "node --test",
"test:e2e": "playwright test",
"db:types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/database.ts"
```
Для `test` можно выбрать Vitest — тогда добавить его в таблицу версий.

## .gitignore
Создан до первого коммита: `node_modules/`, `.next/`, `.env*` (кроме `.env.example`), отчёты Playwright, временные файлы Supabase и т. д. При добавлении инструментов — дополнять.

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
