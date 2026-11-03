// Типы базы для supabase-js: `npm run db:types`.
// Вызывает `npx supabase gen types typescript --project-id … --schema public` и записывает
// src/types/database.ts только при успешном выходе с непустым выводом — при ошибке файл не трогается
// (перенаправление `>` в npm-скрипте обнуляло его ещё до запуска команды).
// Нужен личный токен Supabase в переменной окружения SUPABASE_ACCESS_TOKEN.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const PROJECT_ID = "bhzshfkhpumyojxuygsc";
const OUTPUT = "src/types/database.ts";

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("Нужен SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens). Файл типов не изменён.");
  process.exit(2);
}

const result = spawnSync("npx", ["supabase", "gen", "types", "typescript", "--project-id", PROJECT_ID, "--schema", "public"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 16 * 1024 * 1024,
});

if (result.error || result.status !== 0 || !result.stdout?.includes("export type Database")) {
  if (result.stderr) process.stderr.write(result.stderr);
  console.error(`supabase gen types не удался (код ${result.status ?? result.error?.message}). Файл типов не изменён.`);
  process.exit(1);
}

fs.writeFileSync(OUTPUT, result.stdout);
console.log(`Типы записаны в ${OUTPUT}`);
