import { defineConfig, devices } from "@playwright/test";

import { E2E_CRON_SECRET, E2E_DEEPL_KEY, E2E_SUPABASE_KEY, E2E_SUPABASE_URL } from "./tests/e2e/constants";

const APP_PORT = 3100;
const MOCK_PORT = 4010;
const SHIKIMORI_MOCK_PORT = 4020;
const DEEPL_MOCK_PORT = 4030;
const SUPABASE_MOCK_PORT = 4040;
const isCI = !!process.env.CI;

/**
 * E2E на production-сборке с контролируемым AniList:
 * - мок GraphQL (tests/mock-anilist) вместо graphql.anilist.co — тесты не зависят от сети и лимитов;
 * - мок Supabase (tests/mock-supabase) — Auth и profiles в памяти, настоящий проект не используется;
 * - мок Shikimori (tests/mock-shikimori) — русские названия и описания; мок DeepL (tests/mock-deepl) — машинный перевод;
 *   переводы хранятся в памяти процесса (Supabase в E2E не используется);
 * - ANIME_TOWN_E2E=1 — отдельная папка сборки .next-e2e;
 * - обложки AniList и в production грузятся браузером напрямую (unoptimized), поэтому Playwright
 *   подменяет их ответы без сети (tests/e2e/fixtures.ts);
 * - лимит каталога считается по IP — фикстура даёт каждому тесту свой x-forwarded-for.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? "github" : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    locale: "ru-RU",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/mock-anilist/server.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/health`,
      env: { MOCK_ANILIST_PORT: String(MOCK_PORT) },
      reuseExistingServer: !isCI,
    },
    {
      command: "node tests/mock-shikimori/server.mjs",
      url: `http://127.0.0.1:${SHIKIMORI_MOCK_PORT}/health`,
      env: { MOCK_SHIKIMORI_PORT: String(SHIKIMORI_MOCK_PORT) },
      reuseExistingServer: !isCI,
    },
    {
      command: "node tests/mock-deepl/server.mjs",
      url: `http://127.0.0.1:${DEEPL_MOCK_PORT}/health`,
      env: { MOCK_DEEPL_PORT: String(DEEPL_MOCK_PORT), MOCK_DEEPL_KEY: E2E_DEEPL_KEY },
      reuseExistingServer: !isCI,
    },
    {
      command: "node tests/mock-supabase/server.mjs",
      url: `http://127.0.0.1:${SUPABASE_MOCK_PORT}/health`,
      env: { MOCK_SUPABASE_PORT: String(SUPABASE_MOCK_PORT) },
      reuseExistingServer: !isCI,
    },
    {
      command: `npx next build && npx next start -p ${APP_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${APP_PORT}/catalog`,
      env: {
        ANIME_TOWN_E2E: "1",
        ANILIST_GRAPHQL_URL: `http://127.0.0.1:${MOCK_PORT}/graphql`,
        SHIKIMORI_GRAPHQL_URL: `http://127.0.0.1:${SHIKIMORI_MOCK_PORT}/api/graphql`,
        TRANSLATOR_PROVIDER: "deepl",
        DEEPL_API_KEY: E2E_DEEPL_KEY,
        DEEPL_API_URL: `http://127.0.0.1:${DEEPL_MOCK_PORT}`,
        CRON_SECRET: E2E_CRON_SECRET,
        // Supabase — мок; значения из .env.local не используются (переменные окружения важнее файла).
        NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: E2E_SUPABASE_KEY,
        SUPABASE_SERVICE_ROLE_KEY: "",
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${APP_PORT}`,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});
