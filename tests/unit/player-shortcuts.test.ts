// @vitest-environment node
import { describe, expect, it } from "vitest";

import { levelLabel, seekTarget, shortcutFor } from "@/features/player/shortcuts";
import { parseEpisodeNumber } from "@/features/episodes/ids";

describe("горячие клавиши плеера", () => {
  it.each([
    [" ", "toggle-play"],
    ["k", "toggle-play"],
    ["л", "toggle-play"],
    ["ArrowRight", "seek"],
    ["д", "seek"],
    ["F", "fullscreen"],
    ["а", "fullscreen"],
    ["m", "mute"],
    ["с", "subtitles"],
  ])("«%s» → %s (латиница и русская раскладка)", (key, type) => {
    expect(shortcutFor({ key })?.type).toBe(type);
  });

  it("перемотка ±10 с, клавиши с модификаторами и чужие — не наши", () => {
    expect(shortcutFor({ key: "ArrowLeft" })).toEqual({ type: "seek", by: -10 });
    expect(shortcutFor({ key: "f", ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: "Tab" })).toBeNull();
  });

  it("перемотка не выходит за границы ролика", () => {
    expect(seekTarget(3, -10, 6)).toBe(0);
    expect(seekTarget(3, 10, 6)).toBe(6);
    expect(seekTarget(30, 10, 100)).toBe(40);
    expect(seekTarget(5, 10, Number.NaN)).toBe(15);
  });

  it("подпись качества и номер серии", () => {
    expect(levelLabel({ height: 720 })).toBe("720p");
    expect(levelLabel({ name: "low" })).toBe("low");
    expect(parseEpisodeNumber("12")).toBe(12);
    for (const raw of ["0", "-1", "1.5", "abc", "10001", "999999"]) expect(parseEpisodeNumber(raw)).toBeNull();
  });
});
