"use server";

import { refresh, updateTag } from "next/cache";

import type { ActionResult } from "@/features/comments/actions";
import { episodesTag } from "@/features/episodes/queries";

import { adminClient, type AdminSupabase, INVALID, isResult } from "./admin-client";
import { adminErrorMessage, type AdminTable, parseAnimeId, parseEpisodeInput, parseRole, parseSubtitleInput } from "./model";
import { checkVttFile, MAX_SUBTITLE_BYTES, newSubtitleObjectName, storedObjectName, SUBTITLE_BUCKET, subtitleUrl } from "./subtitle-file";

const parseId = (raw: unknown): number | null => (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DbError = { code?: string; message?: string } | null;

function failure(error: DbError, table: AdminTable, what: string): ActionResult {
  if (error?.code !== "23505" && error?.code !== "PT422") console.error(`[admin] ${what}`, error?.code);
  return { ok: false, message: adminErrorMessage(error, table) };
}

/** Публичные списки серий кэшируются по тайтлу — после записи кэш сбрасывается сразу. */
function episodesChanged(animeId: number) {
  updateTag(episodesTag(animeId));
  refresh();
}

/** Создать серию (id = null) или изменить существующую. */
export async function saveEpisode(rawAnimeId: unknown, rawId: unknown, rawInput: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  const id = rawId === null ? null : parseId(rawId);
  if (!animeId || (rawId !== null && !id)) return INVALID;
  const parsed = parseEpisodeInput(rawInput);
  if (!parsed.ok) return parsed;
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;

  const input = parsed.value;
  const row = {
    number: input.number,
    title: input.title,
    duration_sec: input.durationSec,
    license_status: input.licenseStatus,
    hls_url: input.hlsUrl,
    attribution: input.attribution,
    attribution_url: input.attributionUrl,
  };
  if (id === null) {
    const { error } = await supabase.from("episodes").insert({ ...row, anilist_id: animeId });
    if (error) return failure(error, "episodes", "серия не создана");
  } else {
    // anilist_id в условии: серию нельзя изменить через страницу чужого тайтла.
    const { data, error } = await supabase.from("episodes").update(row).eq("id", id).eq("anilist_id", animeId).select("id");
    if (error) return failure(error, "episodes", "серия не изменена");
    if (data.length === 0) return { ok: false, message: "Серия не найдена — обновите страницу" };
  }
  episodesChanged(animeId);
  return { ok: true };
}

/** Удалить серию. Вместе с ней база удаляет её субтитры, прогресс просмотра и комментарии (on delete cascade). */
export async function deleteEpisode(rawAnimeId: unknown, rawId: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  const id = parseId(rawId);
  if (!animeId || !id) return INVALID;
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;
  // Адреса файлов субтитров — до удаления: после каскада строк уже нет.
  const { data: subtitles } = await supabase.from("subtitles").select("url").eq("episode_id", id);
  const { data, error } = await supabase.from("episodes").delete().eq("id", id).eq("anilist_id", animeId).select("id");
  if (error) return failure(error, "episodes", "серия не удалена");
  if (data.length === 0) return { ok: false, message: "Серия не найдена — обновите страницу" };
  await removeFiles(supabase, (subtitles ?? []).map((row) => storedObjectName(row.url)));
  episodesChanged(animeId);
  return { ok: true };
}

/** Удалить файлы из бакета subtitles. Сбой не отменяет действие: файл без строки читает только администратор (ADR-030). */
async function removeFiles(supabase: AdminSupabase, names: (string | null)[]) {
  const list = names.filter((name): name is string => name !== null);
  if (list.length === 0) return;
  const { error } = await supabase.storage.from(SUBTITLE_BUCKET).remove(list);
  if (error) console.error("[admin] файлы субтитров не удалены", error.message);
}

const NO_FILE: ActionResult = { ok: false, message: "Выберите файл субтитров" };
const TOO_BIG: ActionResult = { ok: false, message: "Файл субтитров — не больше 512 КБ" };
const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * Добавить субтитры к серии (id = null) или изменить. Поля формы: lang, label, isDefault ("on"), source:
 * "url" — адрес из поля url; "file" — файл .vtt из поля file уходит в закрытый бакет subtitles (при изменении
 * без нового файла остаётся прежний загруженный). Строка не сохранилась — загруженный файл удаляется; заменённый
 * файл удаляется после сохранения. «По умолчанию» у серии одни — остальные сбрасываются.
 */
export async function saveSubtitle(rawAnimeId: unknown, rawEpisodeId: unknown, rawId: unknown, form: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  const episodeId = parseId(rawEpisodeId);
  const id = rawId === null ? null : parseId(rawId);
  if (!animeId || !episodeId || (rawId !== null && !id) || !(form instanceof FormData)) return INVALID;
  const source = form.get("source");
  if (source !== "file" && source !== "url") return INVALID;

  // Файл проверяется до обращения к базе; размер — раньше чтения содержимого.
  let upload: { name: string; text: string } | null = null;
  const file = form.get("file");
  if (source === "file" && file instanceof File && file.size > 0) {
    if (file.size > MAX_SUBTITLE_BYTES) return TOO_BIG;
    const checked = checkVttFile(new Uint8Array(await file.arrayBuffer()));
    if (!checked.ok) return checked;
    upload = { name: newSubtitleObjectName(), text: checked.text };
  } else if (source === "file" && id === null) return NO_FILE;

  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;
  const { data: episode } = await supabase.from("episodes").select("id").eq("id", episodeId).eq("anilist_id", animeId).maybeSingle();
  if (!episode) return { ok: false, message: "Серия не найдена — обновите страницу" };

  let previousUrl: string | null = null;
  if (id !== null) {
    const { data: current } = await supabase.from("subtitles").select("url").eq("id", id).eq("episode_id", episodeId).maybeSingle();
    if (!current) return { ok: false, message: "Субтитры не найдены — обновите страницу" };
    previousUrl = current.url;
  }
  // Изменение без нового файла сохраняет прежний файл бакета; у внешнего адреса такого файла нет.
  if (source === "file" && !upload && !storedObjectName(previousUrl)) return NO_FILE;
  const url = upload ? subtitleUrl(upload.name) : source === "url" ? field(form, "url") : previousUrl;
  const parsed = parseSubtitleInput({ lang: field(form, "lang"), label: field(form, "label"), url, isDefault: form.get("isDefault") === "on" });
  if (!parsed.ok) return parsed;

  if (upload) {
    // Байты, а не Blob: Blob storage-js отправляет multipart-формой, байты — как есть, с нашим Content-Type.
    const body = new TextEncoder().encode(upload.text);
    const { error } = await supabase.storage.from(SUBTITLE_BUCKET).upload(upload.name, body, { contentType: "text/vtt", upsert: false });
    if (error) {
      console.error("[admin] файл субтитров не загружен", error.message);
      return { ok: false, message: "Файл субтитров не загрузился — попробуйте ещё раз" };
    }
  }
  const discard = () => removeFiles(supabase, [upload?.name ?? null]);

  const input = parsed.value;
  const row = { lang: input.lang, label: input.label, url: input.url, is_default: input.isDefault };
  let savedId = id;
  if (id === null) {
    const { data, error } = await supabase.from("subtitles").insert({ ...row, episode_id: episodeId }).select("id").single();
    if (error) {
      await discard();
      return failure(error, "subtitles", "субтитры не добавлены");
    }
    savedId = data.id;
  } else {
    const { data, error } = await supabase.from("subtitles").update(row).eq("id", id).eq("episode_id", episodeId).select("id");
    if (error || data.length === 0) {
      await discard();
      return error ? failure(error, "subtitles", "субтитры не изменены") : { ok: false, message: "Субтитры не найдены — обновите страницу" };
    }
  }
  const replaced = storedObjectName(previousUrl);
  if (replaced && replaced !== storedObjectName(input.url)) await removeFiles(supabase, [replaced]);
  if (input.isDefault && savedId !== null) {
    const { error } = await supabase.from("subtitles").update({ is_default: false }).eq("episode_id", episodeId).neq("id", savedId).eq("is_default", true);
    if (error) console.error("[admin] прежние субтитры по умолчанию не сброшены", error.code);
  }
  episodesChanged(animeId);
  return { ok: true };
}

export async function deleteSubtitle(rawAnimeId: unknown, rawEpisodeId: unknown, rawId: unknown): Promise<ActionResult> {
  const animeId = parseAnimeId(rawAnimeId);
  const episodeId = parseId(rawEpisodeId);
  const id = parseId(rawId);
  if (!animeId || !episodeId || !id) return INVALID;
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;
  const { data, error } = await supabase.from("subtitles").delete().eq("id", id).eq("episode_id", episodeId).select("id, url");
  if (error) return failure(error, "subtitles", "субтитры не удалены");
  if (data.length === 0) return { ok: false, message: "Субтитры не найдены — обновите страницу" };
  await removeFiles(supabase, data.map((row) => storedObjectName(row.url)));
  episodesChanged(animeId);
  return { ok: true };
}

/**
 * Сменить роль: одна вставка в admin_actions — триггер базы меняет profiles.role и пишет журнал.
 * Свою роль менять нельзя (PT422 own_role).
 */
export async function setUserRole(rawUserId: unknown, rawRole: unknown): Promise<ActionResult> {
  const role = parseRole(rawRole);
  if (typeof rawUserId !== "string" || !UUID.test(rawUserId) || !role) return INVALID;
  const supabase = await adminClient();
  if (isResult(supabase)) return supabase;
  const { error } = await supabase.from("admin_actions").insert({ action: "set_role", target_user_id: rawUserId, new_role: role });
  if (error) return failure(error, "admin_actions", "роль не изменена");
  refresh();
  return { ok: true };
}
