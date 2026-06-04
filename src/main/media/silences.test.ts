import { describe, expect, it } from "vitest";
import { buildSilenceArgs, parseSilences } from "./silences";

describe("buildSilenceArgs", () => {
  it("decodes audio only and runs silencedetect to a null sink", () => {
    const args = buildSilenceArgs("/src.mp4", { noiseDb: -30, minDuration: 0.15 });
    expect(args).toEqual([
      "-hide_banner",
      "-nostats",
      "-i",
      "/src.mp4",
      "-vn",
      "-af",
      "silencedetect=noise=-30dB:d=0.15",
      "-f",
      "null",
      "-",
    ]);
  });
});

describe("parseSilences", () => {
  const sample = `
[silencedetect @ 0x1] silence_start: 12.5
[silencedetect @ 0x1] silence_end: 12.74 | silence_duration: 0.24
[silencedetect @ 0x1] silence_start: 30.1
[silencedetect @ 0x1] silence_end: 30.85 | silence_duration: 0.75
`;

  it("pairs each silence_start with its silence_end", () => {
    expect(parseSilences(sample)).toEqual([
      { start: 12.5, end: 12.74 },
      { start: 30.1, end: 30.85 },
    ]);
  });

  it("drops a dangling start with no matching end (stream cut off)", () => {
    const out =
      "[silencedetect] silence_start: 5.0\n[silencedetect] silence_start: 9.0\n[silencedetect] silence_end: 9.4";
    expect(parseSilences(out)).toEqual([{ start: 9.0, end: 9.4 }]);
  });

  it("returns [] when there are no silences", () => {
    expect(parseSilences("no silence here")).toEqual([]);
  });
});
