import { describe, expect, it } from "vitest";
import {
  applySettingsPatch,
  DEFAULT_CODEX_MODEL,
  defaultShortPipeConfig,
  normalizeShortPipeConfig,
} from "./config";

describe("normalizeShortPipeConfig", () => {
  it("returns defaults for missing or non-object input", () => {
    expect(normalizeShortPipeConfig(undefined)).toEqual(defaultShortPipeConfig());
    expect(normalizeShortPipeConfig(null)).toEqual(defaultShortPipeConfig());
    expect(normalizeShortPipeConfig(42)).toEqual(defaultShortPipeConfig());
  });

  it("fills style defaults for a legacy config that only has a model", () => {
    const config = normalizeShortPipeConfig({ defaultModel: "openai-codex/gpt-4" });
    expect(config).toEqual({
      version: 1,
      defaultModel: "openai-codex/gpt-4",
      defaultOutputDir: undefined,
      defaultLayout: "center-square",
      defaultTheme: "dark",
      defaultCaptionStyle: "clean",
      defaultTargetDurationSec: 60,
    });
  });

  it("keeps a valid target duration and clamps out-of-range values", () => {
    expect(
      normalizeShortPipeConfig({ defaultTargetDurationSec: 30 }).defaultTargetDurationSec,
    ).toBe(30);
    expect(
      normalizeShortPipeConfig({ defaultTargetDurationSec: 99999 }).defaultTargetDurationSec,
    ).toBe(600);
    expect(
      normalizeShortPipeConfig({ defaultTargetDurationSec: "nope" }).defaultTargetDurationSec,
    ).toBe(60);
    expect(
      normalizeShortPipeConfig({ defaultTargetDurationSec: 0 }).defaultTargetDurationSec,
    ).toBe(0);
  });

  it("keeps valid style defaults and a trimmed output dir", () => {
    const config = normalizeShortPipeConfig({
      defaultModel: "  openai-codex/gpt-5.5  ",
      defaultOutputDir: "  /Users/kun/Shorts  ",
      defaultLayout: "full-bleed",
      defaultTheme: "light",
      defaultCaptionStyle: "karaoke",
    });
    expect(config.defaultModel).toBe("openai-codex/gpt-5.5");
    expect(config.defaultOutputDir).toBe("/Users/kun/Shorts");
    expect(config.defaultLayout).toBe("full-bleed");
    expect(config.defaultTheme).toBe("light");
    expect(config.defaultCaptionStyle).toBe("karaoke");
  });

  it("drops invalid style values back to defaults and blank output dir to undefined", () => {
    const config = normalizeShortPipeConfig({
      defaultModel: "",
      defaultOutputDir: "   ",
      defaultLayout: "weird",
      defaultTheme: "neon",
      defaultCaptionStyle: "fancy",
    });
    expect(config.defaultModel).toBe(DEFAULT_CODEX_MODEL);
    expect(config.defaultOutputDir).toBeUndefined();
    expect(config.defaultLayout).toBe("center-square");
    expect(config.defaultTheme).toBe("dark");
    expect(config.defaultCaptionStyle).toBe("clean");
  });
});

describe("applySettingsPatch", () => {
  it("overlays only the patched fields", () => {
    const next = applySettingsPatch(defaultShortPipeConfig(), {
      defaultLayout: "top-square",
      defaultOutputDir: "/tmp/out",
      defaultTargetDurationSec: 30,
    });
    expect(next.defaultLayout).toBe("top-square");
    expect(next.defaultOutputDir).toBe("/tmp/out");
    expect(next.defaultTheme).toBe("dark");
    expect(next.defaultModel).toBe(DEFAULT_CODEX_MODEL);
    expect(next.defaultTargetDurationSec).toBe(30);
  });

  it("clears the output dir when patched with an empty string", () => {
    const withDir = applySettingsPatch(defaultShortPipeConfig(), { defaultOutputDir: "/tmp/out" });
    const cleared = applySettingsPatch(withDir, { defaultOutputDir: "" });
    expect(cleared.defaultOutputDir).toBeUndefined();
  });
});
