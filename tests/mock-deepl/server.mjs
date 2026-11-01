// Мок DeepL API для E2E (тесты не ходят в сеть и не тратят квоту).
// Приложение запускается с TRANSLATOR_PROVIDER=deepl, DEEPL_API_KEY=<фиктивный ключ>, DEEPL_API_URL=http://127.0.0.1:4030.
//
// Контракт как у DeepL: Authorization: DeepL-Auth-Key <ключ> (иначе 403), POST /v2/translate { text[], source_lang, target_lang },
// GET /v2/usage → { character_count, character_limit }. Текст «__quota__» → 456 (квота исчерпана).

import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_DEEPL_PORT ?? 4030);
const EXPECTED_KEY = process.env.MOCK_DEEPL_KEY ?? "e2e-fake-deepl-key:fx";
const CHARACTER_LIMIT = 500_000;
let characterCount = 0;

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true });
  if (req.headers.authorization !== `DeepL-Auth-Key ${EXPECTED_KEY}`) return json(res, 403, { message: "Forbidden" });

  if (req.method === "GET" && req.url === "/v2/usage") {
    return json(res, 200, { character_count: characterCount, character_limit: CHARACTER_LIMIT });
  }
  if (req.method !== "POST" || req.url !== "/v2/translate") return json(res, 404, { message: "Not found" });

  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return json(res, 400, { message: "Invalid JSON" });
    }
    const texts = payload.text;
    if (!Array.isArray(texts) || payload.source_lang !== "EN" || payload.target_lang !== "RU") {
      return json(res, 400, { message: "Bad request" });
    }
    if (texts.some((text) => String(text).includes("__quota__"))) return json(res, 456, { message: "Quota exceeded" });

    const translations = texts.map((text) => {
      const source = String(text);
      characterCount += source.length;
      return { detected_source_language: "EN", text: `Перевод DeepL: ${source.split("\n")[0]}`, billed_characters: source.length };
    });
    return json(res, 200, { translations });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`mock DeepL on http://127.0.0.1:${PORT}`));
