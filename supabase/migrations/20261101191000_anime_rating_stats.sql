-- Средняя оценка зрителей Anime Town по тайтлу (этап 3).
-- Оценки лежат в anime_list и скрыты RLS (каждый видит только свои), поэтому сумма и число оценок
-- поддерживаются триггером в отдельной публичной таблице: среднее читается одним запросом по ключу,
-- без доступа к чужим строкам и без агрегатов на каждый показ страницы.

create table public.anime_rating_stats (
  anilist_id integer primary key check (anilist_id > 0),
  score_sum integer not null default 0 check (score_sum >= 0),
  score_count integer not null default 0 check (score_count >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.anime_rating_stats is
  'Сумма и число оценок 1–10 из anime_list по тайтлу. Пишет только триггер; читать могут все.';

-- Триггер — security definer: пользователь пишет только свою строку anime_list, а счётчик общий.
create function public.anime_list_update_rating_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.score is not null then
    update public.anime_rating_stats
      set score_sum = score_sum - old.score, score_count = score_count - 1, updated_at = now()
      where anilist_id = old.anilist_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.score is not null then
    insert into public.anime_rating_stats (anilist_id, score_sum, score_count)
      values (new.anilist_id, new.score, 1)
      on conflict (anilist_id) do update
        set score_sum = public.anime_rating_stats.score_sum + excluded.score_sum,
            score_count = public.anime_rating_stats.score_count + 1,
            updated_at = now();
  end if;
  return null;
end;
$$;

create trigger anime_list_rating_stats
  after insert or update of score, anilist_id or delete on public.anime_list
  for each row execute function public.anime_list_update_rating_stats();

revoke execute on function public.anime_list_update_rating_stats() from public, anon, authenticated;

-- RLS: чтение всем, записи только через триггер (политик на запись нет).
alter table public.anime_rating_stats enable row level security;

create policy "anime_rating_stats readable by everyone"
  on public.anime_rating_stats for select to anon, authenticated
  using (true);

revoke all on table public.anime_rating_stats from anon, authenticated;
grant select on table public.anime_rating_stats to anon, authenticated;
revoke all on table public.anime_rating_stats from service_role;
grant select, insert, update, delete on table public.anime_rating_stats to service_role;

-- Оценки, поставленные до миграции.
insert into public.anime_rating_stats (anilist_id, score_sum, score_count)
select anilist_id, sum(score), count(*)
from public.anime_list
where score is not null
group by anilist_id
on conflict (anilist_id) do nothing;
