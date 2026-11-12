# Шаг 6b «Модерация из админки» — план реализации

> **Для исполнителя:** выполнять по задачам, логика — через `superpowers:test-driven-development` (сначала падающий тест). Шаги отмечаются флажками.

**Цель:** администратор видит в `/admin/moderation` журнал действий модераторов, все жалобы (включая закрытые) и все баны, и может снять бан.

**Подход (вариант А, согласован 2026-11-12):** только новые страницы чтения поверх существующих таблиц и политик. База уже отдаёт администратору журнал, жалобы и баны (`private.is_moderator()` включает роль `admin`), а снятие бана — существующее действие `unbanUser` (вставка `unban` в `moderation_actions`, эффект и запись делает триггер). Миграции нет. Страница `/moderation` и её код не меняются.

**Стек:** Next.js 16 (Server Components, `searchParams`, GET-формы), Supabase Data API от сессии администратора, Vitest, Playwright на моке Supabase.

## Согласованные рамки

- Раздел видит только администратор: каждая страница начинается с `requireAdmin()` (остальным 404).
- Журнал в базе по-прежнему читают и модераторы (политика этапа 5 не меняется) — это записывается в ADR-028 как принятое.
- Фильтры журнала: ник модератора, ник цели, тип действия, период (даты «с» и «по», сутки по Минску, UTC+3).
- Жалобы в админке — только просмотр, фильтр по статусу. Разбор открытых жалоб остаётся на `/moderation`.
- Баны — вся история, фильтр «действующие / завершённые / все». Снятие бана — без причины, как сейчас.
- Страницы по 20 строк, «Показать ещё» — ссылка с курсором в адресе (работает без JavaScript).
- Service role не используется. Новых пакетов нет.

## Открытый вопрос к владельцу (не блокирует)

Списки «все жалобы» и «все баны» сортируются по дате без подходящего индекса (есть только индекс открытых жалоб). При нынешних объёмах это незаметно. Индексы `comment_reports (created_at desc, id desc)` и `user_bans (created_at desc, id desc)` — это миграция на удалённом Supabase; в 6b не делаю, условие возврата записываю в ADR-028. Если хотите сразу — добавлю отдельной задачей.

## Что проверить особо (в тестах задач ниже)

1. Испорченные параметры адреса (курсор, дата `2026-13-45`, неизвестный тип действия или статус) — фильтр игнорируется, страница не падает.
2. Ник в фильтре не найден — пустой список с текстом «Пользователь @ник не найден», а не весь журнал.
3. Удалённый пользователь или комментарий в строке журнала (`null` в ссылке) — «удалён», без ошибки.
4. Бан, срок которого истёк между загрузкой страницы и нажатием «Снять бан» — понятное сообщение из `PT422`, список обновляется.
5. Период «по» включает весь указанный день; «с» позже «по» — пустой список.

---

### Задача 1. Модель: фильтры, подписи, состояние бана

**Файлы:**
- Создать: `src/features/moderation/admin-model.ts`
- Тест: `tests/unit/moderation-admin.test.ts`

**Даёт следующим задачам:**
- `MOD_ACTIONS`, `ModAction`, `MOD_ACTION_LABELS` («Скрыл комментарий», «Вернул комментарий», «Отклонил жалобы», «Забанил», «Снял бан»).
- `parseLogFilters(params): LogFilters` — `{ moderator: string | null; target: string | null; action: ModAction | null; from: string | null; to: string | null }`; ники — только `[A-Za-z0-9_]`, до 40 знаков; `from`/`to` — границы ISO: `from` = `YYYY-MM-DDT00:00:00+03:00`, `to` = начало следующего дня (исключительно).
- `REPORT_STATUSES`, `ReportStatus`, `REPORT_STATUS_LABELS` («Открыта», «Принята — комментарий скрыт», «Отклонена»), `parseReportStatus(raw): ReportStatus | null`.
- `BAN_FILTERS = ["active", "ended", "all"]`, `parseBanFilter(raw): BanFilter` (по умолчанию `active`).
- `banState(ban: { expires_at: string | null; revoked_at: string | null }, nowMs: number): "active" | "expired" | "revoked"`.
- `pageHref(base: string, params: Record<string, string | null>): string` — адрес с непустыми параметрами (для «Показать ещё» и сохранения фильтров).

Шаги:
- [ ] Тесты: разбор фильтров (верные, пустые, испорченные значения из пункта 1; граница дня из пункта 5), `banState` (навсегда, истёк ровно в `nowMs`, снят раньше срока), `parseBanFilter`, `pageHref`.
- [ ] Запустить `npm test -- moderation-admin` — тесты падают (модуля нет).
- [ ] Написать модуль.
- [ ] Тесты проходят.

### Задача 2. Мок Supabase: чтение журнала

**Файлы:**
- Изменить: `tests/mock-supabase/server.mjs` (`handleModerationActions`: GET — строки только модератору и администратору, остальным пустой список, как RLS; при необходимости — операторы фильтра `not.is.null`, `lte`, `gte`, `lt` в `condition`).

Шаги:
- [ ] Проверить, какие операторы уже понимает `condition`/`logic`; добавить недостающие.
- [ ] GET `moderation_actions` с фильтрами, сортировкой и лимитом (как `handleBans`).

### Задача 3. Запросы админки

**Файлы:**
- Создать: `src/features/moderation/admin-queries.ts`
- Тест: `tests/unit/moderation-admin-queries.test.ts` (клиент Supabase подменён, по образцу `notifications-queries.test.ts`)

**Даёт:**
- `type Page<T> = { items: T[]; nextCursor: string | null; failed: boolean; unknownUser?: string }`
- `getModerationLog(filters: LogFilters, cursor: string | null): Promise<Page<LogEntry>>` — `LogEntry = { id; action: ModAction; moderator: string; target: string | null; commentId: number | null; commentHref: string | null; banDuration: BanDuration | null; reason: string | null; createdAt: string }`.
- `getAllReports(status: ReportStatus | null, cursor): Promise<Page<ReportEntry>>` — `ReportEntry = { id; reason: ReportReason; details: string | null; status: ReportStatus; reporter: string; resolvedBy: string | null; resolvedAt: string | null; createdAt: string; commentBody: string | null; commentAuthor: string; commentHref: string | null }`.
- `getAllBans(filter: BanFilter, cursor): Promise<Page<BanEntry>>` — `BanEntry = { id; userId: string; username: string; moderator: string; reason: string | null; createdAt: string; expiresAt: string | null; revokedAt: string | null; revokedBy: string | null; state: "active" | "expired" | "revoked" }`.

Правила: сортировка `created_at desc, id desc`; читается 21 строка, 21-я даёт курсор (`encodeCursor`/`decodeCursor` из `features/comments/model`); ники — одним запросом `profiles … in(ids)`; ссылка на комментарий — `commentHref` из `features/moderation/model`; ник фильтра ищется точным совпадением без учёта регистра, не найден — `unknownUser`, запрос к журналу не выполняется.

Шаги:
- [ ] Тесты: один запрос профилей на страницу (без N+1); `unknownUser` не обращается к журналу; 21-я строка даёт курсор и не попадает в `items`; ошибка базы → `failed: true`; `null`-ссылки → «удалён».
- [ ] Тесты падают → реализация → тесты проходят.

### Задача 4. Страницы и компоненты

**Файлы:**
- Изменить: `src/features/admin/components/admin-shell.tsx` (раздел «Модерация» → `/admin/moderation`), `src/app/admin/page.tsx` (карточка «Модерация» ведёт в `/admin/moderation`).
- Создать: `src/features/moderation/components/admin-moderation-nav.tsx` (ссылки «Журнал», «Жалобы», «Баны», `aria-current`, и ссылка «Разобрать открытые жалобы» → `/moderation`).
- Создать: `src/app/admin/moderation/page.tsx` (журнал, GET-форма фильтров), `src/app/admin/moderation/reports/page.tsx`, `src/app/admin/moderation/bans/page.tsx`.
- Создать: `src/features/moderation/components/admin-ban-list.tsx` (клиентский: список банов и «Снять бан» через `unbanUser`; обновления состояния после `await` — во вложенном `startTransition`, Ошибка 40).

Правила: перед кодом — гайды `node_modules/next/dist/docs/` (страницы, `searchParams`, формы) и skill `anime-ui-design`; `metadata.robots.index = false`; состояния «пусто», «ошибка» (`role="alert"`), «загрузка» (скелет `AdminShell`); на 360 px строки переносятся, без горизонтальной прокрутки; даты — `Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Minsk" })`; текущее время берётся только после `requireAdmin()` (Ошибки 12 и 34).

Шаги:
- [ ] Каркас раздела и навигация.
- [ ] Журнал с фильтрами и «Показать ещё».
- [ ] Жалобы с фильтром статуса.
- [ ] Баны с фильтром и снятием.

### Задача 5. E2E на моке

**Файлы:**
- Создать: `tests/e2e/admin-moderation.spec.ts` (свои ники и тексты, после себя — уборка: снятие банов).

Сценарии:
- [ ] Гость, пользователь и модератор: `/admin/moderation`, `/reports`, `/bans` — 404.
- [ ] Модератор скрыл комментарий по жалобе → администратор видит строку в журнале («Скрыл комментарий», ник модератора и автора), фильтр по нику модератора и по типу действия; несуществующий ник — «Пользователь @… не найден».
- [ ] Та же жалоба в «Жалобах» со статусом «Принята — комментарий скрыт» и ником закрывшего; фильтр «Открытые» её не показывает.
- [ ] Модератор банит на 7 дней → администратор видит бан в «Действующих», снимает → бан в «Завершённых» с «Снят @admin», в журнале — «Снял бан», у пользователя снова есть форма комментария.
- [ ] 360×800: раздел без горизонтальной прокрутки.
- [ ] Существующие `moderation.spec.ts` и `admin.spec.ts` проходят без правок.

### Задача 6. Проверка прав на настоящей базе

**Файлы:**
- Изменить: `scripts/rls-check.mjs` — блок «Модерация из админки».

Проверки: администратор читает журнал, чужие жалобы и чужие баны; снимает бан — бан снят и в журнале ровно одна строка `unban` с его `moderator_id`; обычный пользователь и гость не читают журнал, чужие жалобы и чужие баны; никто (включая администратора) не меняет и не удаляет строки `user_bans`, `comment_reports`, `moderation_actions` напрямую; модератор журнал читает — зафиксировано как принятое поведение.

- [ ] Дописать блок, обновить число проверок в документации.
- [ ] `npm run rls:check` — **после разрешения владельца** (скрипт создаёт временных пользователей на удалённом проекте).

### Задача 7. Документы и проверки

- [ ] `ROADMAP.md`: 6a — «слит, PR #33» вместо «ветка `feature/admin-panel`»; 6b отмечен.
- [ ] `ARCHITECTURE.md`: раздел «Админ-панель», ADR-028 (решение, альтернативы Б и В, последствия, условие возврата к индексам).
- [ ] `DEVELOPMENT.md`: «Модерация: роли и баны», описание тестов и мока, число проверок `rls:check`.
- [ ] Obsidian: ADR-028, заметка PR, заметка этапа 6 (в т. ч. устаревшее «Не запушено, PR нет»), Dashboard (устаревшая строка «E2E 89, rls:check 151»), Development Log.
- [ ] `npm run verify` — 6 шагов зелёные; вывод итога показать владельцу.
- [ ] Коммиты, push и PR — каждый после отдельного разрешения.
