---
name: anime-database
description: Use when creating or changing the Anime Town Postgres/Supabase schema — tables, columns, migrations, RLS policies, indexes, triggers, functions, seed data, or regenerating TypeScript database types.
---

# Anime Database

Перед любой работой загрузи `supabase:supabase-postgres-best-practices` и `supabase:supabase`. Перед изменением — посмотри текущую схему (`list_tables` через Supabase MCP или файлы `supabase/migrations/`).

## Правила
- Схема меняется **только** миграциями: `supabase/migrations/<timestamp>_<name>.sql`. Никаких правок через Dashboard без последующей миграции.
- Миграции на продакшен-проект — только после подтверждения пользователя. Сначала локально (`supabase start`) или на ветке Supabase.
- Каждая таблица в схеме `public` — `enable row level security` в той же миграции, сразу с политиками.
- Внешние ключи индексируются. `timestamptz` для времени, `uuid` для пользовательских ключей, `bigint generated always as identity` для внутренних.
- После миграции: `npm run db:types` → `src/types/database.ts`, затем `get_advisors` (security + performance) и исправить замечания.

## Базовая схема
```sql
-- профили
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 32),
  avatar_url text,
  role text not null default 'user' check (role in ('user','moderator','admin')),
  created_at timestamptz not null default now()
);
```
Остальные таблицы (см. ARCHITECTURE.md §3): `anime`, `genres`, `anime_genres`, `seasons`, `episodes` (с `license_status`), `subtitles`, `favorites`, `watch_progress`, `ratings` (`score smallint check (score between 1 and 10)`), `comments` (`parent_id`, `deleted_at`), `notifications`.

## Шаблоны RLS
```sql
-- публичное чтение каталога
create policy "anime readable by all" on public.anime for select using (true);
-- собственные строки пользователя
create policy "own rows" on public.favorites
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- админ
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') $$;
```
`(select auth.uid())` — в подзапросе, чтобы вычислялось один раз на запрос.

## Производительность
- Каталог: индексы по фильтрам, GIN для `search_vector`, `pg_trgm` для названий.
- `watch_progress`: индекс `(user_id, updated_at desc)` для «продолжить просмотр».
- Агрегаты рейтинга — материализуются в `anime.user_score` триггером или по расписанию, не считаются на каждый запрос.

## Документация
Изменения схемы → `Anime Town/06 - База данных/` (ER-описание, список миграций) + `[[Development Log]]`.
