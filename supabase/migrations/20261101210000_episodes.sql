-- Серии и субтитры (этап 4 «Просмотр»). Тайтл — id AniList (своей таблицы тайтлов пока нет).
-- Видео — только с правами: license_status = 'none' не показывается никому (ADR-004, ADR-022).
-- hls_url — адрес HLS-плейлиста: путь на сайте ('/media/…') или https://…; превращение в адрес
-- для плеера — в одном месте кода (src/features/player/source.ts), чтобы сменить источник на этапе 8.
-- Пишет только сервер (service role; админка — этап 6).

create table public.episodes (
  id bigint generated always as identity primary key,
  anilist_id integer not null check (anilist_id > 0),
  number integer not null check (number between 1 and 10000),
  title text check (char_length(title) between 1 and 300),
  duration_sec integer check (duration_sec > 0),
  license_status text not null default 'none'
    check (license_status in ('licensed', 'own', 'open_license', 'none')),
  hls_url text not null check (hls_url ~ '^(https://|/media/)' and hls_url ~ '\.m3u8(\?.*)?$'),
  -- Атрибуция для открытых лицензий (например, «Big Buck Bunny © Blender Foundation, CC BY 3.0»).
  attribution text check (char_length(attribution) <= 500),
  attribution_url text check (attribution_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episodes_anime_number_key unique (anilist_id, number),
  constraint episodes_open_license_attributed
    check (license_status <> 'open_license' or attribution is not null)
);

comment on table public.episodes is
  'Серии тайтлов AniList с HLS-плейлистом. Видно только при license_status <> none. Пишет только сервер.';

create table public.subtitles (
  id bigint generated always as identity primary key,
  episode_id bigint not null references public.episodes (id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  label text not null check (char_length(label) between 1 and 60),
  url text not null check (url ~ '^(https://|/media/)' and url ~ '\.vtt(\?.*)?$'),
  is_default boolean not null default false,
  constraint subtitles_episode_lang_key unique (episode_id, lang)
);

comment on table public.subtitles is 'Субтитры WebVTT к сериям. Видимы вместе с серией.';

-- Индекс внешнего ключа (каскад и выборка субтитров серии). Поиск серий тайтла покрывает unique (anilist_id, number).
create index subtitles_episode_id_idx on public.subtitles (episode_id);

create function public.episodes_touch_updated_at()
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

create trigger episodes_touch_updated_at
  before update on public.episodes
  for each row execute function public.episodes_touch_updated_at();

revoke execute on function public.episodes_touch_updated_at() from public, anon, authenticated;

-- RLS: чтение всем — только серии с правами; субтитры — только к таким сериям. Записи — только service role.
alter table public.episodes enable row level security;
alter table public.subtitles enable row level security;

create policy "episodes with rights readable by everyone"
  on public.episodes for select to anon, authenticated
  using (license_status <> 'none');

create policy "subtitles of visible episodes readable by everyone"
  on public.subtitles for select to anon, authenticated
  using (exists (select 1 from public.episodes e where e.id = episode_id and e.license_status <> 'none'));

revoke all on table public.episodes from anon, authenticated;
revoke all on table public.subtitles from anon, authenticated;
grant select on table public.episodes to anon, authenticated;
grant select on table public.subtitles to anon, authenticated;
revoke all on table public.episodes from service_role;
revoke all on table public.subtitles from service_role;
grant select, insert, update, delete on table public.episodes to service_role;
grant select, insert, update, delete on table public.subtitles to service_role;
