import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Сборка для E2E и артефакты Playwright
    ".next-e2e/**",
    "playwright-report/**",
    "test-results/**",
    // Служебные скрипты Trail (генерируются `trail init`, CommonJS)
    ".trail/**",
    // Собранные Edge Functions (npm run functions:build); исходник — main.ts рядом
    "supabase/functions/*/index.js",
  ]),
]);

export default eslintConfig;
