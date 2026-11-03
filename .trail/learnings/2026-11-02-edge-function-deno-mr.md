---
title: "Edge Function для перевода собирается в один файл из общего кода, а не копируется на Deno"
author: Mr_Artik476
date: 2026-11-02
branch: feature/translate-edge-function
id: l-48d35534
scope: repo
status: active
src: agent
touches:
  - ".gitattributes"
  - ".githooks/pre-push"
  - ".github/workflows/translate-cron.yml"
  - ARCHITECTURE.md
  - CLAUDE.md
  - DEVELOPMENT.md
  - eslint.config.mjs
  - package-lock.json
  - package.json
  - scripts/rls-check.mjs
---

## Decided
- Фоновый перевод по расписанию живёт в Supabase (Edge Function + pg_cron): GitHub Actions для аккаунта недоступен окончательно, приложение не размещено до этапа 8 (ADR-024 в Obsidian).
- Логика не копируется на Deno: исходник функции импортирует src/lib/localization, esbuild собирает один index.js, деплоится он. Общий код держим без Node-only API (Buffer → TextEncoder/atob), окружение — через process.env.
- verify_jwt выключен: новые ключи sb_secret_ не JWT; доступ проверяет код по заголовку x-cron-secret.

## Tried and ruled out
- Import map на ../../../src в deno.json: неясно, соберёт ли Supabase файлы вне supabase/functions, а CLI без логина не проверить.
- Ночное расписание, где pg_cron по HTTP дёргает приложение (а не Edge Function): вызывать некого, хостинга нет до этапа 8.

## Not a conflict
- Маршрут /api/cron/translate остаётся: ручной запуск перевода и его E2E-тест (защита секретом, перевод через мок DeepL). Упоминать его в DEVELOPMENT.md, тестах и документации — нормально; нарушение только в том, чтобы снова поставить его в расписание pg_cron вместо Edge Function.

## Watch out
- После правок src/lib/localization (и всего, что он импортирует) — `npm run functions:build`, закоммитить index.js и передеплоить функцию; иначе `functions:check` в verify упадёт, а в Supabase останется старый код.
- CRON_SECRET должен совпадать в секрете функции и в Vault (translate_cron_secret), иначе ночной вызов получает 401 — смотреть net._http_response.

In the code: supabase/functions/translate-cron/main.ts, scripts/build-edge-functions.mjs, src/lib/localization/runs.ts, supabase/migrations/*translation_runs.sql, *translate_cron_schedule.sql
