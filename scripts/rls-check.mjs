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
  const leftover = [profilesLeft, filesLeft, episodesLeft, commentsLeft];
  // Ненулевой (или не прочитанный) остаток — ⚠️, и прогон падает: временные данные не должны копиться в проекте.
  const clean = leftover.every((count) => count === 0);
  results.push(
    `${clean ? "🧹" : "⚠️"} осталось: профилей ${profilesLeft ?? "—"}, файлов аватаров ${filesLeft}, временных серий ${episodesLeft ?? "—"}, комментариев ${commentsLeft ?? "—"}`,
  );
  console.log(results.join("\n"));
  if (results.some((line) => line.startsWith("❌") || line.startsWith("⚠️"))) process.exitCode = 1;
}
