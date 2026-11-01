// @vitest-environment node
import { describe, expect, it } from "vitest";

import { formatDuration } from "@/features/episodes/queries";
import { resolvePlaybackSource } from "@/features/player/source";

const episode = (overrides: Partial<Parameters<typeof resolvePlaybackSource>[0]> = {}) => ({
  hlsUrl: "/media/test/master.m3u8",
  licenseStatus: "own" as const,
  attribution: null,
  attributionUrl: null,
  ...overrides,
});

describe("resolvePlaybackSource — единственное место выбора источника видео", () => {
  it("серия с правами → HLS-адрес и лицензия", () => {
    expect(resolvePlaybackSource(episode())).toEqual({
      kind: "hls",
      url: "/media/test/master.m3u8",
      license: "own",
      attribution: null,
    });
  });

  it("открытая лицензия — с атрибуцией", () => {
    const source = resolvePlaybackSource(
      episode({
        licenseStatus: "open_license",
        hlsUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        attribution: "Big Buck Bunny — © 2008 Blender Foundation · CC BY 3.0",
        attributionUrl: "https://peach.blender.org/about/",
      }),
    );
    expect(source?.attribution).toEqual({
      text: "Big Buck Bunny — © 2008 Blender Foundation · CC BY 3.0",
      url: "https://peach.blender.org/about/",
    });
  });

  it("без прав или с недопустимым адресом — не показывается", () => {
    expect(resolvePlaybackSource(episode({ licenseStatus: "none" }))).toBeNull();
    expect(resolvePlaybackSource(episode({ hlsUrl: "http://example.com/a.m3u8" }))).toBeNull();
    expect(resolvePlaybackSource(episode({ hlsUrl: "javascript:alert(1)//.m3u8" }))).toBeNull();
    expect(resolvePlaybackSource(episode({ hlsUrl: "/media/test/video.mp4" }))).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [null, null],
    [0, null],
    [6, "0:06"],
    [596, "10 мин"],
    [3900, "1 ч 05 мин"],
  ])("%s → %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});
