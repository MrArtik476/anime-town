-- Исправления по ревью PR 5a-1 (ADR-025).
-- 1. reply_count корня уменьшается и при настоящем удалении ответа (каскад при удалении аккаунта),
--    а не только при смене статуса: иначе «Комментарий удалён» остаётся без ответов навсегда.
-- 2. Забаненный, который жалуется, получает PT403 с датой окончания, как при комментарии,
--    а не общий отказ RLS (42501).
-- 3. ban/unban с comment_id: автор комментария должен совпадать с целью бана (PT422).
-- 4. comment_reply_previews: per_root зажат в 1…20, null не снимает лимит.

create or replace function private.comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta integer := 0;
  root_id bigint;
begin
  if tg_op = 'DELETE' then
    root_id := old.parent_id;
    delta := case when old.status = 'visible' then -1 else 0 end;
  else
    root_id := new.parent_id;
    if tg_op = 'INSERT' then
      delta := case when new.status = 'visible' then 1 else 0 end;
    else
      delta := (case when new.status = 'visible' then 1 else 0 end) - (case when old.status = 'visible' then 1 else 0 end);
    end if;
  end if;
  -- Если корень удаляется в том же каскаде, update просто не найдёт строку.
  if root_id is not null and delta <> 0 then
    update public.comments set reply_count = greatest(reply_count + delta, 0) where id = root_id;
  end if;
  return null;
end;
$$;

-- Отдельный триггер на удаление (та же функция) — без drop существующего comments_after_change.
create trigger comments_after_delete
  after delete on public.comments
  for each row execute function private.comments_after_change();

create or replace function private.comment_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ban_until timestamptz;
  ban_forever boolean;
begin
  -- Бан: понятная ошибка с датой окончания (RLS — второй рубеж), как в comments_before_insert.
  select max(expires_at), bool_or(expires_at is null) into ban_until, ban_forever
  from public.user_bans
  where user_id = new.reporter_id and revoked_at is null and (expires_at is null or expires_at > now());
  if ban_forever or ban_until is not null then
    raise exception using
      errcode = 'PT403',
      message = 'banned',
      detail = case when ban_forever then 'forever' else to_json(ban_until)#>>'{}' end;
  end if;

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

create or replace function private.moderation_apply()
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

  -- ban/unban со ссылкой на комментарий: комментарий должен принадлежать тому, кого банят,
  -- иначе журнал связал бы бан с чужим комментарием.
  if new.action in ('ban', 'unban') and new.comment_id is not null and not exists (
    select 1 from public.comments where id = new.comment_id and user_id = new.target_user_id
  ) then
    raise exception using errcode = 'PT422', message = 'comment_not_by_target';
  end if;

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

-- per_root зажат в 1…20; null — значение по умолчанию (3), а не «без лимита».
create or replace function public.comment_reply_previews(root_ids bigint[], per_root integer default 3)
returns setof public.comments
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  per_root_limit integer := least(greatest(coalesce(per_root, 3), 1), 20);
begin
  if coalesce(cardinality(root_ids), 0) > 20 then
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
      limit per_root_limit
    ) c;
end;
$$;

revoke execute on function private.comments_after_change(), private.comment_reports_before_insert(), private.moderation_apply()
  from public, anon, authenticated;
