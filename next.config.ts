import type { NextConfig } from "next";

// E2E-сборка (ANIME_TOWN_E2E=1): отдельная папка, картинки без оптимизатора —
// браузер грузит их напрямую, и Playwright подменяет ответы без доступа к сети.
const isE2E = process.env.ANIME_TOWN_E2E === "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  distDir: isE2E ? ".next-e2e" : ".next",
  images: {
    unoptimized: isE2E,
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
