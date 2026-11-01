-- Прогресс просмотра (этап 4): позиция в серии и «Продолжить просмотр».
-- Одна строка на пару «пользователь — серия»; пишет приложение (POST /api/progress) от имени пользователя.
-- completed вычисляется в базе: просмотрено ≥ 90 % серии.
-- anilist_id, episode_number, title, cover_url — снимок с сервера: блок «Продолжить просмотр» без запросов к AniList.

create table public.watch_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  episode_id bigint not null references public.episodes (id) on delete cascade,
  anilist_id integer not null check (anilist_id > 0),
  episode_number integer not null check (episode_number >= 1),
  position_sec double precision not null check (position_sec >= 0),
  duration_sec double precision not null check (duration_sec > 0),
  completed boolean generated always as (position_sec >= duration_sec * 0.9) stored,
  title text not null check (char_length(title) between 1 and 300),
  cover_url text check (cover_url ~ '^https://'),
  updated_at timestamptz not null default now(),
  primary key (user_id, episode_id),
  constraint watch_progress_position_within_duration check (position_sec <= duration_sec + 1)
);

comment on table public.watch_progress is
  'Позиция просмотра серий пользователем. RLS: только свои строки. completed — ≥ 90 % серии.';

-- «Продолжить просмотр» — последние изменения пользователя; индекс внешнего ключа на серию — для каскада.
create index watch_progress_user_updated_idx on public.watch_progress (user_id, updated_at desc);
create index watch_progress_episode_id_idx on public.watch_progress (episode_id);

create function public.watch_progress_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger watch_progress_touch_updated_at
  before update on public.watch_progress
  for each row execute function public.watch_progress_touch_updated_at();

revoke execute on function public.watch_progress_touch_updated_at() from public, anon, authenticated;

alter table public.watch_progress enable row level security;

create policy "watch_progress select own"
  on public.watch_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "watch_progress insert own"
  on public.watch_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "watch_progress update own"
  on public.watch_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "watch_progress delete own"
  on public.watch_progress for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.watch_progress from anon, authenticated;
grant select, insert, update, delete on table public.watch_progress to authenticated;
revoke all on table public.watch_progress from service_role;
grant select, insert, update, delete on table public.watch_progress to service_role;
