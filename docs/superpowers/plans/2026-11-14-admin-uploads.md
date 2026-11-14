# Этап 6d — загрузка субтитров и сводка: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Администратор загружает `.vtt` с компьютера в закрытый бакет `subtitles`; сайт отдаёт файл только тем, кто видит серию; на `/admin` — сводка по сайту.

**Architecture:** Закрытый бакет; адрес субтитров `/media/subtitles/<uuid>.vtt` (проходит существующий check `subtitles.url`). Route Handler читает файл клиентом смотрящего; политика `storage.objects` пропускает чтение, только если строка `subtitles` с этим адресом видна читающему (RLS `subtitles`/`episodes`/`anime_hidden`). Файл уходит в `saveSubtitle` вместе с формой (`FormData`). Сводка — `count`-запросы от имени администратора.

**Tech Stack:** Next.js 16.4 (Route Handler, Server Actions), Supabase Storage + RLS, Vitest, Playwright (мок `tests/mock-supabase`).

**Spec:** `docs/superpowers/specs/2026-11-14-admin-uploads-design.md`

## Global Constraints

- Бакет `subtitles`: `public = false`, `file_size_limit = 524288` (512 КБ), MIME `text/vtt`, `text/plain`.
- Имя объекта — `<crypto.randomUUID()>.vtt`, без папок. Адрес в `subtitles.url` — `/media/subtitles/<имя>`.
- Файл валиден, если после необязательного BOM (`EF BB BF`) начинается с `WEBVTT` и далее пробел, таб, `\n`, `\r` или конец; не пустой; ≤ 524288 байт; декодируется как UTF-8 (`TextDecoder("utf-8", { fatal: true })`).
- Ответ файла: `Content-Type: text/vtt; charset=utf-8`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`; «нет» и «нельзя» — одинаковый 404.
- Чтение файлов — никогда служебным ключом. Запись — сессией администратора, право в политике `(select private.is_admin())`.
- Миграция без `DROP`. Время (`Date.now()`) — только после `requireAdmin()`.
- Тексты ошибок формы: «Выберите файл субтитров», «Файл субтитров — не больше 512 КБ», «Это не файл WebVTT: первая строка должна быть WEBVTT», «Файл субтитров не загрузился — попробуйте ещё раз».
- Видео остаётся по ссылке; загрузка видео — этап 8 (ADR-030).

## Review Focus

1. Тайтл скрыт после того, как субтитры уже были открыты, — следующий запрос файла сразу 404 (никакого кэша). Тест: rls:check «после скрытия тайтла гость не читает файл» + E2E 404 для скрытого.
2. Строка сохранена с новым файлом вместо старого — старый объект удалён из бакета. Тест: E2E «замена файла» проверяет 404 по старому адресу у администратора.
3. Ошибка вставки (дубль языка, `23505`) после загрузки — загруженный объект удалён. Тест: E2E «дубль языка не оставляет файл» (мок считает объекты бакета: `GET /__mock/storage-count`).
4. Имя в адресе с `..`, `/`, `%2F` или не-uuid — 404 без запроса в Storage. Тест: unit `parseSubtitleObjectName`.
5. Файл в UTF-16 или с `WEBVTTX` в первой строке — отклонён. Тест: unit `checkVttFile`.

---

### Task 1: Миграция — бакет `subtitles` и политики

**Files:**
- Create: `supabase/migrations/20261114134317_subtitles_storage.sql` (версия совпадает с базой; первоначально 20261114170000 — переименован, Ошибка 31)
- Modify: `scripts/rls-check.mjs` — блок «Субтитры в Storage» перед «итог по данным»

**Interfaces:**
- Produces: бакет `subtitles`; политики `storage.objects`: `subtitles readable with visible row` (select, `anon, authenticated`: `bucket_id = 'subtitles' and exists (select 1 from public.subtitles s where s.url = '/media/subtitles/' || name)`), `subtitles readable by admin` (select, authenticated, `(select private.is_admin())`), `subtitles insert by admin`, `subtitles delete by admin`; индекс `subtitles_url_idx on public.subtitles (url)`.

- [ ] **Step 1:** Прочитать skills `anime-database`, `supabase:supabase-postgres-best-practices`, заметки Obsidian `Storage · avatars`, `Таблица · subtitles`.
- [ ] **Step 2:** Написать миграцию по образцу `20261101190000_avatars_storage.sql` (insert в `storage.buckets … on conflict do update`), политики выше. Update-политики нет.
- [ ] **Step 3:** Блок rls-check (сначала, до применения миграции — он должен упасть): админ загружает `<uuid>.vtt` и создаёт строку у опубликованной серии `PROBE_ANIME_ID` → гость и пользователь скачивают (`storage.from("subtitles").download`); файл черновика — гость, пользователь, модератор получают ошибку, админ скачивает; после `hide` тайтла — гость не скачивает, после `show` — снова скачивает; файл без строки — читает только админ; пользователь и модератор не загружают и не удаляют; публичная ссылка (`/object/public/subtitles/…`) — 400/404; загрузка 600 КБ и `image/png` отклоняются бакетом; уборка объектов в `finally`. Ожидаемое число проверок обновить в DEVELOPMENT.md.
- [ ] **Step 4:** Спросить разрешение на применение миграции к удалённому Supabase; после «ок» применить, затем `npm run rls:check` — все зелёные; типы `generate_typescript_types` сверить с `src/types/database.ts` (Storage в типы не входит — изменений не ждём); советники security и performance — без новых замечаний.
- [ ] **Step 5:** Коммит `feat(db): закрытый бакет subtitles и политики чтения по видимости серии`.

### Task 2: Модель файла субтитров (TDD)

**Files:**
- Create: `src/features/admin/subtitle-file.ts`
- Test: `tests/unit/subtitle-file.test.ts`

**Interfaces:**
- Produces:
  - `SUBTITLE_BUCKET = "subtitles"`, `SUBTITLE_PREFIX = "/media/subtitles/"`, `MAX_SUBTITLE_BYTES = 524288`
  - `checkVttFile(bytes: Uint8Array): { ok: true; text: string } | { ok: false; message: string }`
  - `newSubtitleObjectName(): string` → `${randomUUID()}.vtt`
  - `subtitleUrl(name: string): string` → `SUBTITLE_PREFIX + name`
  - `parseSubtitleObjectName(raw: string): string | null` — только `^[0-9a-f-]{36}\.vtt$` (нижний регистр, uuid v4-формат), иначе null
  - `storedObjectName(url: string | null): string | null` — имя объекта, если адрес — наш бакет, иначе null

- [ ] **Step 1: Тесты**

```ts
it("принимает WEBVTT с BOM и без", () => {
  expect(checkVttFile(enc("WEBVTT\n\n00:00.000 --> 00:01.000\nПривет")).ok).toBe(true);
  expect(checkVttFile(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("WEBVTT - title\n")])).ok).toBe(true);
});
it("отклоняет пустой, WEBVTTX, UTF-16, больше 512 КБ", () => {
  expect(checkVttFile(new Uint8Array())).toEqual({ ok: false, message: "Выберите файл субтитров" });
  expect(checkVttFile(enc("WEBVTTX\n"))).toEqual({ ok: false, message: "Это не файл WebVTT: первая строка должна быть WEBVTT" });
  expect(checkVttFile(new Uint8Array([0xff, 0xfe, 0x57, 0x00])).ok).toBe(false);
  expect(checkVttFile(new Uint8Array(524289).fill(0x41))).toEqual({ ok: false, message: "Файл субтитров — не больше 512 КБ" });
});
it("разбирает только наши имена", () => {
  const name = newSubtitleObjectName();
  expect(parseSubtitleObjectName(name)).toBe(name);
  for (const bad of ["../x.vtt", "a/b.vtt", "%2e%2e.vtt", "x.vtt", `${name}.m3u8`]) expect(parseSubtitleObjectName(bad)).toBeNull();
  expect(storedObjectName(subtitleUrl(name))).toBe(name);
  expect(storedObjectName("/media/test/ru.vtt")).toBeNull();
  expect(storedObjectName("https://example.com/a.vtt")).toBeNull();
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/subtitle-file.test.ts` — FAIL (модуля нет).
- [ ] **Step 3:** Реализовать (без `"use server"`, чистые функции; `randomUUID` из `node:crypto`).
- [ ] **Step 4:** Тот же запуск — PASS.
- [ ] **Step 5:** Коммит `feat(admin): проверка файла WebVTT и имена объектов бакета subtitles`.

### Task 3: Route Handler `/media/subtitles/[file]`

**Files:**
- Create: `src/app/media/subtitles/[file]/route.ts`
- Modify: `tests/mock-supabase/server.mjs` — бакет `subtitles` (см. Task 4, делаются вместе для E2E)

**Interfaces:**
- Consumes: `parseSubtitleObjectName`, `subtitleUrl`, `SUBTITLE_BUCKET` (Task 2); `createClient` из `@/lib/supabase/server`.
- Produces: `GET(request, ctx: RouteContext<"/media/subtitles/[file]">)`.

- [ ] **Step 1:** Прочитать `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (params — Promise, `RouteContext`) и проверить, что в `public/media/` нет папки `subtitles` (статика перекрыла бы маршрут).
- [ ] **Step 2:** Реализовать: имя → `parseSubtitleObjectName`, null → 404; `supabase.storage.from(SUBTITLE_BUCKET).download(name)` клиентом смотрящего; ошибка → 404 (в лог — только код, не 400/404 от Storage); успех → `new Response(blob, { headers })` с заголовками из Global Constraints. `export const dynamic`/кэш не нужны: обработчик читает cookies.
- [ ] **Step 3:** Проверка — E2E в Task 5.

### Task 4: Загрузка в `saveSubtitle`, удаление файлов, мок Storage

**Files:**
- Modify: `src/features/admin/actions.ts` — `saveSubtitle`, `deleteSubtitle`, `deleteEpisode`
- Modify: `src/features/admin/components/episode-manager.tsx` — форма субтитров
- Modify: `tests/mock-supabase/server.mjs`

**Interfaces:**
- Consumes: Task 2.
- Produces: `saveSubtitle(rawAnimeId: unknown, rawEpisodeId: unknown, rawId: unknown, form: FormData): Promise<ActionResult>` — поля `lang`, `label`, `isDefault` (`"on"`), `source` (`"file"` | `"url"`), `file` (File), `url`. Остальные действия — сигнатуры прежние.

- [ ] **Step 1:** `saveSubtitle`: при `source = "file"` — `checkVttFile(new Uint8Array(await file.arrayBuffer()))` (до `adminClient()` проверить `file.size ≤ MAX_SUBTITLE_BYTES`, чтобы не читать лишнее), затем `parseSubtitleInput({ …, url: subtitleUrl(name) })`; загрузка `upload(name, text, { contentType: "text/vtt", upsert: false })`, ошибка → «Файл субтитров не загрузился — попробуйте ещё раз». При изменении строки — прочитать прежний `url` до `update`. Ошибка вставки/изменения → `remove([name])`. Успех и прежний `storedObjectName(oldUrl)` отличается от нового → `remove([old])`, сбой — `console.error` с кодом.
- [ ] **Step 2:** `deleteSubtitle`: `.delete().select("id, url")` → после успеха `remove` для `storedObjectName(url)`. `deleteEpisode`: до удаления прочитать `subtitles.url` серии, после успеха — `remove` для наших имён.
- [ ] **Step 3:** Форма: переключатель «Файл с компьютера» / «Адрес» (радиокнопки, `fieldset` + `legend`), `<input type="file" accept=".vtt,text/vtt">` с подсказкой «WebVTT (.vtt), до 512 КБ»; при правке строки с нашим файлом — показать «Загружен файл» и разрешить сохранить без нового файла (тогда `source = "keep"` → url прежний). Отправка — `FormData`, вложенный `startTransition` после `await` (Ошибка 40). 360 px без горизонтальной прокрутки.
- [ ] **Step 4:** Мок: бакет `subtitles` в `handleStorage` — `POST /storage/v1/object/subtitles/<name>` (только админ мока, ≤ 524288, иначе 413), `DELETE /storage/v1/object/subtitles` (только админ), `POST|GET /storage/v1/object/authenticated/subtitles/<name>` и `GET /storage/v1/object/subtitles/<name>` (download): пропускать, если админ или есть строка `subtitles` с этим url, видимая читающему (та же функция видимости, что у `GET subtitles`), иначе 400 `{"statusCode":"404","error":"not_found"}`; `GET /__mock/storage-count?bucket=subtitles` для тестов. Точный путь download в supabase-js сверить в `node_modules/@supabase/storage-js`.
- [ ] **Step 5:** `npm run typecheck && npm run lint` — зелёные. Коммит `feat(admin): загрузка субтитров с компьютера в закрытый бакет`.

### Task 5: E2E субтитров

**Files:**
- Create: `tests/e2e/admin-subtitles.spec.ts`, фикстура `tests/fixtures/subtitles/ru.vtt` (`WEBVTT` + одна реплика), `bad.vtt` (`Hello`)

- [ ] **Step 1:** Сценарии (свой тайтл мока, чтобы не мешать соседям; номер серии уникальный):
  - админ создаёт опубликованную серию, загружает `ru.vtt` → в плеере у гостя есть дорожка «Русские», `GET` её `src` — 200, `text/vtt`;
  - `bad.vtt` → сообщение «Это не файл WebVTT: первая строка должна быть WEBVTT», в бакете файлов не прибавилось;
  - дубль языка с файлом → «Субтитры на этом языке уже есть», число файлов не изменилось;
  - серия-черновик: гость и пользователь получают 404 по адресу файла, админ — 200;
  - тайтл скрыт → гость 404; возвращён → 200;
  - замена файла → старый адрес у админа 404; удаление субтитров → адрес 404 и число файлов уменьшилось.
- [ ] **Step 2:** `npx playwright test tests/e2e/admin-subtitles.spec.ts` три раза подряд — PASS.
- [ ] **Step 3:** Коммит `test(admin): E2E загрузки и закрытия субтитров`.

### Task 6: Сводка на `/admin`

**Files:**
- Create: `src/features/admin/stats.ts`, `src/features/admin/components/site-stats.tsx`
- Modify: `src/app/admin/page.tsx`, `tests/mock-supabase/server.mjs` (`Prefer: count=exact` + `HEAD`/`Content-Range`, если ещё нет)
- Test: `tests/unit/admin-stats.test.ts`, сценарий в `tests/e2e/admin.spec.ts`

**Interfaces:**
- Produces: `type SiteStats = { users: number | null; newUsers: number | null; published: number | null; drafts: number | null; hidden: number | null; openReports: number | null; activeBans: number | null; newComments: number | null }`; `getSiteStats(nowMs: number): Promise<SiteStats>`; `weekAgo(nowMs: number): string` (ISO, `nowMs − 7·24·3600·1000`); `statsFailed(stats: SiteStats): boolean`.

- [ ] **Step 1: Тесты** — `weekAgo(Date.parse("2026-11-14T12:00:00Z")) === "2026-11-07T12:00:00.000Z"`; `statsFailed` true, если хоть одно поле null.
- [ ] **Step 2:** FAIL → реализовать: 8 запросов `select("*", { count: "exact", head: true })` параллельно (`profiles`, `profiles.gte(created_at)`, `episodes.neq/eq(license_status,'none')`, `anime_hidden`, `comment_reports.eq(status,'open')`, `user_bans.is(revoked_at,null).or(expires_at.is.null,expires_at.gt.<now>)`, `comments.gte(created_at)`); ошибка запроса → null. → PASS.
- [ ] **Step 3:** `SiteStats` — `dl` сеткой `grid-cols-2 sm:grid-cols-4`, число крупно (`tabular-nums`), null → «—»; при `statsFailed` — `role="alert"` «Не удалось загрузить часть данных — обновите страницу» (одно сообщение на страницу вместе с существующим). Загрузка — существующий `Suspense` в `AdminShell`. `nowMs` берётся после `requireAdmin()`.
- [ ] **Step 4:** E2E в `admin.spec.ts`: администратор видит «Пользователи», «Открытые жалобы» с числами (не «—»). Коммит `feat(admin): сводка по сайту на главной админки`.

### Task 7: Документы, проверка, PR

**Files:**
- Modify: `ROADMAP.md` (6d), `ARCHITECTURE.md` (раздел субтитров, таблица Storage, ADR-030), `DEVELOPMENT.md` (E2E, rls:check — новое число, мок Storage)
- Obsidian (MCP): `ADR-030 · Субтитры в закрытом Storage, загрузка видео — этап 8`, `Storage · subtitles`, `Таблица · subtitles` (ссылка), Development Log, Dashboard, этап 6, заметка PR

- [ ] **Step 1:** ADR-030: контекст (нет своего видео, ADR-022, Free 1 ГБ), решение (вариант А с чтением клиентом смотрящего), альтернативы (signed URL, blob в браузере, служебный ключ), последствия (загрузка видео — этап 8 при выборе видеохостинга; сироты при сбое удаления читает только администратор; внешние `https://` субтитры открыты), проверка.
- [ ] **Step 2:** `npm run verify` — 6/6, показать итог; `npm run rls:check` — показать итог.
- [ ] **Step 3:** Коммит `docs: этап 6d — субтитры в Storage и сводка, ADR-030`; коммиты, push и PR — после разрешения пользователя на шаг 6d; заметка PR в Obsidian. Слияние — только по отдельному «ок».
