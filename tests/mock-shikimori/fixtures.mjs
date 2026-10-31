// Тайтлы Shikimori для E2E. Ключ — MAL id (= id Shikimori); в моке AniList idMal = 1000 + id.

export const ANIMES = [
  {
    // AniList 1 «Star Town»: русское название и описание с BB-кодами.
    malId: "1001",
    name: "Hoshi no Machi",
    russian: "Звёздный город",
    synonyms: ["Хосимати", "Hoshimachi"],
    description:
      "[character=1]Хоси[/character] охраняет [anime=1002]звёздный город[/anime] от тьмы.[br][br]Вторая строка русского описания.",
    url: "https://shikimori.io/animes/1001-hoshi-no-machi",
  },
  {
    // AniList 2: русское название есть, описания нет — показывается английский оригинал,
    // а в фоне запускается машинный перевод (мок переводчика ниже).
    malId: "1002",
    name: "Hoshi no Machi 2",
    russian: "Звёздный город 2",
    synonyms: [],
    description: null,
    url: "https://shikimori.io/animes/1002-hoshi-no-machi-2",
  },
  {
    // AniList 6: на AniList только «Attack on Titan» — найти по-русски можно только через Shikimori.
    malId: "16498",
    name: "Shingeki no Kyojin",
    russian: "Атака титанов",
    synonyms: ["Вторжение гигантов"],
    description: "С давних времён человечество ведёт борьбу с [i]титанами[/i].",
    url: "https://shikimori.io/animes/16498-shingeki-no-kyojin",
  },
  {
    // Есть на Shikimori, но нет в фикстурах AniList — русский поиск должен его просто пропустить.
    malId: "99999",
    name: "Shingeki no Kyojin: Lost Girls",
    russian: "Атака титанов: Потерянные девушки",
    synonyms: [],
    description: null,
    url: "https://shikimori.io/animes/99999-lost-girls",
  },
];
