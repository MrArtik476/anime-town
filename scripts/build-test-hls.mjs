// Сборка крошечного тестового HLS-ролика без ffmpeg: `node scripts/build-test-hls.mjs`.
// Chromium (Playwright) рисует анимацию на canvas и записывает её MediaRecorder'ом в фрагментированный MP4
// (H.264). MP4 режется на init-сегмент (ftyp+moov) и медиасегмент (moof+mdat) — это HLS fMP4.
// Два качества (360p и 180p) → master.m3u8; субтитры WebVTT (ru, en) — отдельными файлами для <track>.
// Видео создано этим скриптом, сторонних прав в нём нет. Результат — public/media/test/ (ADR-022).
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const OUT = path.resolve("public/media/test");
const SECONDS = 6;
const RENDITIONS = [
  { name: "360p", width: 640, height: 360, bitrate: 400_000 },
  { name: "180p", width: 320, height: 180, bitrate: 150_000 },
];

/** Верхнеуровневые MP4-боксы: [{ type, start, end }]. */
function boxes(buffer) {
  const list = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    if (size === 1) size = Number(buffer.readBigUInt64BE(offset + 8));
    if (size === 0) size = buffer.length - offset;
    list.push({ type, start: offset, end: offset + size });
    offset += size;
  }
  return list;
}

async function record(page, { width, height, bitrate }) {
  await page.setContent(`<canvas id="c" width="${width}" height="${height}"></canvas>`);
  return page.evaluate(
    async ({ seconds, bitrate }) => {
      const canvas = document.getElementById("c");
      const ctx = canvas.getContext("2d");
      const { width: w, height: h } = canvas;
      const start = performance.now();
      let running = true;
      const draw = () => {
        const t = (performance.now() - start) / 1000;
        ctx.fillStyle = "#14161f";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#e5654a";
        ctx.beginPath();
        ctx.arc(w * (0.12 + 0.76 * Math.min(t / seconds, 1)), h * 0.55, h * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f5f5f7";
        ctx.font = `bold ${Math.round(h / 8)}px sans-serif`;
        ctx.fillText(`Anime Town · ${t.toFixed(1)} s`, w * 0.05, h * 0.2);
        ctx.font = `${Math.round(h / 13)}px sans-serif`;
        ctx.fillText(`${w}×${h} · test video`, w * 0.05, h * 0.92);
        if (running) requestAnimationFrame(draw);
      };
      draw();
      const recorder = new MediaRecorder(canvas.captureStream(25), {
        mimeType: 'video/mp4;codecs="avc1.42E01E"',
        videoBitsPerSecond: bitrate,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      const stopped = new Promise((resolve) => (recorder.onstop = resolve));
      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      recorder.stop();
      await stopped;
      running = false;
      const blob = new Blob(chunks, { type: "video/mp4" });
      // Точная длительность — из самого файла.
      const video = document.createElement("video");
      video.src = URL.createObjectURL(blob);
      await new Promise((resolve) => (video.onloadedmetadata = resolve));
      if (!Number.isFinite(video.duration)) {
        video.currentTime = 1e6;
        await new Promise((resolve) => (video.ondurationchange = resolve));
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { base64: btoa(binary), duration: video.duration };
    },
    { seconds: SECONDS, bitrate },
  );
}

const browser = await chromium.launch();
const page = await browser.newPage();
fs.mkdirSync(OUT, { recursive: true });
const variants = [];

for (const rendition of RENDITIONS) {
  const { base64, duration } = await record(page, rendition);
  const mp4 = Buffer.from(base64, "base64");
  const list = boxes(mp4);
  const moovEnd = list.find((box) => box.type === "moov")?.end;
  const fragments = list.filter((box) => box.type === "moof" || box.type === "mdat");
  if (!moovEnd || fragments[0]?.type !== "moof") throw new Error(`${rendition.name}: не fragmented MP4 (${list.map((b) => b.type)})`);

  const dir = path.join(OUT, rendition.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "init.mp4"), mp4.subarray(0, moovEnd));
  fs.writeFileSync(path.join(dir, "seg0.m4s"), mp4.subarray(fragments[0].start, fragments.at(-1).end));
  const seconds = Math.round(duration * 1000) / 1000;
  fs.writeFileSync(
    path.join(dir, "index.m3u8"),
    [
      "#EXTM3U",
      "#EXT-X-VERSION:7",
      `#EXT-X-TARGETDURATION:${Math.ceil(seconds)}`,
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      '#EXT-X-MAP:URI="init.mp4"',
      `#EXTINF:${seconds.toFixed(3)},`,
      "seg0.m4s",
      "#EXT-X-ENDLIST",
      "",
    ].join("\n"),
  );
  variants.push({ ...rendition, seconds });
  console.log(`${rendition.name}: ${seconds} s, init ${moovEnd} B, segment ${fragments.at(-1).end - fragments[0].start} B`);
}

fs.writeFileSync(
  path.join(OUT, "master.m3u8"),
  [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    ...variants.flatMap((v) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${v.bitrate},RESOLUTION=${v.width}x${v.height},CODECS="avc1.42e01e",NAME="${v.name}"`,
      `${v.name}/index.m3u8`,
    ]),
    "",
  ].join("\n"),
);

const vtt = (lines) => ["WEBVTT", "", ...lines.flatMap(([from, to, text]) => [`00:00:0${from}.000 --> 00:00:0${to}.000`, text, ""])].join("\n");
fs.writeFileSync(path.join(OUT, "subtitles.ru.vtt"), vtt([[0, 2, "Тестовый ролик Anime Town"], [2, 4, "Круг едет слева направо"], [4, 6, "Конец ролика"]]));
fs.writeFileSync(path.join(OUT, "subtitles.en.vtt"), vtt([[0, 2, "Anime Town test video"], [2, 4, "The circle moves left to right"], [4, 6, "End of the video"]]));
fs.writeFileSync(
  path.join(OUT, "LICENSE.md"),
  "# Тестовый HLS-ролик\n\nСгенерирован скриптом `scripts/build-test-hls.mjs` (canvas-анимация, записанная в Chromium). Сторонних материалов не содержит; распространяется вместе с репозиторием Anime Town. Используется для разработки и E2E-тестов плеера.\n",
);
await browser.close();
