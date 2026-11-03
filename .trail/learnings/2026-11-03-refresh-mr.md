---
title: "Подтверждения действий не должны жить в списке, который пересоздаётся после refresh"
author: Mr_Artik476
date: 2026-11-03
branch: feature/moderation
id: l-a28a54bf
scope: repo
status: active
src: agent
touches:
  - ARCHITECTURE.md
  - DEVELOPMENT.md
  - scripts/rls-check.mjs
  - src/features/auth/components/user-menu.tsx
  - src/features/comments/actions.ts
  - src/features/comments/components/comment-item.tsx
  - src/features/comments/components/comments-list.tsx
  - src/features/comments/model.ts
  - src/features/comments/queries.ts
  - supabase/migrations/20261103110118_rls_auto_enable_revoke.sql
---

## Decided
- Списки на /moderation (жалобы, баны) не пересоздаются по key после refresh(): свежие props подхватываются шаблоном «предыдущие props в state» (source !== initial → setState), поэтому сообщение «Жалобы отклонены» / «Бан … снят» остаётся.
- Бан автора не вызывает refresh(): на странице обсуждения он ничего не меняет, а перерисовка пересоздала бы CommentsList (key = первая страница) и стёрла бы «@ник заблокирован». На /moderation после бана — router.refresh() на клиенте.

## Tried and ruled out
- key={…} на ReportList/ActiveBans: E2E падали — после refresh() компонент пересоздавался и сообщение пропадало. На общем моке первая страница обсуждения меняется от параллельных тестов, так что пересоздание CommentsList случается почти всегда; в жизни так же при активном обсуждении.

## Watch out
- Если добавляешь серверное действие с сообщением об успехе в компоненте под CommentsList, учитывай, что refresh() пересоздаёт список.

In the code: src/features/moderation/components/report-list.tsx, active-bans.tsx, src/features/moderation/actions.ts (command(row, refreshPage)).
