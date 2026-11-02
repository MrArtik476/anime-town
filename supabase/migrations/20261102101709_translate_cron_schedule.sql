-- Расписание фонового машинного перевода в Supabase (ADR-024, заменяет GitHub Actions translate-cron.yml):
-- pg_cron раз в сутки в 03:17 UTC вызывает Edge Function translate-cron через pg_net.
-- Секрет заголовка x-cron-secret берётся из Vault при каждом вызове (в миграции его нет):
--   select vault.create_secret('<значение CRON_SECRET>', 'translate_cron_secret');
-- То же значение — в секрете функции CRON_SECRET (DEVELOPMENT.md → «Машинный перевод», смена секрета).
-- Без секрета в Vault заголовок пуст, функция отвечает 401 — это видно в net._http_response.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Повторное применение не создаёт второе задание: cron.schedule с тем же именем обновляет существующее.
select cron.schedule(
  'translate-cron',
  '17 3 * * *',
  $job$
  select net.http_post(
    url := 'https://bhzshfkhpumyojxuygsc.supabase.co/functions/v1/translate-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'translate_cron_secret'),
        ''
      )
    ),
    body := jsonb_build_object('trigger', 'cron'),
    -- Функция живёт до 150 с; ответ (код и тело) pg_net пишет в net._http_response.
    timeout_milliseconds := 150000
  );
  $job$
);
