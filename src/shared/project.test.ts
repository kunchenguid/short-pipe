import { describe, expect, it } from "vitest";
import {
  clampTargetDuration,
  DEFAULT_TARGET_DURATION_SEC,
  defaultShortCount,
  isUncappedDuration,
  MAX_TARGET_DURATION_SEC,
  MIN_TARGET_DURATION_SEC,
  SHORT_DURATION_PRESETS,
  targetDurationHint,
  UNCAPPED_TARGET_DURATION_SEC,
} from "./project";

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

describe("clampTargetDuration", () => {
  it("keeps a sensible value, rounded to whole seconds", () => {
    expect(clampTargetDuration(30)).toBe(30);
    expect(clampTargetDuration(44.6)).toBe(45);
  });

  it("falls back to the default for missing or invalid input", () => {
    expect(clampTargetDuration(undefined)).toBe(DEFAULT_TARGET_DURATION_SEC);
    expect(clampTargetDuration(-10)).toBe(DEFAULT_TARGET_DURATION_SEC);
    expect(clampTargetDuration(Number.NaN)).toBe(DEFAULT_TARGET_DURATION_SEC);
  });

  it("passes the uncapped sentinel through untouched", () => {
    expect(clampTargetDuration(UNCAPPED_TARGET_DURATION_SEC)).toBe(UNCAPPED_TARGET_DURATION_SEC);
    expect(clampTargetDuration(0)).toBe(UNCAPPED_TARGET_DURATION_SEC);
  });

  it("clamps to the allowed range", () => {
    expect(clampTargetDuration(1)).toBe(MIN_TARGET_DURATION_SEC);
    expect(clampTargetDuration(99999)).toBe(MAX_TARGET_DURATION_SEC);
  });

  it("exposes presets that all survive clamping unchanged", () => {
    expect(SHORT_DURATION_PRESETS).toContain(DEFAULT_TARGET_DURATION_SEC);
    for (const preset of SHORT_DURATION_PRESETS) {
      expect(clampTargetDuration(preset)).toBe(preset);
    }
  });

  it("offers the longer buckets and an uncapped option", () => {
    expect(SHORT_DURATION_PRESETS).toContain(90);
    expect(SHORT_DURATION_PRESETS).toContain(120);
    expect(SHORT_DURATION_PRESETS).toContain(UNCAPPED_TARGET_DURATION_SEC);
  });
});

describe("isUncappedDuration", () => {
  it("is true only for the uncapped sentinel", () => {
    expect(isUncappedDuration(UNCAPPED_TARGET_DURATION_SEC)).toBe(true);
    expect(isUncappedDuration(0)).toBe(true);
    expect(isUncappedDuration(60)).toBe(false);
    expect(isUncappedDuration(120)).toBe(false);
  });
});

describe("targetDurationHint", () => {
  it("asks the agent to aim near the chosen length", () => {
    expect(targetDurationHint(90)).toContain("90 seconds");
    expect(targetDurationHint(120)).toContain("120 seconds");
  });

  it("tells the agent it has free rein when uncapped", () => {
    const hint = targetDurationHint(UNCAPPED_TARGET_DURATION_SEC);
    expect(hint).not.toMatch(/\d+ seconds/);
    expect(hint.toLowerCase()).toContain("length");
  });
});
