import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

import { E2E_DEEPL_KEY } from "./constants";

// Скрипт `npm run translate` (scripts/translate-backfill.ts) против моков AniList, Shikimori и DeepL,
// которые поднимает playwright.config.ts. Хранилище — память процесса скрипта (ANIME_TOWN_E2E=1),
// поэтому сервер приложения и его переводы этот тест не затрагивает.
const run = promisify(execFile);
const TSX_CLI = path.resolve("node_modules/tsx/dist/cli.mjs");
const SCRIPT = "scripts/translate-backfill.ts";

const scriptEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  PATH: process.env.PATH ?? "",
  SYSTEMROOT: process.env.SYSTEMROOT ?? "",
  ANIME_TOWN_E2E: "1",
  ANILIST_GRAPHQL_URL: "http://127.0.0.1:4010/graphql",
  SHIKIMORI_GRAPHQL_URL: "http://127.0.0.1:4020/api/graphql",
  TRANSLATOR_PROVIDER: "deepl",
  TRANSLATOR_API_KEY: E2E_DEEPL_KEY,
  DEEPL_API_URL: "http://127.0.0.1:4030",
  ...extra,
});

type RunResult = { code: number; stdout: string; stderr: string };

async function translate(args: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  try {
    const { stdout, stderr } = await run(process.execPath, [TSX_CLI, SCRIPT, ...args], { env, timeout: 60_000 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? -1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

test.describe("npm run translate", () => {
  test("переводит не больше --limit тайтлов и пишет сводку для GitHub Actions", async () => {
    const summaryFile = path.join(mkdtempSync(path.join(tmpdir(), "translate-")), "summary.md");
    const result = await translate(["--limit", "1"], scriptEnv({ GITHUB_STEP_SUMMARY: summaryFile }));

    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ translator: "deepl", stopped: null, pending: 1, translated: 1, batches: 1 });
    expect(report.characters).toBeGreaterThan(0);
    expect(report.usage.ownLimit).toBe(450_000);

    const summary = readFileSync(summaryFile, "utf8");
    expect(summary).toContain("✅ готово");
    expect(summary).toContain("| Переведено | 1 |");
    // Ни в отчёте, ни в сводке нет ключа.
    expect(result.stdout + result.stderr + summary).not.toContain(E2E_DEEPL_KEY);
  });

  test("без переводчика — код 1, символы не тратятся", async () => {
    const result = await translate([], scriptEnv({ TRANSLATOR_PROVIDER: "" }));
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ stopped: "no_translator", characters: 0 });
  });

  test("неверный --limit — код 2 и подсказка", async () => {
    const result = await translate(["--limit", "500"], scriptEnv());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("limit должен быть целым числом от 1 до 100");
  });
});
