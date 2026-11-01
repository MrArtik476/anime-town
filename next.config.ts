import type { NextConfig } from "next";

// E2E-сборка (ANIME_TOWN_E2E=1) собирается в отдельную папку, чтобы не затирать обычную `.next`.
const isE2E = process.env.ANIME_TOWN_E2E === "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Аватар до 1 МБ (лимит бакета) + служебные поля формы: стандартного 1 МБ не хватает.
    serverActions: { bodySizeLimit: "2mb" },
  },
  distDir: isE2E ? ".next-e2e" : ".next",
  images: {
    // Картинки AniList выводятся с `unoptimized` (см. lib/anilist/images.ts): браузер грузит их с CDN AniList
    // напрямую. Шаблон оставлен на случай, если флаг где-то забудут: картинка не сломается, а пройдёт оптимизатор.
    remotePatterns: [new URL("https://s4.anilist.co/file/anilistcdn/**")],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
