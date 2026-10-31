-- Русские названия и описания тайтлов AniList.
-- Источники: Shikimori (сопоставление по MAL id) и машинный перевод английского описания AniList.
-- Читать может кто угодно (каталог публичный), писать — только сервер (service role, мимо RLS).

create table public.anime_localizations (
  anilist_id integer primary key check (anilist_id > 0),
  mal_id integer check (mal_id > 0),
  title_ru text,
  synonyms_ru text[] not null default '{}',
  description_ru text,
  -- Источник description_ru; null — русского описания пока нет.
  source text check (source in ('shikimori', 'machine')),
  -- SHA-256 английского описания AniList, с которого сделан машинный перевод:
  -- AniList изменил текст → хеш не совпал → перевод устарел.
  source_hash text check (source_hash ~ '^[0-9a-f]{64}$'),
  -- Страница тайтла на Shikimori — для атрибуции «Описание: Shikimori».
  shikimori_url text check (shikimori_url ~ '^https://'),
  -- Когда строку последний раз сверяли с источниками (по нему решается, пора ли перепроверить).
  updated_at timestamptz not null default now(),
  constraint anime_localizations_source_matches_description
    check ((description_ru is null) = (source is null)),
  constraint anime_localizations_machine_has_hash
    check (source is distinct from 'machine' or source_hash is not null)
);

comment on table public.anime_localizations is
  'Русские названия и описания тайтлов AniList: Shikimori или машинный перевод. Пишет только сервер.';

create function public.anime_localizations_touch_updated_at()
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

create trigger anime_localizations_touch_updated_at
  before update on public.anime_localizations
  for each row execute function public.anime_localizations_touch_updated_at();

-- RLS: чтение всем, политик на запись нет — anon и authenticated писать не могут.
alter table public.anime_localizations enable row level security;

create policy "anime_localizations readable by everyone"
  on public.anime_localizations
  for select
  to anon, authenticated
  using (true);

-- Права. Автоматическое открытие таблиц в проекте выключено: выдаём явно и по минимуму.
-- Data API — только чтение; TRUNCATE/TRIGGER/REFERENCES из прав по умолчанию отзываются.
revoke all on table public.anime_localizations from anon, authenticated;
grant select on table public.anime_localizations to anon, authenticated;
revoke all on table public.anime_localizations from service_role;
grant select, insert, update on table public.anime_localizations to service_role;

revoke all on function public.anime_localizations_touch_updated_at() from public, anon, authenticated, service_role;
