// Полная локальная проверка перед слиянием PR (GitHub Actions недоступен — DEVELOPMENT.md, «Проверки перед слиянием»):
// `npm run verify` — lint → typecheck → unit → build → E2E; `npm run verify -- --quick` — lint → typecheck → unit
// (его вызывает хук .githooks/pre-push). Шаги идут по очереди, первый сбой останавливает прогон.
// Код выхода: 0 — всё зелёное, 1 — шаг упал, 2 — неверные аргументы.
import { spawnSync } from "node:child_process";

const QUICK = ["lint", "typecheck", "test"];
const FULL = [...QUICK, "build", "test:e2e"];

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--quick");
if (unknown.length) {
  console.error(`Неизвестные аргументы: ${unknown.join(" ")}\nИспользование: npm run verify [-- --quick]`);
  process.exit(2);
}
const steps = args.includes("--quick") ? QUICK : FULL;

const seconds = (ms) => `${(ms / 1000).toFixed(1)} с`;
const results = [];
let failed = null;

for (const step of steps) {
  console.log(`\n▶ npm run ${step}`);
  const started = Date.now();
  // Строкой через shell: на Windows npm — это npm.cmd; имена шагов фиксированы, не из ввода.
  const { status } = spawnSync(`npm run ${step}`, { stdio: "inherit", shell: true });
  results.push({ step, ok: status === 0, ms: Date.now() - started });
  if (status !== 0) {
    failed = step;
    break;
  }
}

console.log("\nИтог проверки:");
for (const { step, ok, ms } of results) console.log(`  ${ok ? "✅" : "❌"} ${step} — ${seconds(ms)}`);
for (const step of steps.slice(results.length)) console.log(`  ⏭ ${step} — не запускался`);

if (failed) {
  console.error(`\nПроверка не пройдена: упал шаг «${failed}».`);
  process.exit(1);
}
console.log(`\nВсе шаги зелёные (${steps.length}).`);
