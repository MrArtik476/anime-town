-- Уведомления (этап 5 «Сообщество», ADR-026): ответ на комментарий и новая серия тайтла из списка.
-- Создают уведомления только триггеры (security definer, схема private); клиент (authenticated)
-- может прочитать свои уведомления и отметить их прочитанными (только read_at), а также
-- прочитать и изменить свои настройки notification_prefs. Нет строки настроек — всё включено.
-- Снимок тайтла (title, cover_url) — как в anime_list (ADR-020): у ответа — из комментария самого
-- получателя в этой ветке, у новой серии — из строки anime_list получателя.
-- Новые серии: триггеры уровня оператора с таблицами переходов — пакетная запись серий даёт один
-- проход. Непрочитанное уведомление о сериях тайтла всегда одно (частичный уникальный индекс).

-- ---------------------------------------------------------------- таблицы

create table public.notifications (
  id bigint generated always as identity primary key,
  -- Получатель.
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('reply', 'new_episode')),
  anilist_id integer not null check (anilist_id > 0),
  -- reply — серия обсуждения (null — обсуждение тайтла); new_episode — последняя вышедшая серия.
  episode_number integer check (episode_number between 1 and 10000),
  -- Ответ, о котором уведомление (только reply).
  comment_id bigint references public.comments (id) on delete cascade,
  -- Кто ответил (только reply).
  actor_id uuid references public.profiles (id) on delete set null,
  -- Снимок тайтла; null — UI пишет «Аниме №{id}» и показывает заглушку обложки.
  title text check (char_length(title) between 1 and 300),
  cover_url text check (
    char_length(cover_url) <= 500 and cover_url ~ '^https://s4\.anilist\.co/file/anilistcdn/'
  ),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_reply_has_comment check ((type = 'reply') = (comment_id is not null))
);

comment on table public.notifications is
  'Уведомления: ответ на комментарий и новая серия. Создают только триггеры; клиент меняет только read_at.';

-- Список — keyset от новых к старым (и внешний ключ user_id).
create index notifications_user_created_idx on public.notifications (user_id, created_at desc, id desc);
-- Счётчик непрочитанных.
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
-- Склейка новых серий: одно непрочитанное уведомление на пару «получатель — тайтл».
create unique index notifications_new_episode_unread_key on public.notifications (user_id, anilist_id)
  where type = 'new_episode' and read_at is null;
-- Внешние ключи (каскад при удалении комментария, set null при удалении профиля).
create index notifications_comment_idx on public.notifications (comment_id);
create index notifications_actor_idx on public.notifications (actor_id);

create table public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  reply boolean not null default true,
  new_episode boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.notification_prefs is
  'Настройки уведомлений. Нет строки — всё включено. RLS: только своя строка.';

-- Получатели новой серии — по тайтлу среди «Смотрю» и «Хочу посмотреть»: первичный ключ
-- anime_list (user_id, anilist_id) поиск по одному anilist_id не покрывает.
create index anime_list_anilist_notify_idx on public.anime_list (anilist_id)
  where status in ('watching', 'planned');

-- ---------------------------------------------------------------- помощники

-- Включён ли вид уведомлений у пользователя. Нет строки настроек — включён.
create function private.notify_enabled(uid uuid, kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case kind when 'reply' then p.reply when 'new_episode' then p.new_episode end
      from public.notification_prefs p
      where p.user_id = uid
    ),
    true
  );
$$;

-- Общая часть обоих триггеров серий. На вход — пары «тайтл → максимальный номер» (вызывающий уже
-- свернул серии); на выходе — одна запись на (получатель, тайтл). Повторная группировка здесь —
-- страховка: on conflict do update не может обновить одну строку дважды в одном операторе.
create function private.notify_new_episodes(anime_ids integer[], numbers integer[])
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
  on conflict (user_id, anilist_id) where type = 'new_episode' and read_at is null
  do update set
    episode_number = greatest(notifications.episode_number, excluded.episode_number),
    created_at = now();
end;
$$;

-- ---------------------------------------------------------------- триггер comments

-- Ответ (insert с parent_id): уведомить автора корня и reply_to_user_id, без повторов и без
-- автора ответа. Скрытие или удаление ответа (смена статуса на hidden/deleted) убирает его
-- уведомления; возврат в visible их не создаёт заново. Настоящее удаление — каскадом по comment_id.
create function private.comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_author uuid;
  ep_number integer;
begin
  if tg_op = 'UPDATE' then
    if new.status in ('hidden', 'deleted') and old.status is distinct from new.status then
      delete from public.notifications where comment_id = new.id and type = 'reply';
    end if;
    return null;
  end if;

  if new.parent_id is null then
    return null;
  end if;

  select user_id into root_author from public.comments where id = new.parent_id;
  if new.episode_id is not null then
    select number into ep_number from public.episodes where id = new.episode_id;
  end if;

  -- Снимок — из последнего комментария получателя в ветке (корень или ответ корня):
  -- чужой снимок в чужое уведомление не попадает.
  insert into public.notifications (user_id, type, anilist_id, episode_number, comment_id, actor_id, title, cover_url)
  select
    r.uid,
    'reply',
    new.anilist_id,
    ep_number,
    new.id,
    new.user_id,
    s.anime_title,
    s.anime_cover_url
  from (
    select distinct u.uid
    from unnest(array[root_author, new.reply_to_user_id]) as u (uid)
    where u.uid is not null and u.uid <> new.user_id
  ) r
  left join lateral (
    select c.anime_title, c.anime_cover_url
    from public.comments c
    where c.user_id = r.uid and (c.id = new.parent_id or c.parent_id = new.parent_id)
    order by c.created_at desc, c.id desc
    limit 1
  ) s on true
  where private.notify_enabled(r.uid, 'reply');
  return null;
end;
$$;

create trigger comments_notify
  after insert or update of status on public.comments
  for each row execute function private.comments_notify();

-- ---------------------------------------------------------------- триггеры episodes

-- Два триггера и без списка колонок: Postgres не допускает таблицы переходов у триггера с
-- несколькими событиями или с update of …. Серии сворачиваются до (anilist_id, max(number)).
-- insert … on conflict do update попадает в update-триггер только обновлёнными строками.
create function private.episodes_notify_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids integer[];
  nums integer[];
begin
  select array_agg(s.anilist_id), array_agg(s.number) into ids, nums
  from (
    select n.anilist_id, max(n.number) as number
    from new_rows n
    where n.license_status <> 'none'
    group by n.anilist_id
  ) s;
  if ids is not null then
    perform private.notify_new_episodes(ids, nums);
  end if;
  return null;
end;
$$;

create trigger episodes_notify_insert
  after insert on public.episodes
  referencing new table as new_rows
  for each statement execute function private.episodes_notify_insert();

-- Серия стала видимой: была license_status = 'none', стала другой (связь строк по id).
create function private.episodes_notify_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids integer[];
  nums integer[];
begin
  select array_agg(s.anilist_id), array_agg(s.number) into ids, nums
  from (
    select n.anilist_id, max(n.number) as number
    from new_rows n
    join old_rows o on o.id = n.id
    where o.license_status = 'none' and n.license_status <> 'none'
    group by n.anilist_id
  ) s;
  if ids is not null then
    perform private.notify_new_episodes(ids, nums);
  end if;
  return null;
end;
$$;

create trigger episodes_notify_update
  after update on public.episodes
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.episodes_notify_update();

-- ---------------------------------------------------------------- триггер notification_prefs

create function private.notification_prefs_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notification_prefs_touch_updated_at
  before update on public.notification_prefs
  for each row execute function private.notification_prefs_touch_updated_at();

-- ---------------------------------------------------------------- RLS

alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;

create policy "notifications select own"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "notifications update own"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notification_prefs select own"
  on public.notification_prefs for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "notification_prefs insert own"
  on public.notification_prefs for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "notification_prefs update own"
  on public.notification_prefs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- права

revoke all on table public.notifications, public.notification_prefs from anon, authenticated, service_role;

-- insert и delete у authenticated нет: уведомления создают и убирают только триггеры.
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

grant select on table public.notification_prefs to authenticated;
grant insert (reply, new_episode) on table public.notification_prefs to authenticated;
grant update (reply, new_episode) on table public.notification_prefs to authenticated;

grant select, insert, update, delete on table public.notifications, public.notification_prefs to service_role;

-- Функции — никому: вызываются только триггерами. Поимённо, а не «all functions in schema
-- private»: иначе authenticated потерял бы execute на is_moderator()/is_banned() для политик.
revoke execute on function private.notify_enabled(uuid, text) from public, anon, authenticated;
revoke execute on function private.notify_new_episodes(integer[], integer[]) from public, anon, authenticated;
revoke execute on function private.comments_notify() from public, anon, authenticated;
revoke execute on function private.episodes_notify_insert() from public, anon, authenticated;
revoke execute on function private.episodes_notify_update() from public, anon, authenticated;
revoke execute on function private.notification_prefs_touch_updated_at() from public, anon, authenticated;
