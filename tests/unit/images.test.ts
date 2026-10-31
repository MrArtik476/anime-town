import { describe, expect, it } from "vitest";

import { isAniListImage } from "@/lib/anilist/images";

describe("isAniListImage", () => {
  it("узнаёт обложки CDN AniList — они выводятся без оптимизатора", () => {
    expect(isAniListImage("https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg")).toBe(true);
    expect(isAniListImage("https://example.com/cover.jpg")).toBe(false);
    expect(isAniListImage("https://s4.anilist.co.evil.test/cover.jpg")).toBe(false);
    expect(isAniListImage("/local.png")).toBe(false);
  });
});
