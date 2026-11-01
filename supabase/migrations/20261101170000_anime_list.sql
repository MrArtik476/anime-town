-- Личный список пользователя: статус просмотра («Хочу посмотреть», «Смотрю», …) и оценка 1–10 (этап 3).
-- Одна строка на пару «пользователь — тайтл AniList». Каждый видит и меняет только свои строки.
-- title и cover_url — снимок с сервера (из данных AniList) на момент добавления: список в профиле
-- показывается без запросов к AniList.

create table public.anime_list (
  user_id uuid not null references public.profiles (id) on delete cascade,
  anilist_id integer not null check (anilist_id > 0),
  status text check (status in ('planned', 'watching', 'completed', 'on_hold', 'dropped')),
  score smallint check (score between 1 and 10),
  title text not null check (char_length(title) between 1 and 300),
  cover_url text check (cover_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, anilist_id),
  -- Пустая строка (ни статуса, ни оценки) не хранится — такой тайтл просто удаляется из списка.
  constraint anime_list_has_status_or_score check (status is not null or score is not null)
);

comment on table public.anime_list is
  'Личный список: статус просмотра и оценка 1–10. RLS: только свои строки.';

-- Список в профиле — по пользователю, свежие сверху (первичный ключ покрывает поиск строки тайтла).
create index anime_list_user_updated_idx on public.anime_list (user_id, updated_at desc);

create function public.anime_list_touch_updated_at()
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

create trigger anime_list_touch_updated_at
  before update on public.anime_list
  for each row execute function public.anime_list_touch_updated_at();

revoke execute on function public.anime_list_touch_updated_at() from public, anon, authenticated;

-- RLS: все операции — только со своими строками.
alter table public.anime_list enable row level security;

create policy "anime_list select own"
  on public.anime_list for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "anime_list insert own"
  on public.anime_list for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "anime_list update own"
  on public.anime_list for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "anime_list delete own"
  on public.anime_list for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Права: гостю — ничего; вошедшему — только DML (RLS ограничивает строками).
revoke all on table public.anime_list from anon, authenticated;
grant select, insert, update, delete on table public.anime_list to authenticated;
revoke all on table public.anime_list from service_role;
grant select, insert, update, delete on table public.anime_list to service_role;
