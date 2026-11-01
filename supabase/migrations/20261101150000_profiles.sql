-- Профили пользователей Anime Town (этап 3 «Аккаунты»).
-- Строка создаётся триггером при регистрации в Supabase Auth и удаляется вместе с пользователем.
-- Профиль публичный (ник и аватар будут видны в комментариях); роль меняет только сервер (service role).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Латиница, кириллица, цифры и «_», 3–24 символа. Уникальность — без учёта регистра (индекс ниже).
  username text not null check (username ~ '^[A-Za-z0-9_А-Яа-яЁё]{3,24}$'),
  display_name text check (char_length(display_name) between 1 and 50),
  avatar_url text check (avatar_url ~ '^https://'),
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Публичные профили пользователей. Создаются триггером на auth.users; роль меняет только сервер.';

create unique index profiles_username_lower_key on public.profiles (lower(username));

-- updated_at при каждом изменении.
create function public.profiles_touch_updated_at()
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

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.profiles_touch_updated_at();

-- Профиль при регистрации. Ник берётся из raw_user_meta_data.username (его передаёт форма регистрации);
-- если он некорректен или занят — запасной user_<8 символов id>. Регистрация из-за ника не падает.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := new.raw_user_meta_data ->> 'username';
  fallback text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
begin
  if wanted is null or wanted !~ '^[A-Za-z0-9_А-Яа-яЁё]{3,24}$' then
    wanted := fallback;
  end if;

  begin
    insert into public.profiles (id, username) values (new.id, wanted);
  exception when unique_violation then
    insert into public.profiles (id, username) values (new.id, fallback);
  end;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Функции-триггеры не должны вызываться через Data API (/rpc).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.profiles_touch_updated_at() from public, anon, authenticated;

-- RLS: читать могут все; менять — только свою строку. Вставка — только триггер, удаление — каскадом.
alter table public.profiles enable row level security;

create policy "profiles readable by everyone"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "users update own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Права. Автоматическое открытие таблиц выключено: выдаём явно и по минимуму.
-- authenticated может менять только ник, имя и аватар — колонку role через Data API не изменить.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (username, display_name, avatar_url) on table public.profiles to authenticated;
revoke all on table public.profiles from service_role;
grant select, insert, update, delete on table public.profiles to service_role;

-- Пользователи, зарегистрированные до миграции (на 2026-11-01 их нет), получают профиль сразу.
insert into public.profiles (id, username)
select u.id, 'user_' || substr(replace(u.id::text, '-', ''), 1, 8)
from auth.users u
on conflict (id) do nothing;
