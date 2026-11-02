// Сборка Edge Function translate-cron (ADR-024): `npm run functions:build`.
// esbuild разворачивает main.ts вместе с импортами `@/` из src/ в один ES-модуль index.js — его и деплоим
// (MCP deploy_edge_function, Dashboard или `supabase functions deploy translate-cron`).
// Пакеты npm остаются внешними: @supabase/supabase-js → `npm:@supabase/supabase-js@<версия из node_modules>`,
// node:* — встроенные модули Deno. `--check` — только сравнить с закоммиченным index.js (шаг npm run verify):
// код выхода 1, если сборка устарела.
import fs from "node:fs";
import path from "node:path";

import { build } from "esbuild";

const FUNCTIONS = ["translate-cron"];
const check = process.argv.includes("--check");

const supabaseJsVersion = JSON.parse(
  fs.readFileSync("node_modules/@supabase/supabase-js/package.json", "utf8"),
).version;

/** Пакеты npm — внешние импорты со спецификатором npm: и точной версией, как в package-lock. */
const npmSpecifiers = {
  name: "npm-specifiers",
  setup(builder) {
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
      path: `npm:@supabase/supabase-js@${supabaseJsVersion}`,
      external: true,
    }));
    builder.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
  },
};

let stale = false;
for (const name of FUNCTIONS) {
  const dir = path.join("supabase", "functions", name);
  const outfile = path.join(dir, "index.js");
  const result = await build({
    entryPoints: [path.join(dir, "main.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    tsconfig: "tsconfig.json",
    plugins: [npmSpecifiers],
    write: false,
    legalComments: "none",
    charset: "utf8",
    banner: {
      js: `// СГЕНЕРИРОВАНО scripts/build-edge-functions.mjs из ${dir.replaceAll("\\", "/")}/main.ts — не редактировать вручную.`,
    },
  });
  const code = result.outputFiles[0].text;

  if (check) {
    const current = fs.existsSync(outfile) ? fs.readFileSync(outfile, "utf8").replaceAll("\r\n", "\n") : null;
    if (current !== code) {
      stale = true;
      console.error(`❌ ${outfile} устарел — выполните npm run functions:build и закоммитьте результат`);
    } else {
      console.log(`✅ ${outfile} совпадает с исходниками`);
    }
  } else {
    fs.writeFileSync(outfile, code);
    console.log(`${outfile} — ${(code.length / 1024).toFixed(1)} КБ`);
  }
}
process.exit(stale ? 1 : 0);
