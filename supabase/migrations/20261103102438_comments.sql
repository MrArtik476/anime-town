-- Комментарии, жалобы, баны и действия модератора (этап 5 «Сообщество», ADR-025).
-- Комментарий публикуется сразу; модерация — по жалобам. Клиент (роль authenticated) может:
-- вставить комментарий, изменить только его текст и «удалить» его (мягко, триггером);
-- пожаловаться; модератор — только вставить строку в moderation_actions: триггер проверяет и
-- выполняет действие, так что журнал состоит из реально выполненных действий.
-- Флуд-лимит, баны, проверка ветки ответов — в базе, а не в памяти процесса.
-- Свои ошибки — коды PostgREST PTxxx: Data API отдаёт HTTP-статус xxx (429, 403, 422).
-- Триггерные функции и помощники RLS — в схеме private, которая не открыта в Data API.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- таблицы

create table public.comments (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  anilist_id integer not null check (anilist_id > 0),
  -- null — обсуждение тайтла, иначе — обсуждение серии.
  episode_id bigint references public.episodes (id) on delete cascade,
  -- Ответы в один уровень: parent_id — всегда корневой комментарий (проверяет триггер).
  parent_id bigint references public.comments (id) on delete cascade,
  reply_to_user_id uuid references public.profiles (id) on delete set null,
  body text,
  is_spoiler boolean not null default false,
  status text not null default 'visible' check (status in ('visible', 'hidden', 'deleted')),
  -- Число видимых ответов (у корня); ведёт триггер.
  reply_count integer not null default 0 check (reply_count >= 0),
  -- Снимок тайтла для уведомлений (ADR-020): берётся из комментария самого получателя.
  anime_title text check (char_length(anime_title) between 1 and 300),
  anime_cover_url text check (
    char_length(anime_cover_url) <= 500 and anime_cover_url ~ '^https://s4\.anilist\.co/file/anilistcdn/'
  ),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint comments_body_length check (body is null or char_length(btrim(body)) between 1 and 2000),
  -- У удалённого текста нет; у остальных он обязателен.
  constraint comments_deleted_has_no_body check ((status = 'deleted') = (body is null))
);

comment on table public.comments is
  'Комментарии к тайтлу (episode_id null) и к серии. Ответы в один уровень. Клиент меняет только body; удаление мягкое.';

-- Корни тайтла — keyset от новых к старым.
create index comments_title_roots_idx on public.comments (anilist_id, created_at desc, id desc)
  where parent_id is null and episode_id is null;
-- Корни серии (и внешний ключ episode_id).
create index comments_episode_idx on public.comments (episode_id, created_at desc, id desc);
-- Ответы ветки (и внешний ключ parent_id).
create index comments_parent_idx on public.comments (parent_id, created_at, id);
-- Флуд-лимит (и внешний ключ user_id).
create index comments_user_created_idx on public.comments (user_id, created_at desc);
create index comments_reply_to_user_idx on public.comments (reply_to_user_id);

create table public.comment_reports (
  id bigint generated always as identity primary key,
  comment_id bigint not null references public.comments (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'offensive', 'spoiler', 'other')),
  details text check (char_length(details) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- Одна жалоба на пару «пользователь — комментарий».
  constraint comment_reports_comment_reporter_key unique (comment_id, reporter_id)
);

comment on table public.comment_reports is
  'Жалобы на комментарии. Статус меняют только действия модератора (moderation_actions).';

create index comment_reports_reporter_idx on public.comment_reports (reporter_id);
create index comment_reports_resolved_by_idx on public.comment_reports (resolved_by);
create index comment_reports_open_idx on public.comment_reports (created_at) where status = 'open';

create table public.user_bans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  moderator_id uuid references public.profiles (id) on delete set null,
  reason text check (char_length(reason) between 1 and 500),
  -- null — навсегда.
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_bans_expires_after_created check (expires_at is null or expires_at > created_at)
);

comment on table public.user_bans is
  'Баны на комментарии и жалобы. Создаёт и снимает только триггер действий модератора.';

create index user_bans_user_expires_idx on public.user_bans (user_id, expires_at);
create index user_bans_moderator_idx on public.user_bans (moderator_id);
create index user_bans_revoked_by_idx on public.user_bans (revoked_by);

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  moderator_id uuid default auth.uid() references public.profiles (id) on delete set null,
  action text not null check (action in ('hide', 'restore', 'dismiss_reports', 'ban', 'unban')),
  comment_id bigint references public.comments (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  ban_duration text check (ban_duration in ('1d', '7d', '30d', 'forever')),
  reason text check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint moderation_actions_ban_duration check ((action = 'ban') = (ban_duration is not null))
);

comment on table public.moderation_actions is
  'Команды модератора и их журнал: вставка строки выполняет действие (триггер), иначе откатывается.';

create index moderation_actions_moderator_idx on public.moderation_actions (moderator_id);
create index moderation_actions_comment_idx on public.moderation_actions (comment_id);
create index moderation_actions_target_idx on public.moderation_actions (target_user_id);
create index moderation_actions_created_idx on public.moderation_actions (created_at desc);

-- ---------------------------------------------------------------- помощники RLS

-- security definer: читают profiles/user_bans независимо от RLS этих таблиц.
-- Без аргументов — проверяют только текущего пользователя. В политиках — только (select …()).
create function private.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('moderator', 'admin')
  );
$$;

create function private.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_bans
    where user_id = (select auth.uid())
      and revoked_at is null
      and (expires_at is null or expires_at > now())
  );
$$;

-- ---------------------------------------------------------------- триггеры comments

create function private.comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.comments%rowtype;
  per_minute integer;
  per_hour integer;
  ban_until timestamptz;
  ban_forever boolean;
begin
  -- Ветка: ответ — только на видимый корневой комментарий того же обсуждения.
  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if not found
      or parent.parent_id is not null
      or parent.status <> 'visible'
      or parent.anilist_id <> new.anilist_id
      or parent.episode_id is distinct from new.episode_id then
      raise exception using errcode = 'PT422', message = 'invalid_thread';
    end if;
    -- «@ник» — только автор корня или одного из ответов этой ветки.
    if new.reply_to_user_id is not null
      and new.reply_to_user_id <> parent.user_id
      and not exists (
        select 1 from public.comments
        where parent_id = new.parent_id and user_id = new.reply_to_user_id
      ) then
      raise exception using errcode = 'PT422', message = 'invalid_reply_to';
    end if;
  elsif new.reply_to_user_id is not null then
    raise exception using errcode = 'PT422', message = 'invalid_reply_to';
  end if;

  -- Бан: понятная ошибка с датой окончания (RLS — второй рубеж).
  select max(expires_at), bool_or(expires_at is null) into ban_until, ban_forever
  from public.user_bans
  where user_id = new.user_id and revoked_at is null and (expires_at is null or expires_at > now());
  if ban_forever or ban_until is not null then
    raise exception using
      errcode = 'PT403',
      message = 'banned',
      detail = case when ban_forever then 'forever' else to_json(ban_until)#>>'{}' end;
  end if;

  -- Флуд-лимит: 5 в минуту, 30 в час. Блокировка по пользователю — параллельные вставки
  -- считаются по очереди. Удалённые и скрытые тоже считаются.
  perform pg_advisory_xact_lock(hashtextextended('comments:' || new.user_id::text, 0));
  select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
    into per_minute, per_hour
  from public.comments
  where user_id = new.user_id and created_at > now() - interval '1 hour';
  if per_minute >= 5 or per_hour >= 30 then
    raise exception using errcode = 'PT429', message = 'rate_limited';
  end if;

  new.status := 'visible';
  new.reply_count := 0;
  new.edited_at := null;
  -- clock_timestamp, а не now(): лимит считает и вставки, ждавшие блокировку в другой транзакции.
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create trigger comments_before_insert
  before insert on public.comments
  for each row execute function private.comments_before_insert();

create function private.comments_before_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'visible' and new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger comments_before_update
  before update on public.comments
  for each row execute function private.comments_before_update();

-- Мягкое удаление: DELETE автора превращается в status = 'deleted' без текста.
-- Каскад (удалили серию, профиль или корень) идёт глубже первого уровня и удаляет строку.
create function private.comments_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  update public.comments
    set status = 'deleted', body = null, is_spoiler = false
    where id = old.id;
  return null;
end;
$$;

create trigger comments_before_delete
  before delete on public.comments
  for each row execute function private.comments_before_delete();

-- reply_count корня — число видимых ответов.
create function private.comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta integer := 0;
begin
  if new.parent_id is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    delta := case when new.status = 'visible' then 1 else 0 end;
  else
    delta := (case when new.status = 'visible' then 1 else 0 end) - (case when old.status = 'visible' then 1 else 0 end);
  end if;
  if delta <> 0 then
    update public.comments set reply_count = greatest(reply_count + delta, 0) where id = new.parent_id;
  end if;
  return null;
end;
$$;

create trigger comments_after_change
  after insert or update of status on public.comments
  for each row execute function private.comments_after_change();

-- ---------------------------------------------------------------- триггер comment_reports

create function private.comment_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.comments
    where id = new.comment_id and status = 'visible' and user_id <> new.reporter_id
  ) then
    raise exception using errcode = 'PT422', message = 'invalid_report';
  end if;
  new.status := 'open';
  new.resolved_by := null;
  new.resolved_at := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger comment_reports_before_insert
  before insert on public.comment_reports
  for each row execute function private.comment_reports_before_insert();

-- ---------------------------------------------------------------- действия модератора

create function private.moderation_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target public.comments%rowtype;
  target_role text;
  changed integer;
begin
  -- RLS проверит роль после триггера; здесь — раньше, чтобы эффект не выполнялся даже временно.
  if me is null or not private.is_moderator() then
    raise exception using errcode = '42501', message = 'not_moderator';
  end if;
  new.moderator_id := me;
  new.created_at := now();

  if new.action in ('hide', 'restore', 'dismiss_reports') then
    select * into target from public.comments where id = new.comment_id for update;
    if not found then
      raise exception using errcode = 'PT422', message = 'comment_not_found';
    end if;
    new.target_user_id := target.user_id;
  end if;

  case new.action
    when 'hide' then
      if target.status <> 'visible' then
        raise exception using errcode = 'PT422', message = 'not_visible';
      end if;
      update public.comments set status = 'hidden' where id = target.id;
      update public.comment_reports
        set status = 'resolved', resolved_by = me, resolved_at = now()
        where comment_id = target.id and status = 'open';
    when 'restore' then
      if target.status <> 'hidden' then
        raise exception using errcode = 'PT422', message = 'not_hidden';
      end if;
      update public.comments set status = 'visible' where id = target.id;
    when 'dismiss_reports' then
      update public.comment_reports
        set status = 'dismissed', resolved_by = me, resolved_at = now()
        where comment_id = target.id and status = 'open';
      get diagnostics changed = row_count;
      if changed = 0 then
        raise exception using errcode = 'PT422', message = 'no_open_reports';
      end if;
    when 'ban' then
      select role into target_role from public.profiles where id = new.target_user_id;
      if target_role is distinct from 'user' or new.target_user_id = me then
        raise exception using errcode = 'PT422', message = 'invalid_ban_target';
      end if;
      insert into public.user_bans (user_id, moderator_id, reason, expires_at)
      values (
        new.target_user_id,
        me,
        new.reason,
        case new.ban_duration
          when '1d' then now() + interval '1 day'
          when '7d' then now() + interval '7 days'
          when '30d' then now() + interval '30 days'
          else null
        end
      );
    when 'unban' then
      update public.user_bans
        set revoked_at = now(), revoked_by = me
        where user_id = new.target_user_id
          and revoked_at is null
          and (expires_at is null or expires_at > now());
      get diagnostics changed = row_count;
      if changed = 0 then
        raise exception using errcode = 'PT422', message = 'no_active_ban';
      end if;
    else
      -- Триггер срабатывает раньше check-ограничений — неизвестное действие отклоняется здесь.
      raise exception using errcode = 'PT422', message = 'unknown_action';
  end case;
  return new;
end;
$$;

create trigger moderation_actions_apply
  before insert on public.moderation_actions
  for each row execute function private.moderation_apply();

-- ---------------------------------------------------------------- превью ответов

-- Первые per_root ответов каждого корня одним запросом. security invoker — RLS comments
-- действует как при обычном чтении (скрытые видит только модератор).
create function public.comment_reply_previews(root_ids bigint[], per_root integer default 3)
returns setof public.comments
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce(cardinality(root_ids), 0) > 20 or per_root not between 1 and 20 then
    raise exception using errcode = 'PT422', message = 'too_many_roots';
  end if;
  return query
    select c.*
    from unnest(root_ids) as r (id)
    cross join lateral (
      select x.*
      from public.comments x
      where x.parent_id = r.id and x.status <> 'deleted'
      order by x.created_at, x.id
      limit per_root
    ) c;
end;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.comments enable row level security;
alter table public.comment_reports enable row level security;
alter table public.user_bans enable row level security;
alter table public.moderation_actions enable row level security;

create policy "comments readable by guests unless hidden"
  on public.comments for select to anon
  using (status <> 'hidden');

create policy "comments readable unless hidden, moderators see all"
  on public.comments for select to authenticated
  using (status <> 'hidden' or (select private.is_moderator()));

create policy "comments insert own when not banned"
  on public.comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not (select private.is_banned())
    and (
      episode_id is null
      or exists (
        select 1 from public.episodes e
        where e.id = episode_id and e.anilist_id = comments.anilist_id
      )
    )
  );

create policy "comments update own visible"
  on public.comments for update to authenticated
  using (user_id = (select auth.uid()) and status = 'visible')
  with check (user_id = (select auth.uid()));

create policy "comments delete own visible"
  on public.comments for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'visible');

create policy "comment_reports insert own when not banned"
  on public.comment_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and not (select private.is_banned()));

create policy "comment_reports select own or moderator"
  on public.comment_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_moderator()));

create policy "user_bans select own or moderator"
  on public.user_bans for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_moderator()));

create policy "moderation_actions insert by moderator"
  on public.moderation_actions for insert to authenticated
  with check (moderator_id = (select auth.uid()) and (select private.is_moderator()));

create policy "moderation_actions select by moderator"
  on public.moderation_actions for select to authenticated
  using ((select private.is_moderator()));

-- ---------------------------------------------------------------- права

revoke all on table public.comments, public.comment_reports, public.user_bans, public.moderation_actions
  from anon, authenticated, service_role;

grant select on table public.comments to anon, authenticated;
grant insert (anilist_id, episode_id, parent_id, reply_to_user_id, body, is_spoiler, anime_title, anime_cover_url)
  on table public.comments to authenticated;
grant update (body) on table public.comments to authenticated;
grant delete on table public.comments to authenticated;

grant select on table public.comment_reports to authenticated;
grant insert (comment_id, reason, details) on table public.comment_reports to authenticated;

grant select on table public.user_bans to authenticated;

grant select on table public.moderation_actions to authenticated;
grant insert (action, comment_id, target_user_id, ban_duration, reason) on table public.moderation_actions to authenticated;

grant select, insert, update, delete on table
  public.comments, public.comment_reports, public.user_bans, public.moderation_actions
  to service_role;

-- Функции: триггерные — никому; помощники RLS — только authenticated; превью — всем.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_moderator(), private.is_banned() to authenticated;
revoke execute on function public.comment_reply_previews(bigint[], integer) from public;
grant execute on function public.comment_reply_previews(bigint[], integer) to anon, authenticated;
