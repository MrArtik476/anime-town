-- Исправления по ревью PR 5a-1 (ADR-025).
-- 1. reply_count корня уменьшается и при настоящем удалении ответа (каскад при удалении аккаунта),
--    а не только при смене статуса: иначе «Комментарий удалён» остаётся без ответов навсегда.
-- 2. Забаненный, который жалуется, получает PT403 с датой окончания, как при комментарии,
--    а не общий отказ RLS (42501).

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

drop trigger comments_after_change on public.comments;
create trigger comments_after_change
  after insert or update of status or delete on public.comments
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

revoke execute on function private.comments_after_change(), private.comment_reports_before_insert()
  from public, anon, authenticated;
