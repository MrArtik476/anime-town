-- Тайтлы в админ-панели (этап 6c, ADR-029): ручные русские название и описание, скрытие тайтла с сайта.
-- Ручной текст хранится рядом с автоматическим (отдельные колонки): импорт Shikimori и машинный перевод
-- их не пишут, поэтому затереть не могут. Все изменения — вставкой в журнал title_actions: эффект применяет
-- триггер (как admin_actions, ADR-027). Миграция только добавляет и уточняет политики — без DROP.

-- ---------------------------------------------------------------- ручной текст

alter table public.anime_localizations
  add column manual_title_ru text
    check (char_length(manual_title_ru) between 1 and 300 and manual_title_ru = btrim(manual_title_ru)),
  add column manual_description_ru text
    check (char_length(manual_description_ru) between 1 and 5000 and manual_description_ru = btrim(manual_description_ru));

comment on column public.anime_localizations.manual_title_ru is
  'Русское название, заданное администратором: важнее title_ru. null — показывается автоматическое.';
comment on column public.anime_localizations.manual_description_ru is
  'Русское описание, заданное администратором: важнее description_ru. null — показывается автоматическое.';

-- Служебной роли нужно удаление: строки проверочных тайтлов убирает npm run rls:check.
grant delete on table public.anime_localizations to service_role;

-- Список «изменённые вручную» в админке — только такие строки.
create index anime_localizations_manual_idx on public.anime_localizations (updated_at desc)
  where manual_title_ru is not null or manual_description_ru is not null;

-- ---------------------------------------------------------------- скрытые тайтлы

create table public.anime_hidden (
  anilist_id integer primary key check (anilist_id > 0),
  -- Снимок названия на момент скрытия: список в админке читается без запросов к AniList.
  title text check (char_length(title) between 1 and 300),
  created_at timestamptz not null default now()
);

comment on table public.anime_hidden is
  'Тайтлы AniList, скрытые с сайта администратором. Читают все (каталог фильтруется на сервере), пишет только триггер title_actions.';

alter table public.anime_hidden enable row level security;

create policy "anime_hidden readable by everyone"
  on public.anime_hidden for select to anon, authenticated
  using (true);

revoke all on table public.anime_hidden from public, anon, authenticated, service_role;
grant select on table public.anime_hidden to anon, authenticated;
grant select, insert, delete on table public.anime_hidden to service_role;

-- ---------------------------------------------------------------- журнал и команды

create table public.title_actions (
  id bigint generated always as identity primary key,
  admin_id uuid default auth.uid() references public.profiles (id) on delete set null,
  action text not null check (action in ('set_text', 'hide', 'show')),
  anilist_id integer not null check (anilist_id > 0),
  -- Снимок названия тайтла с сервера (как в anime_list): журнал читается без запросов к AniList.
  anime_title text check (char_length(anime_title) between 1 and 300),
  -- set_text: новые значения ручных полей (null — вернуть автоматическое) и прежние — заполняет триггер.
  title_ru text,
  description_ru text,
  old_title_ru text,
  old_description_ru text,
  -- hide: причина, по желанию.
  reason text check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

comment on table public.title_actions is
  'Команды администратора над тайтлами и их журнал: вставка строки выполняет действие (триггер), иначе откатывается.';

create index title_actions_admin_idx on public.title_actions (admin_id);
create index title_actions_anilist_idx on public.title_actions (anilist_id, created_at desc);
create index title_actions_created_idx on public.title_actions (created_at desc);

create function private.title_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  current_title text;
  current_description text;
  changed integer;
begin
  -- RLS проверит роль после триггера; здесь — раньше, чтобы эффект не выполнялся даже временно.
  if me is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'not_admin';
  end if;
  new.admin_id := me;
  new.created_at := now();
  if new.anilist_id is null or new.anilist_id <= 0 then
    raise exception using errcode = 'PT422', message = 'invalid_title';
  end if;
  new.anime_title := nullif(btrim(left(new.anime_title, 300)), '');

  case new.action
    when 'set_text' then
      -- Пробелы по краям убираются, пустая строка — «вернуть автоматическое».
      new.title_ru := nullif(btrim(new.title_ru), '');
      new.description_ru := nullif(btrim(new.description_ru), '');
      new.reason := null;
      if char_length(new.title_ru) > 300 or char_length(new.description_ru) > 5000 then
        raise exception using errcode = 'PT422', message = 'text_too_long';
      end if;
      select manual_title_ru, manual_description_ru into current_title, current_description
        from public.anime_localizations where anilist_id = new.anilist_id for update;
      if current_title is not distinct from new.title_ru
         and current_description is not distinct from new.description_ru then
        raise exception using errcode = 'PT422', message = 'text_unchanged';
      end if;
      new.old_title_ru := current_title;
      new.old_description_ru := current_description;
      -- Строки перевода может ещё не быть (тайтл без MAL id) — создаётся с одними ручными полями.
      insert into public.anime_localizations (anilist_id, manual_title_ru, manual_description_ru)
      values (new.anilist_id, new.title_ru, new.description_ru)
      on conflict (anilist_id) do update
        set manual_title_ru = excluded.manual_title_ru,
            manual_description_ru = excluded.manual_description_ru;
    when 'hide' then
      new.title_ru := null;
      new.description_ru := null;
      insert into public.anime_hidden (anilist_id, title) values (new.anilist_id, new.anime_title) on conflict do nothing;
      get diagnostics changed = row_count;
      if changed = 0 then
        raise exception using errcode = 'PT422', message = 'already_hidden';
      end if;
    when 'show' then
      new.title_ru := null;
      new.description_ru := null;
      new.reason := null;
      delete from public.anime_hidden where anilist_id = new.anilist_id;
      get diagnostics changed = row_count;
      if changed = 0 then
        raise exception using errcode = 'PT422', message = 'not_hidden';
      end if;
    else
      -- Триггер срабатывает раньше check-ограничений — неизвестное действие отклоняется здесь.
      raise exception using errcode = 'PT422', message = 'unknown_action';
  end case;
  return new;
end;
$$;

create trigger title_actions_apply
  before insert on public.title_actions
  for each row execute function private.title_apply();

alter table public.title_actions enable row level security;

create policy "title_actions insert by admin"
  on public.title_actions for insert to authenticated
  with check (admin_id = (select auth.uid()) and (select private.is_admin()));

create policy "title_actions select by admin"
  on public.title_actions for select to authenticated
  using ((select private.is_admin()));

revoke all on table public.title_actions from public, anon, authenticated, service_role;
grant select on table public.title_actions to authenticated;
grant insert (action, anilist_id, anime_title, title_ru, description_ru, reason) on table public.title_actions to authenticated;
grant select, insert, update, delete on table public.title_actions to service_role;

revoke execute on function private.title_apply() from public, anon, authenticated;

-- ---------------------------------------------------------------- серии скрытого тайтла

-- Серии и субтитры скрытого тайтла читает только администратор. Политика субтитров ссылается на episodes,
-- а к вложенному запросу RLS применяется от имени читающего — отдельно менять её не нужно.
alter policy "episodes with rights readable by everyone" on public.episodes
  using (
    license_status <> 'none'
    and not exists (select 1 from public.anime_hidden h where h.anilist_id = episodes.anilist_id)
  );

alter policy "episodes readable by authenticated" on public.episodes
  using (
    (select private.is_admin())
    or (
      license_status <> 'none'
      and not exists (select 1 from public.anime_hidden h where h.anilist_id = episodes.anilist_id)
    )
  );

-- Политики субтитров проверяли license_status сами — добавляем то же условие «тайтл не скрыт».
alter policy "subtitles of visible episodes readable by everyone" on public.subtitles
  using (
    exists (
      select 1 from public.episodes e
      where e.id = episode_id
        and e.license_status <> 'none'
        and not exists (select 1 from public.anime_hidden h where h.anilist_id = e.anilist_id)
    )
  );

alter policy "subtitles readable by authenticated" on public.subtitles
  using (
    (select private.is_admin())
    or exists (
      select 1 from public.episodes e
      where e.id = episode_id
        and e.license_status <> 'none'
        and not exists (select 1 from public.anime_hidden h where h.anilist_id = e.anilist_id)
    )
  );

-- ---------------------------------------------------------------- уведомления

-- «Вышла серия» по скрытому тайтлу не создаётся: ссылка вела бы на «не найдено».
-- Тело прежнее (миграция notifications), добавлено одно условие. Права на функцию сохраняются.
create or replace function private.notify_new_episodes(anime_ids integer[], numbers integer[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, anilist_id, episode_number, title, cover_url)
  select
    l.user_id,
    'new_episode',
    e.anilist_id,
    e.number,
    l.title,
    -- Обложка из anime_list проверяется только на https:// — чужой домен записывается как null.
    case
      when char_length(l.cover_url) <= 500 and l.cover_url ~ '^https://s4\.anilist\.co/file/anilistcdn/'
        then l.cover_url
    end
  from (
    select x.anilist_id, max(x.number) as number
    from unnest(anime_ids, numbers) as x (anilist_id, number)
    where x.anilist_id is not null and x.number is not null
    group by x.anilist_id
  ) e
  join public.anime_list l on l.anilist_id = e.anilist_id
  where l.status in ('watching', 'planned')
    and private.notify_enabled(l.user_id, 'new_episode')
    and not exists (select 1 from public.anime_hidden h where h.anilist_id = e.anilist_id)
  on conflict (user_id, anilist_id) where type = 'new_episode' and read_at is null
  do update set
    episode_number = greatest(notifications.episode_number, excluded.episode_number),
    created_at = now();
end;
$$;
