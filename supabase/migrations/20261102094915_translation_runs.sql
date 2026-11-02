-- Журнал запусков фонового машинного перевода (ADR-024): строка на каждый запуск Edge Function translate-cron
-- (по расписанию pg_cron), `npm run translate` и `/api/cron/translate`.
-- Строка со status = 'running' — блокировка: уникальный частичный индекс не даёт начаться второму запуску,
-- пока идёт первый, поэтому символы DeepL дважды не тратятся. Читает и пишет только сервер (service role).

create table public.translation_runs (
  id bigint generated always as identity primary key,
  -- cron — pg_cron по расписанию; manual — ручной вызов функции, скрипт или Route Handler.
  trigger text not null check (trigger in ('cron', 'manual')),
  -- running — идёт; ok — дошёл до конца; stopped — штатная остановка (квота, бюджет запуска, сбой провайдера);
  -- failed — сбой настройки или базы; abandoned — не завершился за отведённое время (оборвался).
  status text not null default 'running' check (status in ('running', 'ok', 'stopped', 'failed', 'abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Счётчики отчёта runTranslationBackfill (null — запуск оборвался до отчёта).
  candidates integer check (candidates >= 0),
  pending integer check (pending >= 0),
  translated integer check (translated >= 0),
  characters integer check (characters >= 0),
  batches integer check (batches >= 0),
  skipped_oversized integer check (skipped_oversized >= 0),
  -- Причина остановки из отчёта: budget_exhausted, QUOTA_EXCEEDED, store_error…
  stopped text check (char_length(stopped) <= 64),
  -- Расход символов провайдера после запуска и свой месячный предел.
  usage_used integer check (usage_used >= 0),
  usage_limit integer check (usage_limit >= 0),
  own_limit integer check (own_limit >= 0),
  -- Сообщение исключения без текстов переводов и ключей.
  error text check (char_length(error) <= 500),
  constraint translation_runs_finished_when_done check ((status = 'running') = (finished_at is null))
);

comment on table public.translation_runs is
  'Журнал запусков фонового машинного перевода; running — блокировка от двойного запуска. Только service role.';

-- Не больше одного running одновременно.
create unique index translation_runs_one_running on public.translation_runs ((true)) where status = 'running';
-- Последние запуски — для наблюдения (DEVELOPMENT.md → «Машинный перевод»).
create index translation_runs_started_at_idx on public.translation_runs (started_at desc);

/**
 * Начать запуск: сначала оборвавшиеся running старше p_stale_after_seconds помечаются abandoned,
 * затем вставляется новая строка. null — уже идёт другой запуск (сработал уникальный индекс).
 */
create function public.begin_translation_run(p_trigger text, p_stale_after_seconds integer default 300)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run_id bigint;
begin
  update public.translation_runs
     set status = 'abandoned',
         finished_at = now(),
         error = coalesce(error, format('не завершился за %s с', p_stale_after_seconds))
   where status = 'running'
     and started_at < now() - make_interval(secs => p_stale_after_seconds);

  insert into public.translation_runs (trigger) values (p_trigger) returning id into run_id;
  return run_id;
exception
  when unique_violation then
    return null;
end;
$$;

-- RLS включён, политик нет: anon и authenticated не видят и не меняют журнал.
alter table public.translation_runs enable row level security;

-- Права по минимуму (автоматическое открытие таблиц в проекте выключено).
revoke all on table public.translation_runs from anon, authenticated;
revoke all on table public.translation_runs from service_role;
grant select, insert, update on table public.translation_runs to service_role;

revoke all on function public.begin_translation_run(text, integer) from public, anon, authenticated;
grant execute on function public.begin_translation_run(text, integer) to service_role;
