import { describe, expect, it } from "vitest";

import {
  checkVttFile,
  MAX_SUBTITLE_BYTES,
  newSubtitleObjectName,
  parseSubtitleObjectName,
  storedObjectName,
  subtitleUrl,
} from "@/features/admin/subtitle-file";

const enc = (text: string) => new TextEncoder().encode(text);

describe("checkVttFile", () => {
  it("принимает WEBVTT с BOM и без, возвращает текст без BOM", () => {
    expect(checkVttFile(enc("WEBVTT\n\n00:00.000 --> 00:01.000\nПривет"))).toEqual({
      ok: true,
      text: "WEBVTT\n\n00:00.000 --> 00:01.000\nПривет",
    });
    expect(checkVttFile(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("WEBVTT - title\n")]))).toEqual({ ok: true, text: "WEBVTT - title\n" });
    expect(checkVttFile(enc("WEBVTT")).ok).toBe(true);
    expect(checkVttFile(enc("WEBVTT\r\n")).ok).toBe(true);
    expect(checkVttFile(enc("WEBVTT\tx")).ok).toBe(true);
  });

  it("отклоняет пустой файл", () => {
    expect(checkVttFile(new Uint8Array())).toEqual({ ok: false, message: "Выберите файл субтитров" });
  });

  it("отклоняет файл без заголовка WEBVTT", () => {
    const message = "Это не файл WebVTT: первая строка должна быть WEBVTT";
    expect(checkVttFile(enc("WEBVTTX\n"))).toEqual({ ok: false, message });
    expect(checkVttFile(enc("1\n00:00:00,000 --> 00:00:01,000\nSRT"))).toEqual({ ok: false, message });
    expect(checkVttFile(enc(" WEBVTT"))).toEqual({ ok: false, message });
  });

  it("отклоняет UTF-16 и битый UTF-8", () => {
    expect(checkVttFile(new Uint8Array([0xff, 0xfe, 0x57, 0x00, 0x45, 0x00])).ok).toBe(false);
    expect(checkVttFile(new Uint8Array([...enc("WEBVTT\n"), 0xc3, 0x28])).ok).toBe(false);
  });

  it("отклоняет файл больше 512 КБ", () => {
    expect(MAX_SUBTITLE_BYTES).toBe(524288);
    const big = new Uint8Array(MAX_SUBTITLE_BYTES + 1).fill(0x41);
    big.set(enc("WEBVTT\n"));
    expect(checkVttFile(big)).toEqual({ ok: false, message: "Файл субтитров — не больше 512 КБ" });
    const limit = new Uint8Array(MAX_SUBTITLE_BYTES).fill(0x41);
    limit.set(enc("WEBVTT\n"));
    expect(checkVttFile(limit).ok).toBe(true);
  });
});

describe("имена объектов бакета", () => {
  it("новое имя — uuid.vtt, адрес — /media/subtitles/<имя>", () => {
    const name = newSubtitleObjectName();
    expect(name).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.vtt$/);
    expect(newSubtitleObjectName()).not.toBe(name);
    expect(subtitleUrl(name)).toBe(`/media/subtitles/${name}`);
  });

  it("разбирает только наши имена", () => {
    const name = newSubtitleObjectName();
    expect(parseSubtitleObjectName(name)).toBe(name);
    for (const bad of ["../x.vtt", "a/b.vtt", "%2e%2e.vtt", "x.vtt", `${name}.m3u8`, name.toUpperCase(), `${name}?x=1`, ""]) {
      expect(parseSubtitleObjectName(bad)).toBeNull();
    }
  });

  it("узнаёт адреса своего бакета", () => {
    const name = newSubtitleObjectName();
    expect(storedObjectName(subtitleUrl(name))).toBe(name);
    expect(storedObjectName("/media/test/ru.vtt")).toBeNull();
    expect(storedObjectName("https://example.com/media/subtitles/a.vtt")).toBeNull();
    expect(storedObjectName("/media/subtitles/../test/ru.vtt")).toBeNull();
    expect(storedObjectName(null)).toBeNull();
  });
});
