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

async function makeModerator(letter) {
  const user = await makeUser(letter);
  const { error } = await admin.from("profiles").update({ role: "moderator" }).eq("id", user.id);
  if (error) throw new Error(`role ${letter}: ${error.message}`);
  return user;
}

const rows = (response) => (response.error ? response.error.code : `строк: ${response.data?.length}`);
const code = (response) => response.error?.code ?? `HTTP ${response.status}`;
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

  // ---- watch_progress: только свои строки, completed — ≥ 90 % ----
  const visibleEpisode = eps.find((episode) => episode.number === 1);
  const progressRow = (userId, position) => ({
    user_id: userId,
    episode_id: visibleEpisode.id,
    anilist_id: PROBE_ANIME_ID,
    episode_number: 1,
    position_sec: position,
    duration_sec: 100,
    title: "Проба",
  });
  const ownProgress = await A.client.from("watch_progress").upsert(progressRow(A.id, 95)).select("completed").single();
  check("A сохраняет свой прогресс; 95 % → completed", ownProgress.data?.completed === true, ownProgress.error?.code ?? "");
  const bProgress = await B.client.from("watch_progress").upsert(progressRow(B.id, 30)).select("completed").single();
  check("B сохраняет свой прогресс; 30 % → не completed", bProgress.data?.completed === false, bProgress.error?.code ?? "");
  const seeOthers = await A.client.from("watch_progress").select("user_id");
  check("A видит только свой прогресс", seeOthers.data?.length === 1 && seeOthers.data[0].user_id === A.id, rows(seeOthers));
  const forgedProgress = await A.client.from("watch_progress").upsert(progressRow(B.id, 1));
  check("A не пишет прогресс за B", !!forgedProgress.error, forgedProgress.error?.code ?? "ЗАПИСАЛ");
  const anonProgress = await anon.from("watch_progress").select("user_id");
  check("гость не читает прогресс", blocked(anonProgress), rows(anonProgress));
  const overflow = await A.client.from("watch_progress").upsert(progressRow(A.id, 500));
  check("позиция больше длительности отклоняется", overflow.error?.code === "23514", overflow.error?.code ?? "ПРИНЯТА");
  const setCompleted = await A.client.from("watch_progress").update({ completed: false }).eq("user_id", A.id);
  check("completed не задаётся вручную (вычисляется)", !!setCompleted.error, setCompleted.error?.code ?? "ЗАДАН");

  // ---- comments: ветка, права на колонки, мягкое удаление, флуд, баны, жалобы, действия модератора (ADR-025) ----
  const M = await makeModerator("m");
  const M2 = await makeModerator("n");
  const COVER = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/probe.jpg";
  const comment = (fields) => ({ anilist_id: PROBE_ANIME_ID, body: "Проба", anime_title: "Проба", anime_cover_url: COVER, ...fields });
  const insertComment = (client, fields) => client.from("comments").insert(comment(fields)).select("id, status, reply_count").single();
  const act = (client, fields) => client.from("moderation_actions").insert(fields).select("id").single();
  const journal = async (action, commentId) =>
    (await admin.from("moderation_actions").select("id").eq("action", action).eq("comment_id", commentId)).data?.length ?? 0;
  const journalFor = async (action, userId) =>
    (await admin.from("moderation_actions").select("id").eq("action", action).eq("target_user_id", userId)).data?.length ?? 0;

  const a1 = await insertComment(A.client, {});
  check("A пишет комментарий к тайтлу", !a1.error && a1.data?.status === "visible", code(a1));
  const b1 = await insertComment(B.client, {});
  check("B пишет комментарий к тайтлу", !b1.error, code(b1));
  const a2 = await insertComment(A.client, { parent_id: b1.data.id, reply_to_user_id: B.id });
  check("A отвечает B", !a2.error, code(a2));
  const b2 = await insertComment(B.client, { parent_id: b1.data.id, reply_to_user_id: A.id });
  check("B отвечает в своей ветке с @A", !b2.error, code(b2));
  const nested = await insertComment(B.client, { parent_id: a2.data.id });
  check("ответ на ответ — PT422 / HTTP 422", nested.error?.code === "PT422" && nested.status === 422, code(nested));
  const stranger = await insertComment(A.client, { parent_id: b1.data.id, reply_to_user_id: M.id });
  check("reply_to постороннего — PT422", stranger.error?.code === "PT422", code(stranger));
  const visibleEp = eps.find((episode) => episode.number === 1);
  const b3 = await insertComment(B.client, { episode_id: visibleEp.id });
  check("B пишет к видимой серии", !b3.error, code(b3));
  const crossToEpisode = await insertComment(A.client, { parent_id: b1.data.id, episode_id: visibleEp.id });
  check("ответ в чужую ветку (корень тайтла, ответ к серии) — PT422", crossToEpisode.error?.code === "PT422" && crossToEpisode.status === 422, code(crossToEpisode));
  const crossToTitle = await insertComment(A.client, { parent_id: b3.data.id });
  check("ответ в чужую ветку (корень серии, ответ к тайтлу) — PT422", crossToTitle.error?.code === "PT422" && crossToTitle.status === 422, code(crossToTitle));
  const otherAnime = await insertComment(B.client, { anilist_id: 1, episode_id: visibleEp.id });
  check("серия другого тайтла отклоняется", !!otherAnime.error, code(otherAnime));
  const hiddenEp = await insertComment(B.client, { episode_id: hidden.id });
  check("серия без прав отклоняется", !!hiddenEp.error, code(hiddenEp));
  const foreignCover = await insertComment(A.client, { anime_cover_url: "https://evil.example/file/anilistcdn/x.jpg" });
  check("обложка с чужого домена — 23514", foreignCover.error?.code === "23514", code(foreignCover));
  const longCover = await insertComment(A.client, { anime_cover_url: `${COVER}?${"x".repeat(500)}` });
  check("обложка длиннее 500 — 23514", longCover.error?.code === "23514", code(longCover));
  const tooLong = await insertComment(A.client, { body: "x".repeat(2001) });
  check("текст длиннее 2000 — 23514", tooLong.error?.code === "23514", code(tooLong));
  const forgedAuthor = await A.client.from("comments").insert(comment({ user_id: B.id }));
  check("A не пишет от имени B", !!forgedAuthor.error, code(forgedAuthor));
  const forgedStatus = await A.client.from("comments").insert(comment({ status: "hidden" }));
  check("статус при вставке не задаётся", forgedStatus.error?.code === "42501", code(forgedStatus));
  const anonComment = await anon.from("comments").insert(comment({}));
  check("гость не пишет комментарии", !!anonComment.error, code(anonComment));
  const anonRead = await anon.from("comments").select("id").eq("anilist_id", PROBE_ANIME_ID);
  check("гость читает видимые комментарии", anonRead.data?.length === 5, rows(anonRead));

  for (const [column, value] of [
    ["status", "deleted"],
    ["is_spoiler", true],
    ["parent_id", b1.data.id],
    ["reply_count", 99],
    ["anime_title", "Подмена"],
    ["anime_cover_url", COVER],
    ["user_id", B.id],
    ["anilist_id", 1],
  ]) {
    const response = await A.client.from("comments").update({ [column]: value }).eq("id", a1.data.id).select("id");
    check(`A не меняет ${column} своего комментария — 42501`, response.error?.code === "42501", code(response));
  }
  const edit = await A.client.from("comments").update({ body: "Исправлено" }).eq("id", a1.data.id).select("body, edited_at").single();
  check("A меняет текст — edited_at выставлен", edit.data?.body === "Исправлено" && edit.data?.edited_at !== null, code(edit));
  const editOther = await A.client.from("comments").update({ body: "чужое" }).eq("id", b1.data.id).select("id");
  check("A не правит комментарий B", blocked(editOther), rows(editOther));
  await A.client.from("comments").delete().eq("id", b1.data.id);
  const b1After = await admin.from("comments").select("status").eq("id", b1.data.id).single();
  check("A не удаляет комментарий B", b1After.data?.status === "visible", b1After.data?.status);
  const softDelete = await A.client.from("comments").delete().eq("id", a2.data.id);
  const a2After = await admin.from("comments").select("status, body").eq("id", a2.data.id).single();
  check(
    "delete — строка осталась со status deleted и body null",
    !softDelete.error && a2After.data?.status === "deleted" && a2After.data?.body === null,
    code(softDelete),
  );
  const rootCount = await admin.from("comments").select("reply_count").eq("id", b1.data.id).single();
  check("reply_count корня — только видимые ответы", rootCount.data?.reply_count === 1, `${rootCount.data?.reply_count}`);
  const previews = await anon.rpc("comment_reply_previews", { root_ids: [b1.data.id] });
  check("превью ответов: удалённый не показан", previews.data?.length === 1 && previews.data[0].id === b2.data.id, rows(previews));
  const tooMany = await anon.rpc("comment_reply_previews", { root_ids: Array.from({ length: 21 }, (_, i) => i + 1) });
  check("превью ответов: больше 20 корней — PT422", tooMany.error?.code === "PT422", code(tooMany));

  // Действия модератора — вставка в moderation_actions; журнал = выполненные действия.
  const notModerator = await act(A.client, { action: "hide", comment_id: b2.data.id });
  check("A не выполняет действия модератора — 42501", notModerator.error?.code === "42501", code(notModerator));
  check("после отказа комментарий не скрыт", (await admin.from("comments").select("status").eq("id", b2.data.id).single()).data?.status === "visible");
  const hide = await act(M.client, { action: "hide", comment_id: b2.data.id });
  check("M скрывает: эффект и одна строка журнала", !hide.error && (await journal("hide", b2.data.id)) === 1, code(hide));
  for (const [who, client, expected] of [
    ["гость", anon, 0],
    ["A", A.client, 0],
    ["автор B", B.client, 0],
    ["M", M.client, 1],
  ]) {
    const seen = await client.from("comments").select("id").eq("id", b2.data.id);
    check(`скрытый комментарий: ${who} видит ${expected}`, seen.data?.length === expected, rows(seen));
  }
  const hideAgain = await act(M.client, { action: "hide", comment_id: b2.data.id });
  check("hide скрытого — PT422, журнал не вырос", hideAgain.error?.code === "PT422" && (await journal("hide", b2.data.id)) === 1, code(hideAgain));
  const restore = await act(M.client, { action: "restore", comment_id: b2.data.id });
  const b2Restored = await admin.from("comments").select("status").eq("id", b2.data.id).single();
  check(
    "M возвращает скрытый: эффект и одна строка журнала",
    !restore.error && b2Restored.data?.status === "visible" && (await journal("restore", b2.data.id)) === 1,
    code(restore),
  );

  // Жалобы.
  const report = (client, commentId, reason = "spam") =>
    client.from("comment_reports").insert({ comment_id: commentId, reason }).select("id, status").single();
  const r1 = await report(A.client, b1.data.id);
  check("A жалуется на комментарий B", !r1.error && r1.data?.status === "open", code(r1));
  const r1Again = await report(A.client, b1.data.id, "offensive");
  check("повторная жалоба — 23505", r1Again.error?.code === "23505", code(r1Again));
  const ownReport = await report(B.client, b1.data.id);
  check("жалоба на свой комментарий — PT422", ownReport.error?.code === "PT422", code(ownReport));
  const r2 = await report(B.client, a1.data.id);
  check("B жалуется на комментарий A", !r2.error, code(r2));
  const aReports = await A.client.from("comment_reports").select("id");
  check("A видит только свои жалобы", aReports.data?.length === 1, rows(aReports));
  const mReports = await M.client.from("comment_reports").select("id").in("comment_id", [a1.data.id, b1.data.id]);
  check("M видит все жалобы", mReports.data?.length === 2, rows(mReports));
  const reportUpdate = await A.client.from("comment_reports").update({ status: "dismissed" }).eq("id", r1.data.id).select("id");
  check("A не меняет статус жалобы", !!reportUpdate.error || reportUpdate.data?.length === 0, code(reportUpdate));
  const dismiss = await act(M.client, { action: "dismiss_reports", comment_id: a1.data.id });
  const r2After = await admin.from("comment_reports").select("status, resolved_by").eq("id", r2.data.id).single();
  check(
    "dismiss_reports отклоняет жалобы: эффект и одна строка журнала",
    !dismiss.error && r2After.data?.status === "dismissed" && r2After.data?.resolved_by === M.id && (await journal("dismiss_reports", a1.data.id)) === 1,
    code(dismiss),
  );
  const dismissNone = await act(M.client, { action: "dismiss_reports", comment_id: a1.data.id });
  check(
    "dismiss_reports без открытых жалоб — PT422, журнал не вырос",
    dismissNone.error?.code === "PT422" && (await journal("dismiss_reports", a1.data.id)) === 1,
    code(dismissNone),
  );
  await act(M.client, { action: "hide", comment_id: b1.data.id });
  const r1After = await admin.from("comment_reports").select("status").eq("id", r1.data.id).single();
  check("скрытие закрывает жалобы (resolved)", r1After.data?.status === "resolved", r1After.data?.status);

  // Баны.
  const E = await makeUser("e");
  const directBan = await A.client.from("user_bans").insert({ user_id: E.id });
  check("A не пишет в user_bans — 42501", directBan.error?.code === "42501", code(directBan));
  const mDirectBan = await M.client.from("user_bans").insert({ user_id: E.id });
  check("M не пишет в user_bans напрямую", !!mDirectBan.error, code(mDirectBan));
  const banModerator = await act(M.client, { action: "ban", target_user_id: M2.id, ban_duration: "7d" });
  check("M не банит модератора — PT422", banModerator.error?.code === "PT422", code(banModerator));
  const banSelf = await act(M.client, { action: "ban", target_user_id: M.id, ban_duration: "1d" });
  check("M не банит себя — PT422", banSelf.error?.code === "PT422", code(banSelf));
  const banForeignComment = await act(M.client, { action: "ban", target_user_id: E.id, ban_duration: "1d", comment_id: b1.data.id });
  check("ban с comment_id чужого автора — PT422", banForeignComment.error?.code === "PT422", code(banForeignComment));
  const ban = await act(M.client, { action: "ban", target_user_id: E.id, ban_duration: "1d", reason: "проба" });
  const eBans = await E.client.from("user_bans").select("expires_at, moderator_id");
  check(
    "M банит E на 1 день: срок считает база, одна строка журнала",
    !ban.error &&
      eBans.data?.length === 1 &&
      Math.abs(Date.parse(eBans.data[0].expires_at) - Date.now() - 86_400_000) < 120_000 &&
      (await journalFor("ban", E.id)) === 1,
    code(ban),
  );
  check("A не видит баны E", (await A.client.from("user_bans").select("id").eq("user_id", E.id)).data?.length === 0);
  const unbanForeignComment = await act(M.client, { action: "unban", target_user_id: E.id, comment_id: b1.data.id });
  check("unban с чужим comment_id — PT422", unbanForeignComment.error?.code === "PT422", code(unbanForeignComment));
  const bannedWrite = await insertComment(E.client, {});
  check("забаненный не пишет — PT403 / HTTP 403", bannedWrite.error?.code === "PT403" && bannedWrite.status === 403, code(bannedWrite));
  const bannedReport = await report(E.client, b3.data.id);
  check("забаненный не жалуется — PT403 / HTTP 403", bannedReport.error?.code === "PT403" && bannedReport.status === 403, code(bannedReport));
  const unban = await act(M.client, { action: "unban", target_user_id: E.id });
  const afterUnban = await insertComment(E.client, {});
  check(
    "после unban пишет снова, одна строка журнала",
    !unban.error && !afterUnban.error && (await journalFor("unban", E.id)) === 1,
    `${code(unban)} / ${code(afterUnban)}`,
  );
  const unbanAgain = await act(M.client, { action: "unban", target_user_id: E.id });
  check(
    "unban без действующего бана — PT422, журнал не вырос",
    unbanAgain.error?.code === "PT422" && (await journalFor("unban", E.id)) === 1,
    code(unbanAgain),
  );

  // Страница корней (getCommentsPage): удалённый корень без ответов отсекает запрос, с ответами — остаётся.
  // Два or() в одном запросе (фильтр и курсор) PostgREST объединяет через «и».
  const lonely = await insertComment(A.client, {});
  const parent = await insertComment(A.client, {});
  await insertComment(B.client, { parent_id: parent.data.id });
  await A.client.from("comments").delete().in("id", [lonely.data.id, parent.data.id]);
  const page = await anon
    .from("comments")
    .select("id, status")
    .eq("anilist_id", PROBE_ANIME_ID)
    .is("episode_id", null)
    .is("parent_id", null)
    .or("status.neq.deleted,reply_count.gt.0")
    .or(`created_at.lt."2999-01-01T00:00:00Z",and(created_at.eq."2999-01-01T00:00:00Z",id.lt.1))`);
  const pageIds = new Set(page.data?.map((row) => row.id));
  check(
    "страница корней: удалённый без ответов отсечён, удалённый с ответами и видимый — на месте",
    !page.error && !pageIds.has(lonely.data.id) && pageIds.has(parent.data.id) && pageIds.has(a1.data.id),
    code(page),
  );
  const journalEdit = await M.client.from("moderation_actions").update({ reason: "подмена" }).eq("id", ban.data.id).select("id");
  check("M не меняет журнал", !!journalEdit.error || journalEdit.data?.length === 0, code(journalEdit));
  const journalDelete = await M.client.from("moderation_actions").delete().eq("id", ban.data.id).select("id");
  check("M не удаляет журнал", !!journalDelete.error || journalDelete.data?.length === 0, code(journalDelete));
  check("A не читает журнал", (await A.client.from("moderation_actions").select("id")).data?.length === 0);

  // Удаление аккаунта: ответ уходит каскадом, reply_count корня уменьшается.
  const X = await makeUser("x");
  const xReply = await insertComment(X.client, { parent_id: b3.data.id, episode_id: visibleEp.id });
  const b3Before = (await admin.from("comments").select("reply_count").eq("id", b3.data.id).single()).data?.reply_count;
  const { error: xDeleteError } = await admin.auth.admin.deleteUser(X.id);
  if (!xDeleteError) created.splice(created.indexOf(X.id), 1);
  const b3After = (await admin.from("comments").select("reply_count").eq("id", b3.data.id).single()).data?.reply_count;
  check("удаление аккаунта уменьшает reply_count корня", !xReply.error && b3Before === 1 && b3After === 0, `${b3Before} → ${b3After}`);

  // Удаление аккаунта с корнем и ответами: свой ответ и чужой уходят одним каскадом, триггер не падает.
  const Y = await makeUser("y");
  const yRoot = await insertComment(Y.client, {});
  const yOwnReply = await insertComment(Y.client, { parent_id: yRoot.data?.id });
  const aReplyToY = await insertComment(A.client, { parent_id: yRoot.data?.id, reply_to_user_id: Y.id });
  const { error: yDeleteError } = await admin.auth.admin.deleteUser(Y.id);
  if (!yDeleteError) created.splice(created.indexOf(Y.id), 1);
  const yLeft = await admin.from("comments").select("id").in("id", [yRoot.data?.id, yOwnReply.data?.id, aReplyToY.data?.id]);
  check(
    "удаление аккаунта с корнем и ответами — без ошибки, ветка удалена целиком",
    !yRoot.error && !yOwnReply.error && !aReplyToY.error && !yDeleteError && yLeft.data?.length === 0,
    yDeleteError?.message ?? rows(yLeft),
  );

  // Превью ответов: per_root зажат в 1…20, null — значение по умолчанию (3).
  const pRoot = await admin.from("comments").insert(comment({ user_id: M2.id })).select("id").single();
  for (let i = 0; i < 4; i += 1) await admin.from("comments").insert(comment({ user_id: M.id, parent_id: pRoot.data.id }));
  for (const [perRoot, expected] of [
    [null, 3],
    [100, 4],
    [0, 1],
  ]) {
    const preview = await anon.rpc("comment_reply_previews", { root_ids: [pRoot.data.id], per_root: perRoot });
    check(`превью ответов: per_root ${perRoot} → ${expected}`, preview.data?.length === expected, rows(preview));
  }

  // Флуд-лимит: 5 в минуту.
  const C = await makeUser("c");
  let serialOk = 0;
  for (let i = 0; i < 5; i += 1) if (!(await insertComment(C.client, {})).error) serialOk += 1;
  const sixth = await insertComment(C.client, {});
  check("6-й комментарий за минуту — PT429 / HTTP 429", serialOk === 5 && sixth.error?.code === "PT429" && sixth.status === 429, code(sixth));
  const D = await makeUser("d");
  const parallel = await Promise.all(Array.from({ length: 6 }, () => insertComment(D.client, {})));
  check("6 параллельных вставок — ровно 5 успешных", parallel.filter((r) => !r.error).length === 5, parallel.map(code).join(","));

  // ---- уведомления: создают только триггеры, клиент читает свои и меняет только read_at (ADR-026) ----
  // Свежие пользователи: у A/B выше уже много комментариев, флуд-лимит не должен мешать ответам.
  // Серии 1 и 2 вставлены выше, до того как получатели добавили тайтл в список, — уведомлений по ним нет.
  const NA = await makeUser("na");
  const NB = await makeUser("nb");
  const NC = await makeUser("nc");
  // Уведомления получателя по тайтлу пробы (admin видит всё; при ошибке data — undefined, проверки падают).
  const notesOf = async (userId, type) => {
    const response = await admin
      .from("notifications")
      .select("id, type, episode_number, comment_id, created_at, read_at")
      .eq("user_id", userId)
      .eq("anilist_id", PROBE_ANIME_ID)
      .eq("type", type)
      .order("id");
    return response.error ? { rows: undefined, error: response.error.code } : { rows: response.data, error: null };
  };
  const notesDetail = (notes) => notes.error ?? `строк: ${notes.rows.length}, номера: ${notes.rows.map((row) => row.episode_number).join(",")}`;
  const addEpisodes = async (numbers, licenseStatus = "own") => {
    const { data, error } = await admin
      .from("episodes")
      .insert(numbers.map((number) => ({ anilist_id: PROBE_ANIME_ID, number, license_status: licenseStatus, hls_url: "/media/test/master.m3u8" })))
      .select("id, number");
    if (error) throw new Error(`episodes ${numbers.join(",")}: ${error.message}`);
    return data;
  };
  const watch = async (user) => {
    const { error } = await user.client
      .from("anime_list")
      .insert({ user_id: user.id, anilist_id: PROBE_ANIME_ID, status: "watching", title: "Проба", cover_url: COVER });
    if (error) throw new Error(`anime_list ${user.id.slice(0, 8)}: ${error.message}`);
  };

  // Ответы. NB отвечает в ветке NA с @NA: автор корня и reply_to совпадают — одно уведомление.
  const naRoot = await insertComment(NA.client, {});
  if (naRoot.error) throw new Error(`comment NA: ${naRoot.error.message}`);
  const nbReply = await insertComment(NB.client, { parent_id: naRoot.data.id, reply_to_user_id: NA.id });
  const replyNotes = await notesOf(NA.id, "reply");
  const replyToA = replyNotes.rows?.filter((row) => row.comment_id === nbReply.data?.id).length;
  check("ответ B создал уведомление A", !nbReply.error && replyToA === 1, `${code(nbReply)} / ${replyNotes.error ?? `уведомлений: ${replyToA}`}`);
  const naSelfReply = await insertComment(NA.client, { parent_id: naRoot.data.id });
  const selfNotes = await admin.from("notifications").select("id").eq("comment_id", naSelfReply.data?.id ?? 0);
  check(
    "ответ себе — без уведомления",
    !naSelfReply.error && !selfNotes.error && selfNotes.data?.length === 0,
    `${code(naSelfReply)} / ${rows(selfNotes)}`,
  );
  // У NB тоже есть уведомление (для проверки «A не видит уведомления B»).
  const nbRoot = await insertComment(NB.client, {});
  if (nbRoot.error) throw new Error(`comment NB: ${nbRoot.error.message}`);
  await insertComment(NA.client, { parent_id: nbRoot.data.id });

  // Настройки: NA — всё включено (своя строка есть), NB выключает новые серии.
  const naPrefs = await NA.client.from("notification_prefs").upsert({ reply: true, new_episode: true }, { onConflict: "user_id" }).select("user_id");
  const nbPrefs = await NB.client.from("notification_prefs").upsert({ reply: true, new_episode: false }, { onConflict: "user_id" }).select("user_id");

  // Новые серии. NA и NB держат тайтл в «Смотрю»; NC добавит его позже — для пакетной вставки.
  await watch(NA);
  await watch(NB);
  await addEpisodes([3]);
  await addEpisodes([4]);
  const afterTwo = await notesOf(NA.id, "new_episode");
  check(
    "2 серии подряд — одно непрочитанное, номер последней",
    afterTwo.rows?.length === 1 && afterTwo.rows[0].episode_number === 4 && afterTwo.rows[0].read_at === null,
    notesDetail(afterTwo),
  );

  // Серия без прав не уведомляет; стала видимой (none → own) — то же непрочитанное с её номером.
  const [ep5] = await addEpisodes([5], "none");
  const afterNone = await notesOf(NA.id, "new_episode");
  const { error: ep5Error } = await admin.from("episodes").update({ license_status: "own" }).eq("id", ep5.id);
  if (ep5Error) throw new Error(`episode 5 → own: ${ep5Error.message}`);
  const afterVisible = await notesOf(NA.id, "new_episode");
  check(
    "серия без прав не уведомляет, стала видимой (none → own) — то же уведомление с её номером",
    afterNone.rows?.length === 1 &&
      afterNone.rows[0].episode_number === 4 &&
      afterVisible.rows?.length === 1 &&
      afterVisible.rows[0].id === afterNone.rows[0].id &&
      afterVisible.rows[0].episode_number === 5,
    `${notesDetail(afterNone)} → ${notesDetail(afterVisible)}`,
  );

  await watch(NC);
  await addEpisodes([6, 7, 8]);
  const batchNC = await notesOf(NC.id, "new_episode");
  const batchNA = await notesOf(NA.id, "new_episode");
  check(
    "пакетная вставка 3 серий одним insert — одно уведомление с номером последней",
    batchNC.rows?.length === 1 && batchNC.rows[0].episode_number === 8 && batchNA.rows?.length === 1 && batchNA.rows[0].episode_number === 8,
    `NC ${notesDetail(batchNC)}; NA ${notesDetail(batchNA)}`,
  );

  // Повторный upsert видимой серии (как seed:test-episodes) — update-триггер, но own → own ничего не создаёт.
  const snapshot = (notes) => JSON.stringify(notes.rows);
  const beforeUpsert = [await notesOf(NA.id, "new_episode"), await notesOf(NC.id, "new_episode")];
  const { error: upsertError } = await admin
    .from("episodes")
    .upsert({ anilist_id: PROBE_ANIME_ID, number: 8, license_status: "own", hls_url: "/media/test/master.m3u8" }, { onConflict: "anilist_id,number" });
  if (upsertError) throw new Error(`episode 8 upsert: ${upsertError.message}`);
  const afterUpsert = [await notesOf(NA.id, "new_episode"), await notesOf(NC.id, "new_episode")];
  check(
    "повторный upsert own→own — без новых",
    beforeUpsert.every((notes) => notes.rows?.length === 1) && afterUpsert.every((notes, i) => !notes.error && snapshot(notes) === snapshot(beforeUpsert[i])),
    afterUpsert.map(notesDetail).join("; "),
  );

  // Прочитать (клиентом NA) — следующая серия создаёт новую строку.
  const readEpisode = await NA.client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", afterUpsert[0].rows?.[0]?.id ?? 0)
    .select("id");
  await addEpisodes([9]);
  const afterRead = await notesOf(NA.id, "new_episode");
  check(
    "после прочтения новая серия — новая строка",
    readEpisode.data?.length === 1 &&
      afterRead.rows?.length === 2 &&
      afterRead.rows[0].read_at !== null &&
      afterRead.rows[1].read_at === null &&
      afterRead.rows[1].episode_number === 9,
    `${rows(readEpisode)} / ${notesDetail(afterRead)}`,
  );

  // NB выключил новые серии: те же события дали уведомления NA и NC, а NB — ничего.
  const nbEpisodes = await notesOf(NB.id, "new_episode");
  check(
    "настройка выключена — уведомления нет",
    nbPrefs.data?.length === 1 && nbEpisodes.rows?.length === 0 && afterRead.rows?.length === 2,
    `${rows(nbPrefs)} / ${notesDetail(nbEpisodes)}`,
  );

  // Доступ клиента.
  const nbAllNotes = await admin.from("notifications").select("id").eq("user_id", NB.id);
  const naSeesB = await NA.client.from("notifications").select("id").eq("user_id", NB.id);
  const naSeesOwn = await NA.client.from("notifications").select("id, user_id");
  check(
    "A не видит уведомления B",
    nbAllNotes.data?.length >= 1 &&
      !naSeesB.error &&
      naSeesB.data?.length === 0 &&
      naSeesOwn.data?.length >= 1 &&
      naSeesOwn.data.every((row) => row.user_id === NA.id),
    `у B ${rows(nbAllNotes)} / A про B ${rows(naSeesB)} / A свои ${rows(naSeesOwn)}`,
  );
  const forgedNote = await NA.client.from("notifications").insert({ user_id: NA.id, type: "new_episode", anilist_id: PROBE_ANIME_ID, episode_number: 1 });
  check("A не вставляет уведомление", forgedNote.error?.code === "42501", code(forgedNote));

  const replyNoteId = replyNotes.rows?.[0]?.id ?? 0;
  const readReply = await NA.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", replyNoteId).select("id, read_at");
  const forbidden = [];
  for (const [column, value] of [
    ["episode_number", 42],
    ["type", "new_episode"],
    ["user_id", NB.id],
    ["read_at", null],
  ]) {
    const response = await NA.client.from("notifications").update({ [column]: value }).eq("id", replyNoteId).select("id");
    forbidden.push(`${column}: ${code(response)}`);
  }
  check(
    "A меняет только read_at",
    readReply.data?.length === 1 && readReply.data[0].read_at !== null && forbidden.every((line) => line.endsWith(": 42501")),
    `read_at ${rows(readReply)}; ${forbidden.join(", ")}`,
  );

  const nbPrefsRow = await admin.from("notification_prefs").select("new_episode").eq("user_id", NB.id);
  const naReadsB = await NA.client.from("notification_prefs").select("user_id").eq("user_id", NB.id);
  const naReadsOwn = await NA.client.from("notification_prefs").select("user_id");
  check(
    "A не читает настройки B",
    nbPrefsRow.data?.length === 1 &&
      !naReadsB.error &&
      naReadsB.data?.length === 0 &&
      naPrefs.data?.length === 1 &&
      naReadsOwn.data?.length === 1 &&
      naReadsOwn.data[0].user_id === NA.id,
    `у B ${rows(nbPrefsRow)} / A про B ${rows(naReadsB)} / A свои ${rows(naReadsOwn)}`,
  );
  const naEditsB = await NA.client.from("notification_prefs").update({ new_episode: true }).eq("user_id", NB.id).select("user_id");
  const nbPrefsAfter = await admin.from("notification_prefs").select("new_episode").eq("user_id", NB.id).single();
  check(
    "A не меняет настройки B",
    !naEditsB.error && naEditsB.data?.length === 0 && nbPrefsAfter.data?.new_episode === false,
    `${rows(naEditsB)} / у B new_episode ${nbPrefsAfter.data?.new_episode ?? code(nbPrefsAfter)}`,
  );

  // Флуд-лимит в этом блоке (5 в минуту): NA 3, NB 2, NC 3, ND 4 комментария; NE не пишет.
  const notesForComment = (commentId) => admin.from("notifications").select("id, user_id, type, title, cover_url, read_at").eq("comment_id", commentId ?? 0);
  // NC отвечает в ветке NA с @NB (у NB там есть ответ): автор корня и упомянутый — по одному уведомлению.
  // В ответе чужой снимок («Подделка» и другая обложка): получателям достаётся снимок их собственного комментария.
  const FAKE_COVER = "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/fake.jpg";
  const ncMention = await insertComment(NC.client, {
    parent_id: naRoot.data.id,
    reply_to_user_id: NB.id,
    anime_title: "Подделка",
    anime_cover_url: FAKE_COVER,
  });
  const mentionNotes = await notesForComment(ncMention.data?.id);
  const mentionTo = (userId) => mentionNotes.data?.filter((row) => row.user_id === userId).length;
  check(
    "ответ с reply_to уведомляет и автора корня, и упомянутого",
    !ncMention.error && mentionNotes.data?.length === 2 && mentionTo(NA.id) === 1 && mentionTo(NB.id) === 1,
    `${code(ncMention)} / ${mentionNotes.error?.code ?? `NA ${mentionTo(NA.id)}, NB ${mentionTo(NB.id)}, всего ${mentionNotes.data?.length}`}`,
  );
  const coverName = (url) => (url === COVER ? "COVER" : url === FAKE_COVER ? "чужая" : `${url}`);
  check(
    "чужой снимок не попадает в уведомление",
    mentionNotes.data?.length === 2 && mentionNotes.data.every((row) => row.type === "reply" && row.title === "Проба" && row.cover_url === COVER),
    mentionNotes.error?.code ?? (mentionNotes.data?.map((row) => `${row.title} / ${coverName(row.cover_url)}`).join("; ") || "строк: 0"),
  );

  // ND отвечает NA дважды; NA читает первое уведомление; ND удаляет оба ответа (мягко — status deleted).
  // Непрочитанное уведомление о втором уходит, прочитанное о первом остаётся.
  const ND = await makeUser("nd");
  const nd1 = await insertComment(ND.client, { parent_id: naRoot.data.id });
  const nd2 = await insertComment(ND.client, { parent_id: naRoot.data.id });
  const nd1Before = await notesForComment(nd1.data?.id);
  const nd2Before = await notesForComment(nd2.data?.id);
  const readNd1 = await NA.client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", nd1Before.data?.[0]?.id ?? 0)
    .select("id");
  const ndIds = [nd1.data?.id ?? 0, nd2.data?.id ?? 0];
  const ndDelete = await ND.client.from("comments").delete().in("id", ndIds);
  const ndStatuses = await admin.from("comments").select("status").in("id", ndIds);
  const nd1After = await notesForComment(nd1.data?.id);
  const nd2After = await notesForComment(nd2.data?.id);
  check(
    "скрытие/удаление ответа убирает только непрочитанные уведомления",
    !nd1.error &&
      !nd2.error &&
      nd1Before.data?.length === 1 &&
      nd2Before.data?.length === 1 &&
      nd2Before.data[0].read_at === null &&
      readNd1.data?.length === 1 &&
      !ndDelete.error &&
      ndStatuses.data?.length === 2 &&
      ndStatuses.data.every((row) => row.status === "deleted") &&
      nd1After.data?.length === 1 &&
      nd1After.data[0].read_at !== null &&
      !nd2After.error &&
      nd2After.data?.length === 0,
    `до: ${rows(nd1Before)} и ${rows(nd2Before)}; прочитано ${rows(readNd1)}; delete ${code(ndDelete)}, статусы ${ndStatuses.data?.map((row) => row.status).join(",") ?? code(ndStatuses)}; после: прочитанное ${rows(nd1After)}, непрочитанное ${rows(nd2After)}`,
  );

  // Модератор скрывает ответ (moderation_actions hide) — его непрочитанное уведомление уходит.
  const ncHidden = await insertComment(NC.client, { parent_id: naRoot.data.id });
  const hiddenBefore = await notesForComment(ncHidden.data?.id);
  const modHide = await act(M.client, { action: "hide", comment_id: ncHidden.data?.id ?? 0 });
  const hiddenStatus = await admin.from("comments").select("status").eq("id", ncHidden.data?.id ?? 0).single();
  const hiddenAfter = await notesForComment(ncHidden.data?.id);
  check(
    "скрытие ответа модератором убирает его непрочитанное уведомление",
    !ncHidden.error &&
      hiddenBefore.data?.length === 1 &&
      hiddenBefore.data[0].read_at === null &&
      !modHide.error &&
      hiddenStatus.data?.status === "hidden" &&
      !hiddenAfter.error &&
      hiddenAfter.data?.length === 0,
    `до: ${rows(hiddenBefore)}; hide ${code(modHide)}, статус ${hiddenStatus.data?.status ?? code(hiddenStatus)}; после: ${rows(hiddenAfter)}`,
  );

  // NC выключает ответы: ND отвечает в ветке NC до и после — уведомление только о первом ответе.
  const ncRoot = await insertComment(NC.client, {});
  if (ncRoot.error) throw new Error(`comment NC: ${ncRoot.error.message}`);
  const ndBeforeOff = await insertComment(ND.client, { parent_id: ncRoot.data.id });
  const onNotes = await notesForComment(ndBeforeOff.data?.id);
  const ncPrefs = await NC.client.from("notification_prefs").upsert({ reply: false, new_episode: true }, { onConflict: "user_id" }).select("reply");
  const ndAfterOff = await insertComment(ND.client, { parent_id: ncRoot.data.id });
  const offNotes = await notesForComment(ndAfterOff.data?.id);
  check(
    "настройка ответов выключена — уведомления об ответе нет",
    !ndBeforeOff.error &&
      onNotes.data?.length === 1 &&
      onNotes.data[0].user_id === NC.id &&
      ncPrefs.data?.length === 1 &&
      ncPrefs.data[0].reply === false &&
      !ndAfterOff.error &&
      !offNotes.error &&
      offNotes.data?.length === 0,
    `включено: ${rows(onNotes)}; prefs ${ncPrefs.data?.[0]?.reply ?? code(ncPrefs)}; выключено: ${code(ndAfterOff)} / ${rows(offNotes)}`,
  );

  // NE держит тайтл с обложкой чужого домена (anime_list проверяет только https://): серия вставляется,
  // у NE — уведомление с cover_url null; у NA обложка anilist сохранилась (фильтр не режет всё подряд).
  const NE = await makeUser("ne");
  const evilList = await NE.client
    .from("anime_list")
    .insert({ user_id: NE.id, anilist_id: PROBE_ANIME_ID, status: "watching", title: "Проба", cover_url: "https://evil.example/x.jpg" });
  const ep10 = await admin
    .from("episodes")
    .insert({ anilist_id: PROBE_ANIME_ID, number: 10, license_status: "own", hls_url: "/media/test/master.m3u8" })
    .select("id");
  const coverNotes = await admin
    .from("notifications")
    .select("user_id, episode_number, title, cover_url")
    .in("user_id", [NE.id, NA.id])
    .eq("anilist_id", PROBE_ANIME_ID)
    .eq("type", "new_episode")
    .is("read_at", null);
  const neNote = coverNotes.data?.filter((row) => row.user_id === NE.id);
  const naNote = coverNotes.data?.filter((row) => row.user_id === NA.id);
  check(
    "обложка с чужого домена в anime_list — в уведомлении null",
    !evilList.error &&
      !ep10.error &&
      ep10.data?.length === 1 &&
      neNote?.length === 1 &&
      neNote[0].episode_number === 10 &&
      neNote[0].title === "Проба" &&
      neNote[0].cover_url === null &&
      naNote?.length === 1 &&
      naNote[0].episode_number === 10 &&
      naNote[0].cover_url === COVER,
    `anime_list ${code(evilList)}; серия 10 ${code(ep10)}; NE ${neNote?.map((row) => `${row.episode_number} / ${row.cover_url}`).join(",") ?? coverNotes.error?.code}; NA ${naNote?.map((row) => `${row.episode_number} / ${coverName(row.cover_url)}`).join(",") ?? coverNotes.error?.code}`,
  );

  // ---- anime_localizations: пишет только service role ----
  const trUser = await A.client.from("anime_localizations").update({ title_ru: "x" }).eq("anilist_id", 1).select("anilist_id");
  check("пользователь не меняет переводы", blocked(trUser), rows(trUser));

  // ---- translation_runs: журнал фонового перевода и блокировка — только service role (ADR-024) ----
  for (const [who, client] of [
    ["пользователь", A.client],
    ["гость", anon],
  ]) {
    const read = await client.from("translation_runs").select("id").limit(1);
    check(`${who} не читает журнал перевода`, blocked(read), rows(read));
    const write = await client.from("translation_runs").insert({ trigger: "manual" });
    check(`${who} не пишет журнал перевода`, !!write.error, write.error?.code ?? "ЗАПИСАЛ");
    const lock = await client.rpc("begin_translation_run", { p_trigger: "manual" });
    check(`${who} не берёт блокировку перевода`, !!lock.error, lock.error?.code ?? "ВЗЯЛ");
  }

  // ---- Edge Function translate-cron: без верного x-cron-secret — 401, перевод не запускается ----
  const cronUrl = `${URL}/functions/v1/translate-cron`;
  const userToken = (await A.client.auth.getSession()).data.session?.access_token;
  for (const [name, headers] of [
    ["без заголовков", {}],
    ["с publishable-ключом", { apikey: PUBLISHABLE }],
    ["с JWT пользователя", { Authorization: `Bearer ${userToken}` }],
    ["с неверным секретом", { "x-cron-secret": `wrong-${tag}` }],
  ]) {
    const response = await fetch(cronUrl, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: "{}" });
    check(`translate-cron ${name} — 401`, response.status === 401, `HTTP ${response.status}`);
  }

  // ---- гость ----
  check("гость читает профили", (await anon.from("profiles").select("id").in("id", [A.id, B.id])).data?.length === 2);
  const anonUpd = await anon.from("profiles").update({ display_name: "anon" }).eq("id", A.id).select("id");
  check("гость не меняет профили", blocked(anonUpd), rows(anonUpd));
  const anonList = await anon.from("anime_list").select("user_id");
  check("гость не читает списки", blocked(anonList), rows(anonList));
  const anonTr = await anon.from("anime_localizations").insert({ anilist_id: 999999999 });
  check("гость не пишет переводы", !!anonTr.error, anonTr.error?.code ?? "ЗАПИСАЛ");

  // ---- админ-панель (миграция admin): серии, субтитры, роли ----
  const AD = await makeUser("ad");
  const AT = await makeUser("at");
  {
    const { error } = await admin.from("profiles").update({ role: "admin" }).eq("id", AD.id);
    if (error) throw new Error(`role ad: ${error.message}`);
  }
  const draft = { anilist_id: PROBE_ANIME_ID, number: 90, license_status: "none", hls_url: "/media/test/master.m3u8" };
  const adminDraft = await AD.client.from("episodes").insert(draft).select("id").single();
  check("админ создаёт серию-черновик", !adminDraft.error && !!adminDraft.data?.id, code(adminDraft));
  const draftId = adminDraft.data?.id ?? -1;
  check("админ видит черновик", (await AD.client.from("episodes").select("id").eq("id", draftId)).data?.length === 1);
  check("пользователь не видит черновик", (await AT.client.from("episodes").select("id").eq("id", draftId)).data?.length === 0);
  check("модератор не видит черновик", (await M.client.from("episodes").select("id").eq("id", draftId)).data?.length === 0);
  check("гость не видит черновик", (await anon.from("episodes").select("id").eq("id", draftId)).data?.length === 0);
  const modEpInsert = await M.client.from("episodes").insert({ ...draft, number: 91 }).select("id");
  check("модератор не создаёт серии", !!modEpInsert.error, code(modEpInsert));
  const userEpDelete = await AT.client.from("episodes").delete().eq("id", draftId).select("id");
  check("пользователь не удаляет серии", blocked(userEpDelete), rows(userEpDelete));
  const adminEpUpdate = await AD.client.from("episodes").update({ title: "Проба" }).eq("id", draftId).select("title");
  check("админ меняет серию", adminEpUpdate.data?.[0]?.title === "Проба", code(adminEpUpdate));
  const moveEpisode = await AD.client.from("episodes").update({ anilist_id: PROBE_ANIME_ID - 1 }).eq("id", draftId).select("id");
  check("админ не переносит серию в другой тайтл", !!moveEpisode.error, code(moveEpisode));
  const forgedId = await AD.client.from("episodes").insert({ ...draft, number: 92, created_at: "2000-01-01T00:00:00Z" }).select("id");
  check("админ не задаёт служебные колонки серии", !!forgedId.error, code(forgedId));

  const subtitle = { episode_id: draftId, lang: "ru", label: "Русские", url: "/media/test/subtitles.ru.vtt", is_default: true };
  const adminSub = await AD.client.from("subtitles").insert(subtitle).select("id").single();
  check("админ добавляет субтитры", !adminSub.error && !!adminSub.data?.id, code(adminSub));
  const userSub = await AT.client.from("subtitles").insert({ ...subtitle, lang: "en" }).select("id");
  check("пользователь не добавляет субтитры", !!userSub.error, code(userSub));
  check("пользователь не видит субтитры черновика", (await AT.client.from("subtitles").select("id").eq("episode_id", draftId)).data?.length === 0);
  const adminSubDelete = await AD.client.from("subtitles").delete().eq("id", adminSub.data?.id ?? -1).select("id");
  check("админ удаляет субтитры", adminSubDelete.data?.length === 1, code(adminSubDelete));
  const adminEpDelete = await AD.client.from("episodes").delete().eq("id", draftId).select("id");
  check("админ удаляет серию", adminEpDelete.data?.length === 1, code(adminEpDelete));

  // Роли — только вставкой в admin_actions.
  const setRole = (client, fields) => client.from("admin_actions").insert({ action: "set_role", ...fields }).select("id, admin_id, old_role, new_role").single();
  const roleOf = async (id) => (await admin.from("profiles").select("role").eq("id", id).single()).data?.role;
  const directRole = await AD.client.from("profiles").update({ role: "moderator" }).eq("id", AT.id).select("id");
  check("админ не меняет роль напрямую в profiles", blocked(directRole) && (await roleOf(AT.id)) === "user", rows(directRole));
  const userPromote = await AT.client.from("admin_actions").insert({ action: "set_role", target_user_id: AT.id, new_role: "admin" });
  check("пользователь не назначает роли", userPromote.error?.code === "42501" && (await roleOf(AT.id)) === "user", code(userPromote));
  const modPromote = await M.client.from("admin_actions").insert({ action: "set_role", target_user_id: M.id, new_role: "admin" });
  check("модератор не назначает роли", modPromote.error?.code === "42501" && (await roleOf(M.id)) === "moderator", code(modPromote));
  const anonPromote = await anon.from("admin_actions").insert({ action: "set_role", target_user_id: AT.id, new_role: "admin" });
  check("гость не назначает роли", !!anonPromote.error, code(anonPromote));
  const ownRole = await setRole(AD.client, { target_user_id: AD.id, new_role: "user" });
  check("админ не меняет свою роль", ownRole.error?.code === "PT422" && (await roleOf(AD.id)) === "admin", code(ownRole));
  const sameRole = await setRole(AD.client, { target_user_id: AT.id, new_role: "user" });
  check("та же роль — отказ", sameRole.error?.code === "PT422", code(sameRole));
  const badRole = await setRole(AD.client, { target_user_id: AT.id, new_role: "owner" });
  check("неизвестная роль — отказ", !!badRole.error, code(badRole));
  const forgedAdmin = await AD.client.from("admin_actions").insert({ action: "set_role", target_user_id: AT.id, new_role: "moderator", admin_id: AT.id });
  check("админ не подставляет чужой admin_id", !!forgedAdmin.error && (await roleOf(AT.id)) === "user", code(forgedAdmin));
  const promote = await setRole(AD.client, { target_user_id: AT.id, new_role: "moderator" });
  check(
    "админ назначает модератора: роль применена, журнал заполнен",
    !promote.error && promote.data?.admin_id === AD.id && promote.data?.old_role === "user" && promote.data?.new_role === "moderator" && (await roleOf(AT.id)) === "moderator",
    code(promote),
  );
  check("админ читает журнал", (await AD.client.from("admin_actions").select("id").eq("target_user_id", AT.id)).data?.length === 1);
  check("модератор не читает журнал админа", blocked(await AT.client.from("admin_actions").select("id")));
  check("гость не читает журнал админа", blocked(await anon.from("admin_actions").select("id")));
  const logEdit = await AD.client.from("admin_actions").update({ new_role: "admin" }).eq("id", promote.data?.id ?? -1).select("id");
  check("админ не правит журнал", blocked(logEdit), rows(logEdit));
  const logDelete = await AD.client.from("admin_actions").delete().eq("id", promote.data?.id ?? -1).select("id");
  check("админ не удаляет журнал", blocked(logDelete), rows(logDelete));

  // ---- модерация из админки (этап 6b, ADR-028): администратор читает журнал, все жалобы и все баны, снимает бан ----
  // Новых политик нет: private.is_moderator() включает роль admin. Проверяем, что этого хватает и что лишнего не открыто.
  {
    const MB = await makeUser("mb");
    const MC = await makeUser("mc");
    const probe = await insertComment(MC.client, {});
    const probeReport = await report(MB.client, probe.data?.id ?? -1);
    const probeBan = await act(M.client, { action: "ban", target_user_id: MB.id, ban_duration: "7d", reason: "проба 6b" });
    if (probe.error || probeReport.error || probeBan.error) {
      throw new Error(`подготовка блока 6b: ${code(probe)} / ${code(probeReport)} / ${code(probeBan)}`);
    }
    const banRows = (client) => client.from("user_bans").select("id, revoked_at, revoked_by").eq("user_id", MB.id);
    const reportRows = (client) => client.from("comment_reports").select("id, status").eq("reporter_id", MB.id);
    const logRows = (client) => client.from("moderation_actions").select("id, action, moderator_id").eq("target_user_id", MB.id);

    const adLog = await logRows(AD.client);
    check(
      "админ читает журнал модераторов",
      adLog.data?.length === 1 && adLog.data[0].action === "ban" && adLog.data[0].moderator_id === M.id,
      rows(adLog),
    );
    check("админ читает чужой бан", (await banRows(AD.client)).data?.length === 1);
    check("админ читает чужую жалобу", (await reportRows(AD.client)).data?.length === 1);
    // Принято в ADR-028: политика этапа 5 не менялась, модератор журнал читает (страница админки ему при этом 404).
    check("модератор читает журнал — принятое поведение (ADR-028)", (await logRows(M2.client)).data?.length === 1);
    check(
      "пользователь не читает журнал, чужой бан и чужую жалобу",
      blocked(await logRows(A.client)) && blocked(await banRows(A.client)) && blocked(await reportRows(A.client)),
    );
    check(
      "гость не читает журнал, баны и жалобы",
      blocked(await logRows(anon)) && blocked(await banRows(anon)) && blocked(await reportRows(anon)),
    );

    const banId = (await banRows(admin)).data?.[0]?.id ?? -1;
    const directRevoke = await AD.client.from("user_bans").update({ revoked_at: new Date().toISOString() }).eq("id", banId).select("id");
    check(
      "админ не снимает бан правкой user_bans напрямую",
      blocked(directRevoke) && (await banRows(admin)).data?.[0]?.revoked_at === null,
      rows(directRevoke),
    );
    const reportEdit = await AD.client.from("comment_reports").update({ status: "dismissed" }).eq("id", probeReport.data.id).select("id");
    const reportDelete = await AD.client.from("comment_reports").delete().eq("id", probeReport.data.id).select("id");
    check(
      "админ не правит и не удаляет жалобы напрямую",
      blocked(reportEdit) && blocked(reportDelete) && (await reportRows(admin)).data?.[0]?.status === "open",
      `${rows(reportEdit)} / ${rows(reportDelete)}`,
    );
    const logDeleteMod = await AD.client.from("moderation_actions").delete().eq("id", probeBan.data.id).select("id");
    check("админ не удаляет строки журнала модерации", blocked(logDeleteMod) && (await logRows(admin)).data?.length === 1, rows(logDeleteMod));
    const forged = await AD.client.from("moderation_actions").insert({ action: "unban", target_user_id: MB.id, moderator_id: M.id }).select("id");
    check(
      "админ не подставляет чужого модератора в журнал",
      !!forged.error && (await banRows(admin)).data?.[0]?.revoked_at === null,
      code(forged),
    );

    const adUnban = await act(AD.client, { action: "unban", target_user_id: MB.id });
    const afterUnbanRow = (await banRows(admin)).data?.[0];
    const unbanLog = (await logRows(admin)).data?.filter((row) => row.action === "unban") ?? [];
    check(
      "админ снимает бан: снят им, одна строка журнала от его имени",
      !adUnban.error &&
        !!afterUnbanRow?.revoked_at &&
        afterUnbanRow.revoked_by === AD.id &&
        unbanLog.length === 1 &&
        unbanLog[0].moderator_id === AD.id,
      code(adUnban),
    );
  }

  // ---- тайтлы (этап 6c, миграция admin_titles, ADR-029): ручной текст, скрытие, журнал title_actions ----
  {
    const titleAct = (client, fields) =>
      client.from("title_actions").insert({ anilist_id: PROBE_ANIME_ID, ...fields }).select("id, admin_id, old_title_ru, old_description_ru").single();
    const titleLog = async () => (await admin.from("title_actions").select("id, action").eq("anilist_id", PROBE_ANIME_ID)).data ?? [];
    const manualRow = async () =>
      (await admin.from("anime_localizations").select("title_ru, manual_title_ru, manual_description_ru").eq("anilist_id", PROBE_ANIME_ID).maybeSingle()).data;
    const hiddenFor = async (client) => (await client.from("anime_hidden").select("anilist_id").eq("anilist_id", PROBE_ANIME_ID)).data?.length ?? -1;

    // Писать может только администратор и только через журнал.
    const userText = await titleAct(A.client, { action: "set_text", title_ru: "Чужое" });
    check("пользователь не правит тайтл — 42501", userText.error?.code === "42501", code(userText));
    const modHide = await titleAct(M.client, { action: "hide" });
    check("модератор не скрывает тайтл — 42501", modHide.error?.code === "42501", code(modHide));
    const anonHide = await anon.from("title_actions").insert({ anilist_id: PROBE_ANIME_ID, action: "hide" });
    check("гость не скрывает тайтл", !!anonHide.error, code(anonHide));
    const directHide = await AD.client.from("anime_hidden").insert({ anilist_id: PROBE_ANIME_ID });
    check("админ не пишет в anime_hidden напрямую", !!directHide.error && (await hiddenFor(admin)) === 0, code(directHide));
    check("после отказов журнал пуст", (await titleLog()).length === 0);

    // Ручной текст.
    const setText = await titleAct(AD.client, { action: "set_text", title_ru: "  Проба названия  ", description_ru: "Проба описания." });
    const afterSet = await manualRow();
    check(
      "админ задаёт название и описание: пробелы убраны, журнал от его имени",
      !setText.error &&
        afterSet?.manual_title_ru === "Проба названия" &&
        afterSet?.manual_description_ru === "Проба описания." &&
        setText.data?.admin_id === AD.id &&
        setText.data?.old_title_ru === null,
      code(setText),
    );
    const directText = await AD.client.from("anime_localizations").update({ manual_title_ru: "В обход" }).eq("anilist_id", PROBE_ANIME_ID).select("anilist_id");
    check("админ не правит ручной текст в обход журнала", blocked(directText) && (await manualRow())?.manual_title_ru === "Проба названия", rows(directText));

    // Главное: запись импорта (сверка с Shikimori, машинный перевод — те же колонки, что пишет приложение) не трогает ручной текст.
    const importRow = {
      anilist_id: PROBE_ANIME_ID,
      mal_id: 999999,
      title_ru: "Название Shikimori",
      synonyms_ru: ["Синоним"],
      description_ru: "Описание Shikimori.",
      source: "shikimori",
      source_hash: null,
      translator: null,
      shikimori_url: "https://shikimori.io/animes/999999",
    };
    const imported = await admin.from("anime_localizations").upsert([importRow], { onConflict: "anilist_id" });
    const afterImport = await manualRow();
    check(
      "импорт Shikimori не затирает ручной текст",
      !imported.error &&
        afterImport?.title_ru === "Название Shikimori" &&
        afterImport?.manual_title_ru === "Проба названия" &&
        afterImport?.manual_description_ru === "Проба описания.",
      code(imported),
    );
    const machineRow = { ...importRow, description_ru: "Машинный перевод.", source: "machine", source_hash: "a".repeat(64), translator: "deepl", shikimori_url: null };
    const translated = await admin.from("anime_localizations").upsert([machineRow], { onConflict: "anilist_id" });
    const afterMachine = await manualRow();
    check(
      "машинный перевод не затирает ручной текст",
      !translated.error && afterMachine?.manual_title_ru === "Проба названия" && afterMachine?.manual_description_ru === "Проба описания.",
      code(translated),
    );
    check(
      "гость читает ручной текст (публичный каталог)",
      (await anon.from("anime_localizations").select("manual_title_ru").eq("anilist_id", PROBE_ANIME_ID)).data?.[0]?.manual_title_ru === "Проба названия",
    );

    const sameText = await titleAct(AD.client, { action: "set_text", title_ru: "Проба названия", description_ru: "Проба описания." });
    check("тот же текст — PT422, журнал не вырос", sameText.error?.code === "PT422" && (await titleLog()).length === 1, code(sameText));
    const longText = await titleAct(AD.client, { action: "set_text", title_ru: "я".repeat(301) });
    check("слишком длинное название — PT422", longText.error?.code === "PT422" && (await manualRow())?.manual_title_ru === "Проба названия", code(longText));
    const forgedAdmin = await AD.client.from("title_actions").insert({ anilist_id: PROBE_ANIME_ID, action: "hide", admin_id: M.id }).select("id");
    check("админ не подставляет чужого автора в журнал", !!forgedAdmin.error && (await hiddenFor(admin)) === 0, code(forgedAdmin));
    const resetText = await titleAct(AD.client, { action: "set_text", title_ru: "", description_ru: null });
    const afterReset = await manualRow();
    check(
      "пустые поля возвращают автоматический текст, прежний — в журнале",
      !resetText.error &&
        afterReset?.manual_title_ru === null &&
        afterReset?.manual_description_ru === null &&
        afterReset?.title_ru === "Название Shikimori" &&
        resetText.data?.old_title_ru === "Проба названия",
      code(resetText),
    );

    // Скрытие: серии и уведомления.
    const TU = await makeUser("tu");
    const listed = await TU.client.from("anime_list").insert({ user_id: TU.id, anilist_id: PROBE_ANIME_ID, status: "watching", title: "Проба" });
    const shown = await AD.client
      .from("episodes")
      .insert({ anilist_id: PROBE_ANIME_ID, number: 95, license_status: "own", hls_url: "/media/test/master.m3u8" })
      .select("id")
      .single();
    if (listed.error || shown.error) throw new Error(`подготовка блока 6c: ${code(listed)} / ${code(shown)}`);
    const sees = async (client) => (await client.from("episodes").select("id").eq("id", shown.data.id)).data?.length === 1;
    const noticesOf = async () =>
      (await admin.from("notifications").select("episode_number").eq("user_id", TU.id).eq("anilist_id", PROBE_ANIME_ID).eq("type", "new_episode")).data ?? [];
    check("до скрытия серию видят гость и пользователь, уведомление создано", (await sees(anon)) && (await sees(A.client)) && (await noticesOf()).length === 1);

    const hide = await titleAct(AD.client, { action: "hide", reason: "проба 6c", anime_title: "Проба" });
    check("админ скрывает тайтл", !hide.error && (await hiddenFor(admin)) === 1, code(hide));
    check("список скрытых читают гость и пользователь", (await hiddenFor(anon)) === 1 && (await hiddenFor(A.client)) === 1);
    check(
      "серию скрытого тайтла не видят гость, пользователь и модератор; админ видит",
      !(await sees(anon)) && !(await sees(A.client)) && !(await sees(M.client)) && (await sees(AD.client)),
    );
    const hideAgain = await titleAct(AD.client, { action: "hide" });
    check("повторное скрытие — PT422", hideAgain.error?.code === "PT422", code(hideAgain));
    await admin.from("notifications").delete().eq("user_id", TU.id);
    const hiddenEpisode = await AD.client.from("episodes").insert({ anilist_id: PROBE_ANIME_ID, number: 96, license_status: "own", hls_url: "/media/test/master.m3u8" });
    check("новая серия скрытого тайтла не создаёт уведомление", !hiddenEpisode.error && (await noticesOf()).length === 0, code(hiddenEpisode));

    const show = await titleAct(AD.client, { action: "show" });
    check("админ возвращает тайтл: серию снова видит гость", !show.error && (await hiddenFor(admin)) === 0 && (await sees(anon)), code(show));
    const showAgain = await titleAct(AD.client, { action: "show" });
    check("возврат не скрытого — PT422", showAgain.error?.code === "PT422", code(showAgain));
    const visibleEpisode = await AD.client.from("episodes").insert({ anilist_id: PROBE_ANIME_ID, number: 97, license_status: "own", hls_url: "/media/test/master.m3u8" });
    check("после возврата новая серия снова уведомляет", !visibleEpisode.error && (await noticesOf()).length === 1, code(visibleEpisode));

    // Журнал: 4 выполненных действия (set_text, сброс, hide, show); читает только администратор, менять нельзя.
    const log = await titleLog();
    check("в журнале только выполненные действия", log.length === 4, `строк: ${log.length}`);
    check("админ читает журнал тайтлов", (await AD.client.from("title_actions").select("id").eq("anilist_id", PROBE_ANIME_ID)).data?.length === 4);
    check(
      "модератор, пользователь и гость журнал тайтлов не читают",
      blocked(await M.client.from("title_actions").select("id")) &&
        blocked(await A.client.from("title_actions").select("id")) &&
        blocked(await anon.from("title_actions").select("id")),
    );
    const logEditTitle = await AD.client.from("title_actions").update({ reason: "подмена" }).eq("id", hide.data?.id ?? -1).select("id");
    const logDeleteTitle = await AD.client.from("title_actions").delete().eq("id", hide.data?.id ?? -1).select("id");
    check("админ не правит и не удаляет журнал тайтлов", blocked(logEditTitle) && blocked(logDeleteTitle), `${rows(logEditTitle)} / ${rows(logDeleteTitle)}`);
  }

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
  // Журнал модерации переживает удаление пользователей (ссылки обнуляются) — строки проб убираем явно.
  if (created.length) await admin.from("moderation_actions").delete().in("moderator_id", created);
  // То же для журнала администратора (нет таблицы — миграция не применена, ошибку покажут проверки выше).
  if (created.length) await admin.from("admin_actions").delete().in("admin_id", created);
  // Тайтлы (миграция admin_titles): журнал, отметка «скрыт» и строка ручного текста пробы.
  if (created.length) await admin.from("title_actions").delete().in("admin_id", created);
  await admin.from("title_actions").delete().eq("anilist_id", PROBE_ANIME_ID);
  await admin.from("anime_hidden").delete().eq("anilist_id", PROBE_ANIME_ID);
  await admin.from("anime_localizations").delete().eq("anilist_id", PROBE_ANIME_ID);
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
  const { count: commentsLeft } = await admin
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("anilist_id", PROBE_ANIME_ID);
  // Нет таблицы или ошибка — count null, остаток не 0: прогон падает, как и по другим счётчикам.
  const { count: notificationsLeft } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("anilist_id", PROBE_ANIME_ID);
  const leftover = [profilesLeft, filesLeft, episodesLeft, commentsLeft, notificationsLeft];
  // Ненулевой (или не прочитанный) остаток — ⚠️, и прогон падает: временные данные не должны копиться в проекте.
  const clean = leftover.every((count) => count === 0);
  results.push(
    `${clean ? "🧹" : "⚠️"} осталось: профилей ${profilesLeft ?? "—"}, файлов аватаров ${filesLeft}, временных серий ${episodesLeft ?? "—"}, комментариев ${commentsLeft ?? "—"}, уведомлений ${notificationsLeft ?? "—"}`,
  );
  console.log(results.join("\n"));
  if (results.some((line) => line.startsWith("❌") || line.startsWith("⚠️"))) process.exitCode = 1;
}
