-- public.rls_auto_enable() — функция Supabase для триггера событий ensure_rls (включает RLS на каждой
-- новой таблице). Она security definer и по умолчанию доступна всем через /rest/v1/rpc — советник
-- предупреждает (anon/authenticated_security_definer_function_executable). Вызывать её клиенту незачем:
-- отзываем execute, саму функцию и триггер событий не трогаем. Триггеры событий срабатывают без
-- проверки execute, поэтому автовключение RLS продолжает работать — это проверяет блок ниже.
--
-- На чистой базе (локальный стек, новый проект) функции может не быть — тогда миграция ничего не делает.
-- Файл правился после применения (обёртка if): удалённая база файлы миграций не сверяет.

do $$
declare
  rls_on boolean;
begin
  if to_regprocedure('public.rls_auto_enable()') is null then
    raise notice 'public.rls_auto_enable() нет — revoke и проверка пропущены';
    return;
  end if;

  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

  -- Проверка: новая таблица в public получает RLS. Таблица создаётся во вложенном блоке и исчезает
  -- при его откате (без DROP); результат сохраняется в переменной — переменные откат не затрагивает.
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    raise notice 'ensure_rls нет — проверка пропущена';
    return;
  end if;
  begin
    create table public.rls_auto_enable_probe (id integer);
    select relrowsecurity into rls_on from pg_class where oid = 'public.rls_auto_enable_probe'::regclass;
    raise exception using errcode = 'P0001', message = 'rls_probe_rollback';
  exception
    when raise_exception then
      if sqlerrm <> 'rls_probe_rollback' then
        raise;
      end if;
  end;
  if rls_on is not true then
    raise exception 'ensure_rls не включил RLS на новой таблице public — проверьте rls_auto_enable()';
  end if;
end;
$$;
