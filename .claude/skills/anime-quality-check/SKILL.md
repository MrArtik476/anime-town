---
name: anime-quality-check
description: Use before committing, opening a PR, or saying a feature is done in Anime Town — runs lint, typecheck, unit and Playwright e2e tests, checks for leaked secrets, and verifies the feature in a real browser.
---

# Anime Quality Check

Принцип из `superpowers:verification-before-completion`: никаких «готово» без вывода команд.

## Обязательный прогон
```bash
npm run lint
npm run typecheck
npm run test        # unit (если есть)
npm run test:e2e    # Playwright
npm run build       # для крупных изменений и перед PR
```
Если что-то упало — `superpowers:systematic-debugging`, а не подгонка теста.

## Проверка секретов
```bash
git diff --cached | grep -nE "(service_role|sk_live|ghp_|eyJhbGciOi|SUPABASE_SERVICE_ROLE_KEY=.+)"
```
Должно быть пусто. `.env.local` не в индексе.

## Ручная проверка в браузере (Playwright MCP)
Для UI-изменений открыть страницу, пройти сценарий, сделать скриншот desktop (1440) и mobile (390), проверить консоль на ошибки.

## Чек-лист по фиче
- [ ] Сценарий работает для гостя и для вошедшего пользователя (если применимо)
- [ ] Пустые состояния, загрузка (skeleton), ошибки
- [ ] Клавиатура и фокус
- [ ] RLS: чужие данные недоступны (проверка запросом от другого пользователя)
- [ ] Нет новых предупреждений в консоли и сборке

## Тесты Playwright
- `tests/e2e/<feature>.spec.ts`, селекторы — `getByRole` / `getByLabel`, не CSS-классы.
- Тестовый пользователь — через Supabase admin API в `globalSetup`, данные — seed.
- Конфиг: `webServer` поднимает `npm run dev`, проекты chromium + mobile.

## После проверки
Запиши результат в `Anime Town/10 - Тестирование/`, найденные и исправленные баги — в `Anime Town/11 - Ошибки и решения/` (симптом → причина → решение), строку в `[[Development Log]]`.
