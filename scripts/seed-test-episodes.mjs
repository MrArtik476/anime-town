// Тестовые серии для разработки плеера (ADR-022): `npm run seed:test-episodes` — добавить/обновить,
// `npm run seed:test-episodes -- --remove` — удалить. Нужен SUPABASE_SERVICE_ROLE_KEY (sb_secret_…).
//
// Это заглушки до выбора легального источника видео на этапе 8 — в названиях серий так и написано.
// Источники и лицензии (проверено 2026-11-01 на официальных страницах):
// - собственный ролик /media/test/ — сгенерирован scripts/build-test-hls.mjs, сторонних прав нет;
// - Big Buck Bunny — © 2008 Blender Foundation, CC BY 3.0 (peach.blender.org/about);
// - Tears of Steel — Blender Foundation, CC BY 3.0 (mango.blender.org/about).
// HLS-версии фильмов — тестовые потоки Mux (test-streams.mux.dev).
import fs from "node:fs";
import { parseEnv } from "node:util";

import { createClient } from "@supabase/supabase-js";

const env = { ...parseEnv(fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : ""), ...process.env };
const secret = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !secret?.startsWith("sb_secret_")) {
  console.error("Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY=sb_secret_…");
  process.exit(2);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false } });

/** Тайтл AniList, к которому привязаны заглушки: «Атака титанов» (16498). */
export const TEST_ANIME_ID = 16498;
const OWN_SUBTITLES = [
  { lang: "ru", label: "Русские", url: "/media/test/subtitles.ru.vtt", is_default: true },
  { lang: "en", label: "English", url: "/media/test/subtitles.en.vtt", is_default: false },
];
const EPISODES = [
  {
    number: 1,
    title: "Тестовое видео · ролик Anime Town (6 с)",
    duration_sec: 6,
    license_status: "own",
    hls_url: "/media/test/master.m3u8",
    attribution: null,
    attribution_url: null,
    subtitles: OWN_SUBTITLES,
  },
  {
    number: 2,
    title: "Тестовое видео · Big Buck Bunny",
    duration_sec: 596,
    license_status: "open_license",
    hls_url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    attribution: "Big Buck Bunny — © 2008 Blender Foundation · www.bigbuckbunny.org · CC BY 3.0",
    attribution_url: "https://peach.blender.org/about/",
    subtitles: [],
  },
  {
    number: 3,
    title: "Тестовое видео · Tears of Steel",
    duration_sec: 734,
    license_status: "open_license",
    hls_url: "https://test-streams.mux.dev/tos_ismc/main.m3u8",
    attribution: "Tears of Steel — Blender Foundation · mango.blender.org · CC BY 3.0",
    attribution_url: "https://mango.blender.org/about/",
    subtitles: [],
  },
];

if (process.argv.includes("--remove")) {
  const { error, count } = await admin.from("episodes").delete({ count: "exact" }).eq("anilist_id", TEST_ANIME_ID);
  if (error) throw error;
  console.log(`Удалено тестовых серий: ${count} (субтитры — каскадом)`);
  process.exit(0);
}

for (const { subtitles, ...episode } of EPISODES) {
  const { data, error } = await admin
    .from("episodes")
    .upsert({ anilist_id: TEST_ANIME_ID, ...episode }, { onConflict: "anilist_id,number" })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("subtitles").delete().eq("episode_id", data.id);
  if (subtitles.length) {
    const { error: subError } = await admin.from("subtitles").insert(subtitles.map((sub) => ({ ...sub, episode_id: data.id })));
    if (subError) throw subError;
  }
  console.log(`Серия ${episode.number}: ${episode.title} (${episode.license_status}), субтитров ${subtitles.length}`);
}
console.log(`Готово: /anime/${TEST_ANIME_ID}`);
