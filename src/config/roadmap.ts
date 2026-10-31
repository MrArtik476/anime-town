export type StageStatus = "done" | "active" | "planned";

export type RoadmapStage = {
  id: number;
  title: string;
  summary: string;
  status: StageStatus;
};

// Синхронизировано с ROADMAP.md — при смене этапа обновлять оба места.
export const roadmapStages: RoadmapStage[] = [
  {
    id: 0,
    title: "Среда разработки",
    summary: "Репозиторий, документация, Skills, MCP, база знаний.",
    status: "done",
  },
  {
    id: 1,
    title: "Фундамент",
    summary: "Next.js, дизайн-система, Supabase, CI и превью-деплой.",
    status: "active",
  },
  {
    id: 2,
    title: "Каталог",
    summary: "Синхронизация с AniList, фильтры, поиск, страница тайтла.",
    status: "planned",
  },
  {
    id: 3,
    title: "Аккаунты",
    summary: "Регистрация, профиль, избранное и оценки.",
    status: "planned",
  },
  {
    id: 4,
    title: "Просмотр",
    summary: "HLS-плеер, субтитры, история и «продолжить просмотр».",
    status: "planned",
  },
  {
    id: 5,
    title: "Сообщество",
    summary: "Комментарии и уведомления.",
    status: "planned",
  },
];
