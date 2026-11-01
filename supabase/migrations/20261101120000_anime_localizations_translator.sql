-- Какой переводчик сделал машинный перевод (deepl, позже yandex и др.).
-- Нужен, чтобы в интерфейсе честно писать «Машинный перевод (DeepL)», даже после смены провайдера.

alter table public.anime_localizations
  add column translator text
    check (translator ~ '^[a-z][a-z0-9_-]{0,31}$');

comment on column public.anime_localizations.translator is
  'Провайдер машинного перевода (deepl, yandex…); null для описаний Shikimori.';

-- У машинного перевода провайдер обязателен; у описаний Shikimori и строк без описания — не задан.
-- Таблица на момент миграции не содержит машинных переводов, поэтому ограничение вводится сразу.
alter table public.anime_localizations
  add constraint anime_localizations_machine_has_translator
    check (case when source = 'machine' then translator is not null else translator is null end);
