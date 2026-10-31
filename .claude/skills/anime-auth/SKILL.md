---
name: anime-auth
description: Use when implementing Anime Town registration, login, logout, OAuth, password reset, sessions, middleware, protected routes, user profiles, roles (user/moderator/admin) or anything touching Supabase Auth.
---

# Anime Auth

Основа — skill `supabase:supabase` (раздел SSR/Auth). Сверяй API `@supabase/ssr` через Context7 — он меняется.

## Клиенты (`src/lib/supabase/`)
- `server.ts` — `createServerClient` с `cookies()` из `next/headers` (getAll/setAll).
- `client.ts` — `createBrowserClient` для клиентских компонентов.
- `middleware.ts` + `src/middleware.ts` — обновляет сессию на каждом запросе, matcher исключает статику и изображения.
- Ключи: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Service role — только в отдельном серверном admin-клиенте.

## Проверка пользователя
- На сервере доверять только `supabase.auth.getUser()` или `getClaims()` (проверяют JWT). `getSession()` на сервере не использовать для авторизации.
- Защищённые разделы `(account)` и `admin` — проверка в `layout.tsx` (redirect на `/login?next=...`) + RLS в БД. UI-скрытие кнопок — не защита.

## Потоки
- Email + пароль, magic link, OAuth (Google, Discord, GitHub — по мере настройки в Supabase).
- `/auth/callback` Route Handler — `exchangeCodeForSession`, затем redirect на `next` (только относительные пути, защита от open redirect).
- Регистрация создаёт `profiles` строкой через триггер `on auth.users insert` (security definer), с уникальным `username`.
- Сброс пароля: `resetPasswordForEmail` → страница `/auth/update-password`.
- Формы — Server Actions, валидация (zod) на сервере, понятные ошибки на русском.

## Роли
- `profiles.role`: `user` по умолчанию; менять роль может только admin (политика + серверная проверка). Пользователь не может обновить своё поле `role` — отдельная политика/колонка-guard.

## Безопасность
- Rate limit и CAPTCHA для регистрации — включить в настройках Supabase Auth.
- Redirect URLs в Supabase: localhost, Vercel preview (`https://*-<team>.vercel.app/**`), продакшен-домен.
- Не логировать токены и пароли.

## Проверка
E2E: регистрация → профиль создан; вход/выход; доступ к `/profile` без входа → редирект; обычный пользователь не открывает `/admin`.
