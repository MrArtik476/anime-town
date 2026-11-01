-- Аватары пользователей в Supabase Storage (этап 3).
-- Публичный бакет: картинку видят все по ссылке (ник и аватар публичны, как профиль).
-- Загружать, перезаписывать и удалять можно только файлы в своей папке: avatars/<user id>/…
-- Ограничения бакета: до 1 МБ, только JPEG, PNG, WebP (сервер проверяет то же самое заранее).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Перезапись (upsert) требует INSERT + SELECT + UPDATE; удаление — DELETE.
-- SELECT только своих файлов: список чужих аватаров через API не получить (публичная ссылка работает и без политики).
create policy "avatars insert own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars select own folder"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars update own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars delete own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
