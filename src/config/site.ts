export const siteConfig = {
  name: "Anime Town",
  description:
    "Аниме-платформа: каталог тайтлов, просмотр серий, личная библиотека и сообщество.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "ru",
} as const;
