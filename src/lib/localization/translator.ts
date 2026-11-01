import { createDeepLTranslator } from "./translators/deepl";

/**
 * Машинный перевод EN → RU для тайтлов без описания на Shikimori.
 * Провайдер выбирается переменной TRANSLATOR_PROVIDER; ключ — только в переменных окружения сервера.
 * Новый провайдер (например, yandex) — ещё одна запись в PROVIDERS; вызывающий код не меняется.
 */
export interface Translator {
  /** Идентификатор для базы (anime_localizations.translator): deepl, yandex… */
  readonly name: string;
  /** Название для интерфейса: «Машинный перевод (DeepL)». */
  readonly label: string;
  /** Сколько текстов и байт тела можно отправить одним запросом. */
  readonly maxBatchTexts: number;
  readonly maxBatchBytes: number;
  /**
   * Переводит пачку текстов с английского на русский; порядок ответа = порядок запроса.
   * Ошибки — TranslatorError (повторы временных сбоев провайдер делает сам).
   */
  translate(texts: string[]): Promise<{ texts: string[]; billedCharacters: number }>;
  /** Израсходовано и доступно символов в текущем периоде; null — провайдер не сообщает. */
  getUsage(): Promise<TranslatorUsage | null>;
}

export type TranslatorUsage = { used: number; limit: number };

/** Подписи провайдеров для интерфейса — в том числе для переводов, сделанных прежним провайдером. */
export const TRANSLATOR_LABELS: Record<string, string> = {
  deepl: "DeepL",
  yandex: "Яндекс Переводчик",
};

export function translatorLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  return TRANSLATOR_LABELS[name] ?? name;
}

type Env = Record<string, string | undefined>;

const PROVIDERS: Record<string, (env: Env) => Translator | null> = {
  deepl(env) {
    // DEEPL_API_KEY — основное имя; TRANSLATOR_API_KEY — общее имя из .env.example.
    const apiKey = (env.DEEPL_API_KEY || env.TRANSLATOR_API_KEY)?.trim();
    if (!apiKey) return null;
    // Подмена адреса — только для E2E (мок DeepL), чтобы ключ нельзя было случайно отправить на чужой сервер.
    const endpoint = env.ANIME_TOWN_E2E === "1" ? env.DEEPL_API_URL : undefined;
    return createDeepLTranslator({ apiKey, endpoint });
  },
};

export function getTranslator(env: Env = process.env): Translator | null {
  const provider = env.TRANSLATOR_PROVIDER?.trim().toLowerCase();
  if (!provider) return null;

  const create = PROVIDERS[provider];
  if (!create) {
    console.warn(`[translator] неизвестный провайдер «${provider}» — машинный перевод выключен`);
    return null;
  }
  const translator = create(env);
  if (!translator) console.warn(`[translator] у провайдера «${provider}» не задан ключ — машинный перевод выключен`);
  return translator;
}
