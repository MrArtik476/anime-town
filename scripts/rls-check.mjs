// Проверка RLS на НАСТОЯЩЕМ проекте Supabase через Data API и Storage (так, как ходит приложение):
// `npm run rls:check`. Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY и
// SUPABASE_SERVICE_ROLE_KEY (sb_secret_…) в .env.local.
// Создаёт двух временных пользователей (admin API), проверяет доступ от их сессий и от гостя,
// затем удаляет их файлы и самих пользователей (профили и строки списка — каскадом).
// Выводятся только результаты проверок, без ключей и токенов. Код выхода 1 — найдена дыра или сбой.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { parseEnv } from "node:util";

import { createClient } from "@supabase/supabase-js";

const env = { ...parseEnv(fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : ""), ...process.env };
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const SECRET = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL || !PUBLISHABLE || !SECRET?.startsWith("sb_secret_")) {
  console.error("Нужны NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY и SUPABASE_SERVICE_ROLE_KEY=sb_secret_…");
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SECRET, opts);
const anon = createClient(URL, PUBLISHABLE, opts);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4/7b+PwAIUQOYdg8rDwAAAABJRU5ErkJggg==",
  "base64",
);

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
const tag = randomUUID().slice(0, 8);
// Несуществующий тайтл для временных серий (удаляются в finally).
const PROBE_ANIME_ID = 999_999_990;
const created = [];

async function makeUser(letter) {
  const email = `rls-probe-${letter}-${tag}@example.invalid`;
  const password = `Probe-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `rlsprobe_${letter}_${tag}` },
  });
  if (error) throw new Error(`createUser ${letter}: ${error.message}`);
  created.push(data.user.id);
  const client = createClient(URL, PUBLISHABLE, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn ${letter}: ${signInError.message}`);
  return { id: data.user.id, client };
}

const rows = (response) => (response.error ? response.error.code : `строк: ${response.data?.length}`);
const blocked = (response) => !!response.error || response.data?.length === 0;

try {
  const A = await makeUser("a");
  const B = await makeUser("b");

  // ---- profiles ----
  const { data: profs } = await admin.from("profiles").select("username, role").in("id", [A.id, B.id]);
  check("триггер создал оба профиля с ролью user", profs?.length === 2 && profs.every((p) => p.role === "user"));
  check("A читает профиль B (публичные данные)", (await A.client.from("profiles").select("id").eq("id", B.id)).data?.length === 1);
  const updOther = await A.client.from("profiles").update({ display_name: "hacked" }).eq("id", B.id).select("id");
  check("A не меняет профиль B", blocked(updOther), rows(updOther));
  const updRole = await A.client.from("profiles").update({ role: "admin" }).eq("id", A.id).select("id");
  check("A не меняет свою роль", !!updRole.error, updRole.error?.code ?? "ИЗМЕНИЛ");
  check("A меняет своё имя", (await A.client.from("profiles").update({ display_name: "Проба" }).eq("id", A.id).select("id")).data?.length === 1);
  const insProfile = await A.client.from("profiles").insert({ id: randomUUID(), username: `forged_${tag}` });
  check("A не создаёт профили", !!insProfile.error, insProfile.error?.code ?? "СОЗДАЛ");
  const delProfile = await A.client.from("profiles").delete().eq("id", A.id).select("id");
  check("A не удаляет профиль", blocked(delProfile), rows(delProfile));

  // ---- anime_list ----
  const insB = await B.client.from("anime_list").insert({ user_id: B.id, anilist_id: 7, status: "watching", title: "B row" });
  check("B добавляет свою строку", !insB.error, insB.error?.code ?? "");
  const insA = await A.client.from("anime_list").insert({ user_id: A.id, anilist_id: 1, status: "planned", score: 8, title: "A row" });
  check("A добавляет свою строку", !insA.error, insA.error?.code ?? "");
  const listA = await A.client.from("anime_list").select("user_id");
  check("A видит только свои строки", listA.data?.length === 1 && listA.data[0].user_id === A.id, rows(listA));
  const forged = await A.client.from("anime_list").insert({ user_id: B.id, anilist_id: 2, status: "planned", title: "forged" });
  check("A не вставляет строку от имени B", !!forged.error, forged.error?.code ?? "ВСТАВИЛ");
  const updB = await A.client.from("anime_list").update({ score: 1 }).eq("user_id", B.id).select("anilist_id");
  check("A не меняет строки B", blocked(updB), rows(updB));
  const delB = await A.client.from("anime_list").delete().eq("user_id", B.id).select("anilist_id");
  check("A не удаляет строки B", blocked(delB), rows(delB));
  const move = await A.client.from("anime_list").update({ user_id: B.id }).eq("user_id", A.id).select("anilist_id");
  check("A не переносит свою строку на B", blocked(move), rows(move));
  const empty = await A.client.from("anime_list").insert({ user_id: A.id, anilist_id: 3, title: "empty" });
  check("пустая запись отклоняется", empty.error?.code === "23514", empty.error?.code ?? "ПРИНЯТА");
  const badScore = await A.client.from("anime_list").insert({ user_id: A.id, anilist_id: 4, score: 11, title: "x" });
  check("оценка 11 отклоняется", badScore.error?.code === "23514", badScore.error?.code ?? "ПРИНЯТА");

  // ---- anime_rating_stats: читают все, пишет только триггер ----
  const { data: stat } = await admin.from("anime_rating_stats").select("score_sum, score_count").eq("anilist_id", 1).maybeSingle();
  const { data: scores } = await admin.from("anime_list").select("score").eq("anilist_id", 1).not("score", "is", null);
  const expectedSum = (scores ?? []).reduce((sum, row) => sum + row.score, 0);
  check(
    "триггер ведёт сумму и число оценок",
    stat?.score_count === scores?.length && stat?.score_sum === expectedSum,
    `${stat?.score_sum}/${stat?.score_count}`,
  );
  const statWrite = await A.client.from("anime_rating_stats").update({ score_sum: 999 }).eq("anilist_id", 1).select("anilist_id");
  check("пользователь не меняет счётчик оценок", blocked(statWrite), rows(statWrite));
  const statAnon = await anon.from("anime_rating_stats").select("score_count").eq("anilist_id", 1);
  check("гость читает счётчик оценок", !statAnon.error && statAnon.data?.length === 1);
  const statInsert = await anon.from("anime_rating_stats").insert({ anilist_id: 999999998, score_sum: 10, score_count: 1 });
  check("гость не пишет счётчик оценок", !!statInsert.error, statInsert.error?.code ?? "ЗАПИСАЛ");

  // ---- Storage avatars: только своя папка ----
  const own = await A.client.storage.from("avatars").upload(`${A.id}/avatar`, PNG, { contentType: "image/png", upsert: true });
  check("A загружает аватар в свою папку", !own.error, own.error?.message ?? "");
  const bOwn = await B.client.storage.from("avatars").upload(`${B.id}/avatar`, PNG, { contentType: "image/png", upsert: true });
  check("B загружает аватар в свою папку", !bOwn.error, bOwn.error?.message ?? "");
  const foreign = await A.client.storage.from("avatars").upload(`${B.id}/avatar`, PNG, { contentType: "image/png", upsert: true });
  check("A не перезаписывает аватар B", !!foreign.error, foreign.error?.message ?? "ПЕРЕЗАПИСАЛ");
  const foreignRemove = await A.client.storage.from("avatars").remove([`${B.id}/avatar`]);
  const bStill = await admin.storage.from("avatars").list(B.id);
  check("A не удаляет аватар B", (foreignRemove.data?.length ?? 0) === 0 && bStill.data?.length === 1);
  const anonUpload = await anon.storage.from("avatars").upload(`${A.id}/anon`, PNG, { contentType: "image/png" });
  check("гость не загружает файлы", !!anonUpload.error, anonUpload.error?.message ?? "ЗАГРУЗИЛ");
  const svg = await A.client.storage.from("avatars").upload(`${A.id}/x.svg`, Buffer.from("<svg/>"), { contentType: "image/svg+xml" });
  check("бакет не принимает SVG", !!svg.error, svg.error?.message ?? "ПРИНЯЛ");
  const publicUrl = admin.storage.from("avatars").getPublicUrl(`${A.id}/avatar`).data.publicUrl;
  check("аватар доступен по публичной ссылке", (await fetch(publicUrl)).status === 200);

  // ---- episodes / subtitles: видны только серии с правами, пишет только сервер ----
  const { data: eps, error: epsError } = await admin
    .from("episodes")
    .insert([
      { anilist_id: PROBE_ANIME_ID, number: 1, license_status: "own", hls_url: "/media/test/master.m3u8" },
      { anilist_id: PROBE_ANIME_ID, number: 2, license_status: "none", hls_url: "/media/test/master.m3u8" },
    ])
    .select("id, number");
  if (epsError) throw new Error(`episodes seed: ${epsError.message}`);
  const hidden = eps.find((episode) => episode.number === 2);
  await admin.from("subtitles").insert(
    eps.map((episode) => ({ episode_id: episode.id, lang: "ru", label: "Русские", url: "/media/test/subtitles.ru.vtt" })),
  );
  const anonEps = await anon.from("episodes").select("number").eq("anilist_id", PROBE_ANIME_ID);
  check("гость видит только серии с правами", anonEps.data?.length === 1 && anonEps.data[0].number === 1, rows(anonEps));
  const anonSubs = await anon.from("subtitles").select("episode_id").eq("episode_id", hidden.id);
  check("субтитры серии без прав не видны", anonSubs.data?.length === 0, rows(anonSubs));
  const userEpInsert = await A.client.from("episodes").insert({ anilist_id: PROBE_ANIME_ID, number: 3, license_status: "own", hls_url: "/media/x.m3u8" });
  check("пользователь не добавляет серии", !!userEpInsert.error, userEpInsert.error?.code ?? "ДОБАВИЛ");
  const userEpUpdate = await A.client.from("episodes").update({ license_status: "none" }).eq("anilist_id", PROBE_ANIME_ID).select("id");
  check("пользователь не меняет серии", blocked(userEpUpdate), rows(userEpUpdate));
  const anonSubInsert = await anon.from("subtitles").insert({ episode_id: eps[0].id, lang: "en", label: "x", url: "/media/x.vtt" });
  check("гость не добавляет субтитры", !!anonSubInsert.error, anonSubInsert.error?.code ?? "ДОБАВИЛ");
  const badUrl = await admin.from("episodes").insert({ anilist_id: PROBE_ANIME_ID, number: 4, license_status: "own", hls_url: "http://evil.example/x.m3u8" });
  check("адрес плейлиста только https:// или /media/", badUrl.error?.code === "23514", badUrl.error?.code ?? "ПРИНЯТ");
  const noAttribution = await admin.from("episodes").insert({ anilist_id: PROBE_ANIME_ID, number: 5, license_status: "open_license", hls_url: "/media/x.m3u8" });
  check("открытая лицензия без атрибуции отклоняется", noAttribution.error?.code === "23514", noAttribution.error?.code ?? "ПРИНЯТА");

  // ---- anime_localizations: пишет только service role ----
  const trUser = await A.client.from("anime_localizations").update({ title_ru: "x" }).eq("anilist_id", 1).select("anilist_id");
  check("пользователь не меняет переводы", blocked(trUser), rows(trUser));

  // ---- гость ----
  check("гость читает профили", (await anon.from("profiles").select("id").in("id", [A.id, B.id])).data?.length === 2);
  const anonUpd = await anon.from("profiles").update({ display_name: "anon" }).eq("id", A.id).select("id");
  check("гость не меняет профили", blocked(anonUpd), rows(anonUpd));
  const anonList = await anon.from("anime_list").select("user_id");
  check("гость не читает списки", blocked(anonList), rows(anonList));
  const anonTr = await anon.from("anime_localizations").insert({ anilist_id: 999999999 });
  check("гость не пишет переводы", !!anonTr.error, anonTr.error?.code ?? "ЗАПИСАЛ");

  // ---- итог по данным ----
  const { data: bRow } = await admin.from("anime_list").select("score, status").eq("user_id", B.id).single();
  const { data: aProf } = await admin.from("profiles").select("role").eq("id", A.id).single();
  const { data: bProf } = await admin.from("profiles").select("display_name").eq("id", B.id).single();
  check(
    "данные B и роль A не изменились",
    bRow?.status === "watching" && bRow?.score === null && aProf?.role === "user" && bProf?.display_name === null,
  );
} catch (error) {
  results.push(`⚠️ сбой проверки: ${error.message}`);
} finally {
  await admin.from("episodes").delete().eq("anilist_id", PROBE_ANIME_ID);
  for (const id of created) {
    const { data: files } = await admin.storage.from("avatars").list(id);
    if (files?.length) await admin.storage.from("avatars").remove(files.map((file) => `${id}/${file.name}`));
    const { error } = await admin.auth.admin.deleteUser(id);
    results.push(error ? `⚠️ не удалён пользователь ${id.slice(0, 8)}: ${error.message}` : `🧹 удалён временный пользователь ${id.slice(0, 8)}`);
  }
  let filesLeft = 0;
  for (const id of created) filesLeft += (await admin.storage.from("avatars").list(id)).data?.length ?? 0;
  const { count: profilesLeft } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .like("username", `rlsprobe_%_${tag}`);
  const { count: episodesLeft } = await admin
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("anilist_id", PROBE_ANIME_ID);
  results.push(`🧹 осталось: профилей ${profilesLeft}, файлов аватаров ${filesLeft}, временных серий ${episodesLeft}`);
  console.log(results.join("\n"));
  if (results.some((line) => line.startsWith("❌") || line.startsWith("⚠️"))) process.exitCode = 1;
}
