-- Субтитры в закрытом Supabase Storage (этап 6d, ADR-030).
-- Бакет не публичный: прямой ссылки на файл нет. Сайт отдаёт файл по адресу /media/subtitles/<имя>
-- (Route Handler) и читает его от имени смотрящего — служебный ключ для чтения не используется.
-- Чтение разрешено, только если читающему видна строка subtitles с этим адресом: её видимость уже задают
-- RLS subtitles и episodes (черновики, скрытые тайтлы — ADR-027, ADR-029). Миграция без DROP.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subtitles', 'subtitles', false, 524288, array['text/vtt', 'text/plain'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Политика чтения ищет строку по адресу — без индекса это проход по всей таблице на каждый запрос файла.
create index subtitles_url_idx on public.subtitles (url);

-- Вложенный запрос к public.subtitles выполняется с RLS читающего: гость и пользователь не видят строки
-- черновика и скрытого тайтла — и файл им не отдаётся.
create policy "subtitles readable by guests with visible row"
  on storage.objects for select to anon
  using (
    bucket_id = 'subtitles'
    and exists (select 1 from public.subtitles s where s.url = '/media/subtitles/' || objects.name)
  );

-- Вошедшим — то же; администратор читает все файлы бакета: удаление в Storage требует права чтения,
-- а файл удаляется уже после строки, когда условие по строке его не пропускает.
-- Одна разрешающая политика на роль и действие (как у episodes, ADR-027).
create policy "subtitles readable by authenticated"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'subtitles'
    and (
      (select private.is_admin())
      or exists (select 1 from public.subtitles s where s.url = '/media/subtitles/' || objects.name)
    )
  );

-- Имя файла всегда новое (uuid), поэтому перезаписи (update) нет.
create policy "subtitles insert by admin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'subtitles' and (select private.is_admin()));

create policy "subtitles delete by admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'subtitles' and (select private.is_admin()));
