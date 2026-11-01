// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  createDeepLTranslator,
  DEEPL_BATCH_MAX_BYTES,
  DEEPL_FREE_ENDPOINT,
  DEEPL_MAX_REQUEST_BYTES,
  DEEPL_PRO_ENDPOINT,
  deeplEndpointForKey,
} from "@/lib/localization/translators/deepl";
import { isFatalTranslatorError } from "@/lib/localization/translators/errors";

// Ключи здесь — фиктивные строки для мока, настоящий ключ в тесты не попадает.
const FREE_KEY = "00000000-0000-0000-0000-000000000000:fx";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const setup = (...responses: (Response | Error)[]) => {
  const fetchImpl = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Response) fetchImpl.mockResolvedValueOnce(response);
    else fetchImpl.mockRejectedValueOnce(response);
  }
  const sleep = vi.fn(async () => {});
  const translator = createDeepLTranslator({ apiKey: FREE_KEY, fetchImpl, sleep, random: () => 1 });
  return { fetchImpl, sleep, translator };
};

describe("DeepL: эндпоинт и запрос", () => {
  it("ключ с :fx → api-free.deepl.com, иначе api.deepl.com", () => {
    expect(deeplEndpointForKey(FREE_KEY)).toBe(DEEPL_FREE_ENDPOINT);
    expect(deeplEndpointForKey("00000000-0000-0000-0000-000000000000")).toBe(DEEPL_PRO_ENDPOINT);
    expect(DEEPL_BATCH_MAX_BYTES).toBeLessThan(DEEPL_MAX_REQUEST_BYTES);
  });

  it("POST /v2/translate: пачка текстов, EN→RU, заголовок DeepL-Auth-Key, порядок ответа сохраняется", async () => {
    const { fetchImpl, translator } = setup(
      json({ translations: [{ text: " Один ", billed_characters: 3 }, { text: "Два", billed_characters: 3 }] }),
    );

    const result = await translator.translate(["One", "Two"]);

    expect(result).toEqual({ texts: ["Один", "Два"], billedCharacters: 6 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api-free.deepl.com/v2/translate");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`DeepL-Auth-Key ${FREE_KEY}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      text: ["One", "Two"],
      source_lang: "EN",
      target_lang: "RU",
      show_billed_characters: true,
    });
  });

  it("без billed_characters расход считается по исходному тексту", async () => {
    const { translator } = setup(json({ translations: [{ text: "Привет" }] }));
    await expect(translator.translate(["Hello"])).resolves.toEqual({ texts: ["Привет"], billedCharacters: 5 });
  });

  it("неполный ответ — ошибка, а не сдвиг переводов", async () => {
    const { translator } = setup(json({ translations: [{ text: "Один" }] }));
    await expect(translator.translate(["One", "Two"])).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("GET /v2/usage → израсходовано и лимит", async () => {
    const { fetchImpl, translator } = setup(json({ character_count: 1200, character_limit: 500000 }));
    await expect(translator.getUsage()).resolves.toEqual({ used: 1200, limit: 500000 });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api-free.deepl.com/v2/usage");
  });
});

describe("DeepL: ошибки", () => {
  it("403 — AUTH, без повторов, фатальная", async () => {
    const { fetchImpl, translator } = setup(json({ message: "Forbidden" }, 403));
    const error = await translator.translate(["x"]).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "AUTH", status: 403 });
    expect(isFatalTranslatorError(error)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("456 — QUOTA_EXCEEDED, без повторов, фатальная", async () => {
    const { fetchImpl, translator } = setup(json({ message: "Quota exceeded" }, 456));
    const error = await translator.translate(["x"]).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "QUOTA_EXCEEDED", status: 456 });
    expect(isFatalTranslatorError(error)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("429 — повтор с учётом Retry-After, затем успех", async () => {
    const { fetchImpl, sleep, translator } = setup(
      json({}, 429, { "Retry-After": "2" }),
      json({ translations: [{ text: "Да" }] }),
    );
    await expect(translator.translate(["Yes"])).resolves.toMatchObject({ texts: ["Да"] });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("5xx и 529 — экспоненциальная пауза; после 3 повторов — UNAVAILABLE / RATE_LIMITED", async () => {
    const server = setup(json({}, 503), json({}, 500), json({}, 502), json({}, 504));
    await expect(server.translator.translate(["x"])).rejects.toMatchObject({ code: "UNAVAILABLE", status: 504 });
    expect(server.fetchImpl).toHaveBeenCalledTimes(4);
    // random() = 1 → без снижения jitter: 1 → 2 → 4 с.
    expect(server.sleep.mock.calls).toEqual([[1000], [2000], [4000]]);

    const busy = setup(json({}, 529), json({}, 529), json({}, 529), json({}, 529));
    await expect(busy.translator.translate(["x"])).rejects.toMatchObject({ code: "RATE_LIMITED", status: 529 });
    expect(isFatalTranslatorError(await busy.translator.translate(["x"]).catch((e: unknown) => e))).toBe(false);
  });

  it("таймаут и сетевой сбой — повтор, затем UNAVAILABLE", async () => {
    const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const recovering = setup(timeout(), json({ translations: [{ text: "Ок" }] }));
    await expect(recovering.translator.translate(["Ok"])).resolves.toMatchObject({ texts: ["Ок"] });

    const down = setup(new TypeError("fetch failed"), timeout(), timeout(), timeout());
    await expect(down.translator.translate(["Ok"])).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(down.fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("400 и 413 — BAD_REQUEST без повторов; текст ответа и ключ не попадают в сообщение", async () => {
    const { fetchImpl, translator } = setup(json({ message: `secret ${FREE_KEY}` }, 413));
    const error = (await translator.translate(["x"]).catch((e: unknown) => e)) as Error;
    expect(error).toMatchObject({ code: "BAD_REQUEST", status: 413 });
    expect(error.message).not.toContain(FREE_KEY);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
