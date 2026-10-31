/**
 * Машинный перевод EN → RU для тайтлов без описания на Shikimori.
 * Провайдер выбирается переменной TRANSLATOR_PROVIDER; ключ — только в переменных окружения сервера.
 * Пока провайдер не выбран, getTranslator() возвращает null и сайт честно показывает английский оригинал.
 */
export interface Translator {
  readonly name: string;
  /** Переводит текст с английского на русский. Бросает ошибку при сбое — перевод повторится позже. */
  translate(text: string): Promise<string>;
}

const TRANSLATE_TIMEOUT_MS = 15_000;

/**
 * Тестовый провайдер для E2E: HTTP-мок из tests/mock-shikimori (POST { text } → { text }).
 * Включается только в E2E-сборке, чтобы его нельзя было случайно включить в продакшене.
 */
function createMockTranslator(endpoint: string): Translator {
  return {
    name: "mock",
    async translate(text) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, from: "en", to: "ru" }),
        signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Переводчик ответил ${response.status}`);
      const body = (await response.json()) as { text?: string };
      if (!body.text?.trim()) throw new Error("Переводчик вернул пустой текст");
      return body.text.trim();
    },
  };
}

export function getTranslator(env: NodeJS.ProcessEnv = process.env): Translator | null {
  const provider = env.TRANSLATOR_PROVIDER?.trim();
  if (!provider) return null;

  if (provider === "mock" && env.ANIME_TOWN_E2E === "1" && env.TRANSLATOR_MOCK_URL) {
    return createMockTranslator(env.TRANSLATOR_MOCK_URL);
  }

  console.warn(`[translator] неизвестный или недоступный провайдер «${provider}» — машинный перевод выключен`);
  return null;
}
