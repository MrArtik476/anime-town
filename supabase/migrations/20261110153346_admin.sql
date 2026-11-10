-- Админ-панель (этап 6): администратор управляет сериями, субтитрами и ролями через Data API.
-- До этого писать в episodes/subtitles мог только service role. Право проверяет RLS (private.is_admin()),
-- смена роли — только вставкой в admin_actions (триггер применяет и журналирует, как moderation_actions).
-- Миграция только добавляет: существующие политики чтения сужаются до anon, для authenticated — новые.

-- ---------------------------------------------------------------- помощник RLS

-- security definer: читает profiles независимо от RLS. Без аргументов — только текущий пользователь.
-- В политиках — только (select private.is_admin()).
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------- серии и субтитры

-- Гость видит только серии с правами; вошедший — их же, а администратор — все (в том числе черновики none).
-- Одна политика на роль и действие — без «нескольких разрешающих политик».
alter policy "episodes with rights readable by everyone" on public.episodes to anon;
alter policy "subtitles of visible episodes readable by everyone" on public.subtitles to anon;

create policy "episodes readable by authenticated"
  on public.episodes for select to authenticated
  using (license_status <> 'none' or (select private.is_admin()));

create policy "subtitles readable by authenticated"
  on public.subtitles for select to authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.episodes e where e.id = episode_id and e.license_status <> 'none')
  );

create policy "episodes insert by admin"
  on public.episodes for insert to authenticated
  with check ((select private.is_admin()));

create policy "episodes update by admin"
  on public.episodes for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "episodes delete by admin"
  on public.episodes for delete to authenticated
  using ((select private.is_admin()));

create policy "subtitles insert by admin"
  on public.subtitles for insert to authenticated
  with check ((select private.is_admin()));

create policy "subtitles update by admin"
  on public.subtitles for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "subtitles delete by admin"
  on public.subtitles for delete to authenticated
  using ((select private.is_admin()));

-- Тайтл серии (anilist_id) и серия субтитров (episode_id) после создания не меняются.
grant insert (anilist_id, number, title, duration_sec, license_status, hls_url, attribution, attribution_url)
  on table public.episodes to authenticated;
grant update (number, title, duration_sec, license_status, hls_url, attribution, attribution_url)
  on table public.episodes to authenticated;
grant delete on table public.episodes to authenticated;

grant insert (episode_id, lang, label, url, is_default) on table public.subtitles to authenticated;
grant update (lang, label, url, is_default) on table public.subtitles to authenticated;
grant delete on table public.subtitles to authenticated;

-- ---------------------------------------------------------------- журнал и команды администратора

create table public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid default auth.uid() references public.profiles (id) on delete set null,
  action text not null check (action in ('set_role')),
  target_user_id uuid references public.profiles (id) on delete set null,
  old_role text check (old_role in ('user', 'moderator', 'admin')),
  new_role text check (new_role in ('user', 'moderator', 'admin')),
  created_at timestamptz not null default now(),
  constraint admin_actions_set_role check (action <> 'set_role' or new_role is not null)
);

comment on table public.admin_actions is
  'Команды администратора и их журнал: вставка строки выполняет действие (триггер), иначе откатывается.';

create index admin_actions_admin_idx on public.admin_actions (admin_id);
create index admin_actions_target_idx on public.admin_actions (target_user_id);
create index admin_actions_created_idx on public.admin_actions (created_at desc);

create function private.admin_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  current_role_name text;
begin
  -- RLS проверит роль после триггера; здесь — раньше, чтобы эффект не выполнялся даже временно.
  if me is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'not_admin';
  end if;
  new.admin_id := me;
  new.created_at := now();

  if new.action = 'set_role' then
    if new.target_user_id is null or new.new_role is null
       or new.new_role not in ('user', 'moderator', 'admin') then
      raise exception using errcode = 'PT422', message = 'invalid_role_change';
    end if;
    -- Свою роль менять нельзя: последний администратор не сможет случайно лишить сайт управления.
    if new.target_user_id = me then
      raise exception using errcode = 'PT422', message = 'own_role';
    end if;
    select role into current_role_name from public.profiles where id = new.target_user_id for update;
    if not found then
      raise exception using errcode = 'PT422', message = 'user_not_found';
    end if;
    if current_role_name = new.new_role then
      raise exception using errcode = 'PT422', message = 'role_unchanged';
    end if;
    new.old_role := current_role_name;
    update public.profiles set role = new.new_role where id = new.target_user_id;
  else
    -- Триггер срабатывает раньше check-ограничений — неизвестное действие отклоняется здесь.
    raise exception using errcode = 'PT422', message = 'unknown_action';
  end if;
  return new;
end;
$$;

create trigger admin_actions_apply
  before insert on public.admin_actions
  for each row execute function private.admin_apply();

alter table public.admin_actions enable row level security;

create policy "admin_actions insert by admin"
  on public.admin_actions for insert to authenticated
  with check (admin_id = (select auth.uid()) and (select private.is_admin()));

create policy "admin_actions select by admin"
  on public.admin_actions for select to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------- права

revoke all on table public.admin_actions from public, anon, authenticated, service_role;
grant select on table public.admin_actions to authenticated;
grant insert (action, target_user_id, new_role) on table public.admin_actions to authenticated;
grant select, insert, update, delete on table public.admin_actions to service_role;

revoke execute on function private.is_admin() from public, anon, authenticated;
revoke execute on function private.admin_apply() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
