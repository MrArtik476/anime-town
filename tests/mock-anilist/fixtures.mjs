// Контролируемые тестовые данные в формате ответа AniList. Только для E2E — приложение их не использует.

const CDN = "https://s4.anilist.co/file/anilistcdn/media/anime";

const FORMATS = ["TV", "TV", "MOVIE", "OVA", "ONA", "TV_SHORT", "SPECIAL"];
const STATUSES = ["FINISHED", "RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED"];
const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];
const GENRE_SETS = [
  ["Action", "Adventure"],
  ["Comedy", "Slice of Life"],
  ["Drama", "Romance"],
  ["Action", "Sci-Fi"],
  ["Fantasy", "Adventure"],
  ["Mystery", "Thriller"],
];

const media = (id, overrides = {}) => {
  const year = 2015 + (id % 12);
  return {
    id,
    // MAL id = id Shikimori (tests/mock-shikimori): 1000 + id.
    idMal: 1000 + id,
    title: { romaji: `Tesuto Anime ${id}`, english: `Test Anime ${id}`, native: `テストアニメ${id}` },
    synonyms: [],
    coverImage: {
      extraLarge: `${CDN}/cover/large/test-${id}.jpg`,
      large: `${CDN}/cover/medium/test-${id}.jpg`,
      color: "#3a4a6b",
    },
    bannerImage: null,
    description: `Test anime ${id} plot summary.<br><br>Second line &quot;with a quote&quot;.`,
    format: FORMATS[id % FORMATS.length],
    status: STATUSES[id % STATUSES.length],
    season: SEASONS[id % SEASONS.length],
    seasonYear: year,
    startDate: { year, month: (id % 12) + 1, day: (id % 27) + 1 },
    endDate: { year: year + 1, month: 3, day: null },
    episodes: 12 + (id % 3) * 12,
    averageScore: 60 + (id % 35),
    popularity: 100000 - id * 1000,
    favourites: 5000 - id * 50,
    trending: 500 - id * 10,
    duration: 24,
    source: "MANGA",
    isAdult: false,
    genres: GENRE_SETS[id % GENRE_SETS.length],
    studios: { nodes: [{ id: 1, name: "Studio Test" }] },
    relations: { edges: [] },
    ...overrides,
  };
};

export const MEDIA = [
  media(1, {
    title: { romaji: "Hoshi no Machi", english: "Star Town", native: "星の町" },
    synonyms: ["Звёздный город", "Hoshimachi"],
    bannerImage: `${CDN}/banner/test-1.jpg`,
    averageScore: 91,
    trending: 1000,
    popularity: 250000,
    genres: ["Action", "Fantasy"],
    format: "TV",
    status: "RELEASING",
    relations: {
      edges: [
        {
          relationType: "SEQUEL",
          node: {
            id: 2,
            type: "ANIME",
            title: { romaji: "Hoshi no Machi 2", english: "Star Town Season 2", native: null },
            synonyms: [],
            format: "TV",
            status: "NOT_YET_RELEASED",
            startDate: { year: 2027, month: null, day: null },
            coverImage: { large: `${CDN}/cover/medium/test-2.jpg`, color: null },
            isAdult: false,
          },
        },
        {
          relationType: "SOURCE",
          node: {
            id: 9001,
            type: "MANGA",
            title: { romaji: "Hoshi no Machi (Manga)", english: null, native: null },
            synonyms: [],
            format: "MANGA",
            status: "FINISHED",
            startDate: { year: 2019, month: 4, day: 1 },
            coverImage: { large: null, color: null },
            isAdult: false,
          },
        },
      ],
    },
  }),
  media(2, { title: { romaji: "Hoshi no Machi 2", english: "Star Town Season 2", native: null } }),
  // Неполные данные: без оценки, года, формата и обложки — карточка не должна показывать пустоты.
  media(3, {
    title: { romaji: "Nazo no Kage", english: null, native: null },
    averageScore: null,
    seasonYear: null,
    startDate: { year: null, month: null, day: null },
    format: null,
    episodes: null,
    coverImage: { extraLarge: null, large: null, color: null },
    description: null,
    studios: { nodes: [] },
    source: null,
    duration: null,
  }),
  // Битая обложка — проверка запасного варианта постера.
  media(4, {
    title: { romaji: "Kowareta E", english: "Broken Picture", native: null },
    coverImage: { extraLarge: `${CDN}/cover/large/broken.jpg`, large: `${CDN}/cover/medium/broken.jpg`, color: "#6b3a3a" },
  }),
  // Резкий рост интереса: первый «В тренде», но последний по популярности — сортировки различимы.
  media(5, {
    title: { romaji: "Ryuusei Sprint", english: "Meteor Sprint", native: "流星スプリント" },
    trending: 2000,
    popularity: 1000,
  }),
  ...Array.from({ length: 25 }, (_, index) => media(index + 6)),
];


// Русский поиск: у AniList только английское и японское название, «Атака титанов» знает Shikimori (MAL 16498).
Object.assign(
  MEDIA.find((item) => item.id === 6),
  {
    idMal: 16498,
    title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
    synonyms: ["AoT"],
  },
);

export const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Hentai", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Thriller",
];
