import { describe, expect, it } from "vitest";
import { defaultShortCount } from "./project";

describe("defaultShortCount", () => {
  it("defaults to the number of whole minutes in the video", () => {
    expect(defaultShortCount(600)).toBe(10); // 10:00
    expect(defaultShortCount(630)).toBe(11); // 10:30 rounds up
    expect(defaultShortCount(614)).toBe(10); // 10:14 rounds down
  });

  it("never proposes fewer than two shorts", () => {
    expect(defaultShortCount(0)).toBe(2);
    expect(defaultShortCount(30)).toBe(2); // under a minute
    expect(defaultShortCount(undefined)).toBe(2); // duration not probed yet
  });

  it("has no upper cap", () => {
    expect(defaultShortCount(60 * 90)).toBe(90); // a 90-minute talk
  });
});
