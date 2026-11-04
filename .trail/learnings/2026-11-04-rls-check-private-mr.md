---
title: "Проверки rls:check для новой схемы пишутся до применения миграции, а права на функции private отзываются поимённо"
author: Mr_Artik476
date: 2026-11-04
branch: feature/notifications-schema
id: l-0ce0f47f
scope: repo
status: active
src: agent
touches:
  - scripts/rls-check.mjs
  - supabase/migrations/20261104174856_notifications.sql
---

## Decided
- Блок rls:check для новой таблицы пишется и запускается ДО apply_migration: все новые проверки должны быть ❌ (PGRST205 — таблицы нет), после применения — ✅. Это единственный RED без ослабления рабочей базы (временные grant/drop в живом проекте отклонены авто-режимом ещё в 5a-1).
- Чтобы RED был честным, отрицательные проверки сверяют точный код (42501), а «не видит чужое» парится с доказательством доступа: admin видит строку и пользователь видит свою. Иначе `!!error` проходит и на отсутствующей таблице.
- Новые функции в схеме private: `revoke execute on function private.<fn>(…) from public, anon, authenticated` поимённо. Default privileges у схемы private нет — новая функция по умолчанию исполняема PUBLIC, поэтому revoke обязателен.

## Tried and ruled out
- `revoke execute on all functions in schema private …` в новой миграции: снимает и execute у authenticated на is_moderator()/is_banned(), без которого падают политики comments.

## Watch out
- Проверки, добавленные уже после применения (поведение живое и верное), RED не дают — их чувствительность обосновывается в отчёте, а не прогоном.
- trail check ругается на scripts/rls-check.mjs (Array.map().join()) как на «import map» — ложное срабатывание, объяснять в PR.

In the code: supabase/migrations/20261104174856_notifications.sql (блок revoke в конце), scripts/rls-check.mjs (блок «уведомления»).
