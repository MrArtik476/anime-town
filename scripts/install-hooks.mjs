// Подключает git-хуки проекта из .githooks/ (`npm install` запускает это через скрипт prepare).
// Вне git-репозитория (архив, чужая сборка) ничего не делает и не падает.
import { spawnSync } from "node:child_process";

const inRepo = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
if (inRepo.status !== 0 || inRepo.stdout.trim() !== "true") process.exit(0);

const result = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
process.exit(result.status ?? 0);
