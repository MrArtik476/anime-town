import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3100;
const MOCK_PORT = 4010;
const isCI = !!process.env.CI;

/**
 * E2E на production-сборке с контролируемым AniList:
 * - мок GraphQL (tests/mock-anilist) вместо graphql.anilist.co — тесты не зависят от сети и лимитов;
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
      command: `npx next build && npx next start -p ${APP_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${APP_PORT}/catalog`,
      env: {
        ANIME_TOWN_E2E: "1",
        ANILIST_GRAPHQL_URL: `http://127.0.0.1:${MOCK_PORT}/graphql`,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});
