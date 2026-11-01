// Замер скорости Anime Town на локальной production-сборке: `npm run build && npm run start`, затем
// `npm run perf -- <метка>` → JSON с цифрами в консоли и в test-results/perf-<метка>.json (ADR-019).
// Ходит в настоящие AniList, Shikimori и Supabase (адрес и publishable-ключ — из .env.local).
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import { chromium } from "playwright";

const BULD = process.env.BULD ?? process.cwd();

const BASE = process.env.BASE ?? "http://localhost:3000";
const label = process.argv[2] ?? "run";
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const round = (x) => (x == null ? null : Math.round(x));

async function timeFetch(url, headers = {}) {
  const start = performance.now();
  const res = await fetch(url, { headers, redirect: "manual" });
  const ttfb = performance.now() - start;
  await res.arrayBuffer();
  return { status: res.status, ttfb: round(ttfb), total: round(performance.now() - start) };
}

async function serverTimings() {
  // Уникальные фильтры = заведомо холодный кэш данных; повтор = тёплый.
  const salt = Date.now() % 7;
  const pages = {
    home: "/",
    catalog: "/catalog",
    catalogFiltered: `/catalog?genre=Action&year=${2015 + salt}`,
    search: `/catalog?q=${["naruto", "bleach", "frieren", "monster", "berserk", "steins", "haikyuu"][salt]}`,
    searchRu: "/catalog?q=%D0%B0%D1%82%D0%B0%D0%BA%D0%B0",
    anime: `/anime/${[21, 1535, 5114, 16498, 11061, 20, 9253][salt]}`,
    apiNextPage: "/api/catalog?page=2",
  };
  const out = {};
  for (const [name, p] of Object.entries(pages)) {
    const cold = await timeFetch(BASE + p, { "x-forwarded-for": `198.51.100.${10 + Object.keys(out).length}` });
    const warm = [];
    for (let i = 0; i < 3; i++) warm.push((await timeFetch(BASE + p, { "x-forwarded-for": "198.51.100.99" })).total);
    out[name] = { path: p, status: cold.status, coldTtfb: cold.ttfb, coldTotal: cold.total, warmTotal: median(warm) };
  }
  return out;
}

async function upstream() {
  const q = `query { Page(perPage: 24) { media(type: ANIME, sort: POPULARITY_DESC) { id title { romaji } coverImage { large } } } }`;
  const anilist = [];
  for (let i = 0; i < 3; i++) {
    const s = performance.now();
    const r = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query: q }) });
    await r.text();
    anilist.push({ ms: round(performance.now() - s), status: r.status });
  }
  const shiki = [];
  for (let i = 0; i < 2; i++) {
    const s = performance.now();
    const r = await fetch("https://shikimori.io/api/graphql", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "AnimeTown/0.1 perf-check" }, body: JSON.stringify({ query: "{ animes(ids: \"1,5114,16498\", limit: 3) { id russian } }" }) });
    await r.text();
    shiki.push({ ms: round(performance.now() - s), status: r.status });
  }
  const env = parseEnv(fs.readFileSync(path.join(BULD, ".env.local"), "utf8"));
  const supa = [];
  for (let i = 0; i < 3; i++) {
    const s = performance.now();
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/anime_localizations?select=anilist_id&anilist_id=in.(1,21,5114)`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } });
    await r.text();
    supa.push({ ms: round(performance.now() - s), status: r.status });
  }
  return { anilist, shikimori: shiki, supabase: supa };
}

async function browserFlow() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
  const page = await context.newPage();
  const js = { bytes: 0, files: 0 };
  page.on("response", async (r) => {
    if (r.url().includes("/_next/static/") && r.url().endsWith(".js")) {
      try { js.bytes += (await r.body()).length; js.files++; } catch {}
    }
  });
  const res = {};
  let s = performance.now();
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.getByRole("heading", { level: 2 }).first().waitFor();
  res.homeFirstLoad = round(performance.now() - s);
  res.homeJsKB = Math.round(js.bytes / 1024);
  res.homeJsFiles = js.files;

  // Клиентский переход: шапка → Каталог, ждём карточки.
  await page.waitForTimeout(800); // дать prefetch отработать, как у живого пользователя
  s = performance.now();
  await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link", { name: "Каталог" }).click();
  await page.waitForURL("**/catalog");
  const urlAt = performance.now();
  await page.getByTestId("anime-card").first().waitFor();
  res.navHomeToCatalog = { url: round(urlAt - s), cards: round(performance.now() - s) };

  // Фильтр по жанру (новые данные).
  const searchBox = page.getByLabel("Поиск по названию");
  s = performance.now();
  await searchBox.fill("frieren");
  await searchBox.press("Enter");
  await page.waitForURL(/q=frieren/);
  await page.waitForFunction(() => !!document.querySelector('[data-testid="anime-card"]') && !document.querySelector('[aria-busy="true"]'));
  res.searchEnterToResults = round(performance.now() - s);

  // Переход в тайтл по карточке.
  await page.waitForTimeout(500);
  // Как живой пользователь: курсор над карточкой ~300 мс до клика.
  const firstCard = page.getByTestId("anime-card").first().getByRole("link").first();
  await firstCard.hover();
  await page.waitForTimeout(300);
  s = performance.now();
  await firstCard.click();
  await page.waitForURL(/\/anime\/\d+/);
  const urlAnime = performance.now();
  await page.getByRole("heading", { level: 1 }).waitFor();
  const h1At = performance.now();
  // Полные данные: блок «Описание» (раздел детали) — в превью его нет.
  await page.getByRole("region", { name: "Описание" }).waitFor();
  res.navCardToAnime = { url: round(urlAnime - s), h1: round(h1At - s), full: round(performance.now() - s) };

  // Назад в каталог.
  s = performance.now();
  await page.goBack();
  await page.getByTestId("anime-card").first().waitFor();
  res.backToCatalog = round(performance.now() - s);

  // Второй тайтл из главной (переход главная → тайтл).
  await page.goto(BASE + "/");
  await page.waitForTimeout(800);
  const homeCard = page.getByTestId("anime-card").nth(3).getByRole("link").first();
  await homeCard.hover();
  await page.waitForTimeout(300);
  s = performance.now();
  await homeCard.click();
  await page.waitForURL(/\/anime\/\d+/);
  await page.getByRole("heading", { level: 1 }).waitFor();
  const homeH1At = performance.now();
  await page.getByRole("region", { name: "Описание" }).waitFor();
  res.navHomeCardToAnime = { h1: round(homeH1At - s), full: round(performance.now() - s) };
  const animeUrl = page.url();

  // Повторный заход на тот же тайтл: полная загрузка, до заголовка (без ожидания всех картинок CDN).
  s = performance.now();
  await page.goto(animeUrl, { waitUntil: "commit" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  res.repeatAnimeFullLoad = round(performance.now() - s);

  // «Загрузить ещё»: прокрутка к кнопке, пауза как при чтении, клик → новые карточки.
  await page.goto(BASE + "/catalog?sort=score");
  await page.getByTestId("anime-card").first().waitFor();
  const more = page.getByRole("button", { name: "Загрузить ещё" });
  await more.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const countBefore = await page.getByTestId("anime-card").count();
  s = performance.now();
  await more.click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="anime-card"]').length > n, countBefore);
  res.loadMore = round(performance.now() - s);

  res.totalJsKBSession = Math.round(js.bytes / 1024);
  await browser.close();
  return res;
}

try {
  const result = { label, at: new Date().toISOString(), upstream: await upstream(), server: await serverTimings(), browser: await browserFlow() };
  fs.mkdirSync(path.join(BULD, "test-results"), { recursive: true });
  fs.writeFileSync(path.join(BULD, "test-results", `perf-${label}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error);
  process.exit(1);
}
